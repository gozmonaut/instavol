import { GET } from '@/app/api/links/[id]/content/route';
import { DELETE } from '@/app/api/links/[id]/route';
import { db } from '@/lib/db';
import { linkContents, links } from '@/lib/schema';

test('returns the saved article html', async () => {
  const [row] = await db.insert(links).values({ url: 'https://a.example' }).returning();
  await db.insert(linkContents).values({ linkId: row.id, html: '<p>Tekst</p>' });
  const res = await GET(new Request('https://x'), { params: Promise.resolve({ id: row.id }) });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ html: '<p>Tekst</p>', recipe: false });
});

test('tells the reader when the saved article is a recipe', async () => {
  const [row] = await db.insert(links).values({ url: 'https://a.example' }).returning();
  await db.insert(linkContents).values({ linkId: row.id, html: '<div data-recipe=""><h2>Ingrediënten</h2></div>' });
  const res = await GET(new Request('https://x'), { params: Promise.resolve({ id: row.id }) });
  expect((await res.json()).recipe).toBe(true);
});

test('404 when the item has no saved article', async () => {
  const [row] = await db.insert(links).values({ url: 'https://a.example' }).returning();
  const res = await GET(new Request('https://x'), { params: Promise.resolve({ id: row.id }) });
  expect(res.status).toBe(404);
});

test('deleting an item also deletes its saved article', async () => {
  const [row] = await db.insert(links).values({ url: 'https://a.example' }).returning();
  await db.insert(linkContents).values({ linkId: row.id, html: '<p>Tekst</p>' });
  await DELETE(new Request('https://x'), { params: Promise.resolve({ id: row.id }) });
  expect(await db.select().from(linkContents)).toHaveLength(0);
});
