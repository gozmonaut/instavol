import { PATCH } from '@/app/api/links/[id]/route';
import { GET as getLinksRoute } from '@/app/api/links/route';
import { GET as getTags } from '@/app/api/tags/route';
import { db } from '@/lib/db';
import { links } from '@/lib/schema';
import { normalizeTags } from '@/lib/tags';

function patch(id: string, body: unknown) {
  return PATCH(
    new Request('https://x', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );
}

test('new items start without tags', async () => {
  const [row] = await db.insert(links).values({ url: 'https://a.example' }).returning();
  expect(row.tags).toEqual([]);
});

test('PATCH replaces the tags, cleaned up, and keeps the category', async () => {
  const [row] = await db.insert(links).values({ url: 'https://a.example', category: 'Koken' }).returning();
  const res = await patch(row.id, { tags: ['  weekend ', 'Weekend', '', 'voor   Anna'] });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.tags).toEqual(['weekend', 'voor Anna']);
  expect(body.category).toBe('Koken');
});

test('PATCH rejects tags that are not a list of strings', async () => {
  const [row] = await db.insert(links).values({ url: 'https://a.example' }).returning();
  expect((await patch(row.id, { tags: 'weekend' })).status).toBe(400);
  expect((await patch(row.id, { tags: [1] })).status).toBe(400);
});

test('GET /api/links?tag= only returns items with that tag', async () => {
  await db.insert(links).values([
    { url: 'https://a.example', title: 'Met tag', tags: ['weekend', 'koken'] },
    { url: 'https://b.example', title: 'Zonder tag', tags: ['werk'] },
  ]);
  const body = await (await getLinksRoute(new Request('https://x/api/links?tag=weekend'))).json();
  expect(body.links.map((link: { title: string }) => link.title)).toEqual(['Met tag']);
});

test('GET /api/tags lists tags, most used first', async () => {
  await db.insert(links).values([
    { url: 'https://a.example', tags: ['weekend', 'koken'] },
    { url: 'https://b.example', tags: ['koken'] },
    { url: 'https://c.example' },
  ]);
  const body = await (await getTags()).json();
  expect(body.tags).toEqual(['koken', 'weekend']);
});

test('normalizeTags caps length and count', () => {
  expect(normalizeTags(['x'.repeat(60)])).toEqual(['x'.repeat(40)]);
  expect(normalizeTags(Array.from({ length: 30 }, (_, i) => `tag${i}`))).toHaveLength(20);
});
