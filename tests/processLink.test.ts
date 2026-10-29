import { processLink } from '@/lib/processLink';
import { db } from '@/lib/db';
import { links } from '@/lib/schema';
import { eq } from 'drizzle-orm';

vi.mock('@/lib/extractPage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/extractPage')>();
  return { ...actual, fetchPageText: vi.fn() };
});
vi.mock('@/lib/gemini', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/gemini')>();
  return { ...actual, summarizeAndCategorize: vi.fn(), summarizeUrlAndCategorize: vi.fn() };
});

test('happy path: fetches, summarizes, categorizes, and backfills title', async () => {
  const { fetchPageText } = await import('@/lib/extractPage');
  const { summarizeAndCategorize } = await import('@/lib/gemini');
  vi.mocked(fetchPageText).mockResolvedValue({ title: 'Page Title', text: 'content' });
  vi.mocked(summarizeAndCategorize).mockResolvedValue({ summary: 'Korte samenvatting', category: 'Tech' });

  const [row] = await db.insert(links).values({ url: 'https://example.com' }).returning();
  await processLink(row.id);

  const [updated] = await db.select().from(links).where(eq(links.id, row.id));
  expect(updated.status).toBe('done');
  expect(updated.title).toBe('Page Title');
  expect(updated.summary).toBe('Korte samenvatting');
  expect(updated.category).toBe('Tech');
});

test('fetch failure marks the link failed and preserves url/title', async () => {
  const { fetchPageText } = await import('@/lib/extractPage');
  const { PageFetchError } = await import('@/lib/extractPage');
  const { summarizeUrlAndCategorize, GeminiError } = await import('@/lib/gemini');
  vi.mocked(fetchPageText).mockRejectedValue(new PageFetchError('Geen leesbare inhoud gevonden'));
  vi.mocked(summarizeUrlAndCategorize).mockRejectedValue(new GeminiError('Gemini kon de pagina niet openen'));

  const [row] = await db.insert(links).values({ url: 'https://example.com/paywall', title: 'Oorspronkelijke titel' }).returning();
  await processLink(row.id);

  const [updated] = await db.select().from(links).where(eq(links.id, row.id));
  expect(updated.status).toBe('failed');
  expect(updated.errorMessage).toContain('leesbare inhoud');
  expect(updated.errorMessage).toContain('Gemini kon de pagina niet openen');
  expect(updated.title).toBe('Oorspronkelijke titel');
  expect(updated.url).toBe('https://example.com/paywall');
});

test('passes existing categories to the AI so it can reuse them', async () => {
  const { fetchPageText } = await import('@/lib/extractPage');
  const { summarizeAndCategorize } = await import('@/lib/gemini');
  vi.mocked(fetchPageText).mockResolvedValue({ title: 'Nieuwe pagina', text: 'content' });
  vi.mocked(summarizeAndCategorize).mockResolvedValue({ summary: 'x', category: 'Tech' });

  await db.insert(links).values({ url: 'https://a.example', category: 'Tech', status: 'done' });
  const [row] = await db.insert(links).values({ url: 'https://b.example' }).returning();

  await processLink(row.id);

  expect(summarizeAndCategorize).toHaveBeenCalledWith('content', expect.arrayContaining(['Tech']));
});

test('Gemini failure marks the link failed but keeps the extracted title', async () => {
  const { fetchPageText } = await import('@/lib/extractPage');
  const { summarizeAndCategorize } = await import('@/lib/gemini');
  const { GeminiError } = await import('@/lib/gemini');
  vi.mocked(fetchPageText).mockResolvedValue({ title: 'Geextraheerde titel', text: 'content' });
  vi.mocked(summarizeAndCategorize).mockRejectedValue(new GeminiError('rate limited'));

  const [row] = await db.insert(links).values({ url: 'https://c.example' }).returning();
  await processLink(row.id);

  const [updated] = await db.select().from(links).where(eq(links.id, row.id));
  expect(updated.status).toBe('failed');
  expect(updated.errorMessage).toContain('rate limited');
  expect(updated.title).toBe('Geextraheerde titel');
});

test('cleans up the AI category and reuses the spelling of an existing one', async () => {
  const { fetchPageText } = await import('@/lib/extractPage');
  const { summarizeAndCategorize } = await import('@/lib/gemini');
  vi.mocked(fetchPageText).mockResolvedValue({ title: 'T', text: 'content' });
  vi.mocked(summarizeAndCategorize).mockResolvedValue({ summary: 'x', category: ' politiek. ' });

  await db.insert(links).values({ url: 'https://a.example', category: 'Politiek', status: 'done' });
  const [row] = await db.insert(links).values({ url: 'https://b.example' }).returning();
  await processLink(row.id);

  const [updated] = await db.select().from(links).where(eq(links.id, row.id));
  expect(updated.category).toBe('Politiek');
});

test('offers existing categories most-used first', async () => {
  const { fetchPageText } = await import('@/lib/extractPage');
  const { summarizeAndCategorize } = await import('@/lib/gemini');
  vi.mocked(fetchPageText).mockResolvedValue({ title: 'T', text: 'content' });
  vi.mocked(summarizeAndCategorize).mockResolvedValue({ summary: 'x', category: 'Tech' });

  await db.insert(links).values([
    { url: 'https://a.example', category: 'Koken', status: 'done' },
    { url: 'https://b.example', category: 'Tech', status: 'done' },
    { url: 'https://c.example', category: 'Tech', status: 'done' },
  ]);
  const [row] = await db.insert(links).values({ url: 'https://d.example' }).returning();
  await processLink(row.id);

  expect(vi.mocked(summarizeAndCategorize).mock.lastCall?.[1]).toEqual(['Tech', 'Koken']);
});

test('when we cannot read the page, Gemini opens the URL and its title is used', async () => {
  const { fetchPageText, PageFetchError } = await import('@/lib/extractPage');
  const { summarizeAndCategorize, summarizeUrlAndCategorize } = await import('@/lib/gemini');
  vi.mocked(fetchPageText).mockRejectedValue(new PageFetchError('Pagina niet beschikbaar (HTTP 403)'));
  vi.mocked(summarizeUrlAndCategorize).mockResolvedValue({ title: 'Webshop', summary: 'Een webshop voor fietsen.', category: 'Winkelen' });

  const [row] = await db.insert(links).values({ url: 'https://shop.example' }).returning();
  await processLink(row.id);

  const [updated] = await db.select().from(links).where(eq(links.id, row.id));
  expect(updated.status).toBe('done');
  expect(updated.title).toBe('Webshop');
  expect(updated.summary).toBe('Een webshop voor fietsen.');
  expect(updated.category).toBe('Winkelen');
  expect(summarizeUrlAndCategorize).toHaveBeenCalledWith('https://shop.example', expect.any(Array));
  expect(vi.mocked(summarizeAndCategorize).mock.calls.some(([text]) => text === 'https://shop.example')).toBe(false);
});

test('a blocked address is never handed to Gemini', async () => {
  const { fetchPageText, DisallowedHostError } = await import('@/lib/extractPage');
  const { summarizeUrlAndCategorize } = await import('@/lib/gemini');
  vi.mocked(fetchPageText).mockRejectedValue(new DisallowedHostError());
  vi.mocked(summarizeUrlAndCategorize).mockClear();

  const [row] = await db.insert(links).values({ url: 'http://169.254.169.254/' }).returning();
  await processLink(row.id);

  const [updated] = await db.select().from(links).where(eq(links.id, row.id));
  expect(updated.status).toBe('failed');
  expect(updated.errorMessage).toBe('Dit adres mag niet opgehaald worden');
  expect(summarizeUrlAndCategorize).not.toHaveBeenCalled();
});
