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
  const [row] = await db.insert(links).values({ userId: 'user-a', url: 'https://a.example' }).returning();
  expect(row.tags).toEqual([]);
});

test('PATCH replaces the tags, cleaned up, and keeps the category', async () => {
  const [row] = await db.insert(links).values({ userId: 'user-a', url: 'https://a.example', category: 'Koken' }).returning();
  const res = await patch(row.id, { tags: ['  weekend ', 'Weekend', '', 'voor   Anna'] });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.tags).toEqual(['weekend', 'voor Anna']);
  expect(body.category).toBe('Koken');
});

test('PATCH rejects tags that are not a list of strings', async () => {
  const [row] = await db.insert(links).values({ userId: 'user-a', url: 'https://a.example' }).returning();
  expect((await patch(row.id, { tags: 'weekend' })).status).toBe(400);
  expect((await patch(row.id, { tags: [1] })).status).toBe(400);
});

test('GET /api/links?tag= only returns items with that tag', async () => {
  await db.insert(links).values([
    { userId: 'user-a', url: 'https://a.example', title: 'Met tag', tags: ['weekend', 'koken'] },
    { userId: 'user-a', url: 'https://b.example', title: 'Zonder tag', tags: ['werk'] },
  ]);
  const body = await (await getLinksRoute(new Request('https://x/api/links?tag=weekend'))).json();
  expect(body.links.map((link: { title: string }) => link.title)).toEqual(['Met tag']);
});

test('GET /api/tags lists tags, most used first', async () => {
  await db.insert(links).values([
    { userId: 'user-a', url: 'https://a.example', tags: ['weekend', 'koken'] },
    { userId: 'user-a', url: 'https://b.example', tags: ['koken'] },
    { userId: 'user-a', url: 'https://c.example' },
  ]);
  const body = await (await getTags()).json();
  expect(body.tags).toEqual(['koken', 'weekend']);
});

test('normalizeTags caps length and count', () => {
  expect(normalizeTags(['x'.repeat(60)])).toEqual(['x'.repeat(40)]);
  expect(normalizeTags(Array.from({ length: 30 }, (_, i) => `tag${i}`))).toHaveLength(20);
});

test('PATCH with only a title renames the item and keeps its category', async () => {
  const [row] = await db.insert(links).values({ userId: 'user-a', kind: 'note', title: 'Oud', category: 'Huis' }).returning();
  const res = await patch(row.id, { title: '  Nieuwe naam ' });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.title).toBe('Nieuwe naam');
  expect(body.category).toBe('Huis');
});

test('PATCH rejects an empty or too long title', async () => {
  const [row] = await db.insert(links).values({ userId: 'user-a', url: 'https://a.example' }).returning();
  expect((await patch(row.id, { title: '   ' })).status).toBe(400);
  expect((await patch(row.id, { title: 'x'.repeat(201) })).status).toBe(400);
});

test('PATCH with text changes the text of a loose note and keeps title and category', async () => {
  const [row] = await db
    .insert(links)
    .values({ userId: 'user-a', kind: 'note', title: 'Kraan', category: 'Huis', notes: [{ id: 'n1', text: 'Oud', createdAt: '2026-11-13T10:00:00Z' }] })
    .returning();
  const res = await patch(row.id, { text: '  Nieuwe tekst ' });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.notes).toEqual([{ id: 'n1', text: 'Nieuwe tekst', createdAt: '2026-11-13T10:00:00Z' }]);
  expect(body.title).toBe('Kraan');
  expect(body.category).toBe('Huis');
});

test('PATCH with text is refused for links and for empty or too long text', async () => {
  const [link] = await db.insert(links).values({ userId: 'user-a', url: 'https://a.example' }).returning();
  expect((await patch(link.id, { text: 'x' })).status).toBe(400);
  const [note] = await db
    .insert(links)
    .values({ userId: 'user-a', kind: 'note', notes: [{ id: 'n1', text: 'Oud', createdAt: '2026-11-13T10:00:00Z' }] })
    .returning();
  expect((await patch(note.id, { text: '  ' })).status).toBe(400);
  expect((await patch(note.id, { text: 'x'.repeat(2001) })).status).toBe(400);
});

test('PATCH with text gives an uploaded image a description, and empty text removes it again', async () => {
  const [row] = await db.insert(links).values({ userId: 'user-a', kind: 'image', title: 'Foto' }).returning();
  const set = await (await patch(row.id, { title: 'Bonnetje', text: ' Voor de belasting ' })).json();
  expect(set.title).toBe('Bonnetje');
  expect(set.notes).toHaveLength(1);
  expect(set.notes[0].text).toBe('Voor de belasting');
  const cleared = await (await patch(row.id, { text: '' })).json();
  expect(cleared.notes).toEqual([]);
});

test('an image without a category gets "Notities" when it gets a note, reusing an existing spelling', async () => {
  await db.insert(links).values({ userId: 'user-a', url: 'https://a.example', category: 'notities' });
  const [row] = await db.insert(links).values({ userId: 'user-a', kind: 'image', title: 'Foto' }).returning();
  const body = await (await patch(row.id, { text: 'Voor later' })).json();
  expect(body.category).toBe('notities');
});

test('an image keeps its own category when it gets a note, and an empty note adds none', async () => {
  const [withCategory] = await db.insert(links).values({ userId: 'user-a', kind: 'image', title: 'Foto', category: 'Koken' }).returning();
  expect((await (await patch(withCategory.id, { text: 'Recept' })).json()).category).toBe('Koken');
  const [plain] = await db.insert(links).values({ userId: 'user-a', kind: 'image', title: 'Foto 2' }).returning();
  expect((await (await patch(plain.id, { text: '  ' })).json()).category).toBeNull();
});
