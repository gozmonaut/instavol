import { eq } from 'drizzle-orm';
import { POST } from '@/app/api/links/recategorize/route';
import { db } from '@/lib/db';
import { links } from '@/lib/schema';
import { categorize } from '@/lib/gemini';

vi.mock('@/lib/gemini', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/gemini')>();
  return { ...actual, categorize: vi.fn() };
});

const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

function run(body: unknown = {}) {
  return POST(
    new Request('https://x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  );
}

beforeEach(() => {
  vi.mocked(categorize).mockReset();
});

test('recategorizes done items oldest first in batches of 5, and reports what remains', async () => {
  vi.mocked(categorize).mockResolvedValue('politiek');
  for (let i = 0; i < 7; i++) {
    await db.insert(links).values({ userId: 'user-a',
      url: `https://${i}.example`,
      title: `Artikel ${i}`,
      summary: `Samenvatting ${i}`,
      category: 'Oud rommelig label',
      status: 'done',
      createdAt: new Date(hourAgo.getTime() + i * 1000),
      updatedAt: hourAgo,
    });
  }
  await db.insert(links).values({ userId: 'user-a', url: 'https://pending.example', status: 'pending', updatedAt: hourAgo });

  const first = await (await run()).json();
  expect(first).toMatchObject({ processed: 5, remaining: 2 });
  expect(first.since).toBeDefined();
  expect(vi.mocked(categorize).mock.calls[0]).toEqual(['Artikel 0', 'Samenvatting 0', []]);

  const second = await (await run({ since: first.since })).json();
  expect(second).toMatchObject({ processed: 2, remaining: 0 });

  const rows = await db.select().from(links).where(eq(links.status, 'done'));
  expect(rows.every((r) => r.category === 'Politiek')).toBe(true);
  const [pending] = await db.select().from(links).where(eq(links.status, 'pending'));
  expect(pending.category).toBeNull();
});

test('only categories created during this run are offered for reuse, not the old ones', async () => {
  vi.mocked(categorize).mockResolvedValueOnce('Tech').mockResolvedValueOnce('Tech');
  await db.insert(links).values([
    { userId: 'user-a', url: 'https://a.example', title: 'A', status: 'done', category: 'Oud', createdAt: hourAgo, updatedAt: hourAgo },
    { userId: 'user-a', url: 'https://b.example', title: 'B', status: 'done', category: 'Oud', createdAt: new Date(hourAgo.getTime() + 1000), updatedAt: hourAgo },
  ]);
  await run();
  expect(vi.mocked(categorize).mock.calls[0][2]).toEqual([]);
  expect(vi.mocked(categorize).mock.calls[1][2]).toEqual(['Tech']);
});

test('a Gemini failure stops the batch with 502 and leaves the item for the next attempt', async () => {
  vi.mocked(categorize).mockRejectedValue(new Error('Gemini-verzoek mislukt (HTTP 503)'));
  const [row] = await db
    .insert(links)
    .values({ userId: 'user-a', url: 'https://a.example', title: 'A', status: 'done', category: 'Oud', updatedAt: hourAgo })
    .returning();
  const res = await run();
  expect(res.status).toBe(502);
  expect((await res.json()).error).toContain('503');
  const [unchanged] = await db.select().from(links).where(eq(links.id, row.id));
  expect(unchanged.category).toBe('Oud');
});

test('loose notes and uploaded images are left alone: nothing about them is sent to Gemini', async () => {
  vi.mocked(categorize).mockResolvedValue('politiek');
  await db.insert(links).values([
    { userId: 'user-a', kind: 'link', url: 'https://a.example', title: 'Artikel', summary: 'S', category: 'Oud', status: 'done', updatedAt: hourAgo },
    { userId: 'user-a', kind: 'note', title: 'Bel de loodgieter over de kraan', category: 'Notities', status: 'done', updatedAt: hourAgo },
    { userId: 'user-a', kind: 'image', title: 'Foto', category: 'Koken', status: 'done', updatedAt: hourAgo },
  ]);

  const result = await (await run()).json();

  expect(result).toMatchObject({ processed: 1, remaining: 0 });
  expect(vi.mocked(categorize)).toHaveBeenCalledTimes(1);
  expect(vi.mocked(categorize).mock.calls[0][0]).toBe('Artikel');
  const rows = await db.select().from(links);
  expect(rows.find((row) => row.kind === 'note')?.category).toBe('Notities');
  expect(rows.find((row) => row.kind === 'image')?.category).toBe('Koken');
});
