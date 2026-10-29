import { eq } from 'drizzle-orm';
import { POST } from '@/app/api/links/refresh-reader/route';
import { db } from '@/lib/db';
import { fetchPageText, PageFetchError } from '@/lib/extractPage';
import { summarizeAndCategorize } from '@/lib/gemini';
import { linkContents, links } from '@/lib/schema';

vi.mock('@/lib/extractPage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/extractPage')>();
  return { ...actual, fetchPageText: vi.fn() };
});
vi.mock('@/lib/gemini', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/gemini')>();
  return { ...actual, summarizeAndCategorize: vi.fn(), summarizeUrlAndCategorize: vi.fn() };
});

const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

function run(body: unknown = {}) {
  return POST(
    new Request('https://x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  );
}

beforeEach(() => {
  vi.mocked(fetchPageText).mockReset();
  vi.mocked(fetchPageText).mockResolvedValue({
    title: 'Nieuwe titel',
    text: 'content',
    imageUrl: 'https://cdn.example/beeld.jpg',
    article: { html: '<p>Tekst</p>', byline: 'Jan', publishedAt: null, readingMinutes: 3 },
  });
});

test('saves reader content for done items in batches of 5, without Gemini or touching summary and category', async () => {
  for (let i = 0; i < 7; i++) {
    await db.insert(links).values({
      url: `https://${i}.example`,
      title: `Artikel ${i}`,
      summary: `Samenvatting ${i}`,
      category: 'Tech',
      status: 'done',
      createdAt: new Date(hourAgo.getTime() + i * 1000),
      updatedAt: hourAgo,
    });
  }
  await db.insert(links).values({ url: 'https://pending.example', status: 'pending', updatedAt: hourAgo });

  const first = await (await run()).json();
  expect(first).toMatchObject({ processed: 5, remaining: 2, failed: [] });
  const second = await (await run({ since: first.since })).json();
  expect(second).toMatchObject({ processed: 2, remaining: 0 });

  const [item] = await db.select().from(links).where(eq(links.url, 'https://0.example'));
  expect(item).toMatchObject({
    title: 'Artikel 0',
    summary: 'Samenvatting 0',
    category: 'Tech',
    imageUrl: 'https://cdn.example/beeld.jpg',
    readingMinutes: 3,
  });
  expect(await db.select().from(linkContents)).toHaveLength(7);
  expect(fetchPageText).not.toHaveBeenCalledWith('https://pending.example');
  expect(summarizeAndCategorize).not.toHaveBeenCalled();
});

test('a page that cannot be read is reported, counted as done and keeps its data', async () => {
  vi.mocked(fetchPageText).mockRejectedValue(new PageFetchError('Pagina niet beschikbaar (HTTP 403)'));
  await db.insert(links).values({ url: 'https://paywall.example', summary: 'Blijft', status: 'done', updatedAt: hourAgo });

  const result = await (await run()).json();
  expect(result).toMatchObject({
    processed: 1,
    remaining: 0,
    failed: [{ url: 'https://paywall.example', error: 'Pagina niet beschikbaar (HTTP 403)' }],
  });
  const [item] = await db.select().from(links);
  expect(item.summary).toBe('Blijft');
  expect(item.readingMinutes).toBeNull();
});
