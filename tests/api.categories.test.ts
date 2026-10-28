import { eq } from 'drizzle-orm';
import { PATCH } from '@/app/api/links/[id]/route';
import { GET as getCategories } from '@/app/api/categories/route';
import { db } from '@/lib/db';
import { links } from '@/lib/schema';

function patch(id: string, body: unknown) {
  return PATCH(
    new Request('https://x', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );
}

test('GET /api/categories lists categories, most used first', async () => {
  await db.insert(links).values([
    { url: 'https://a.example', category: 'Koken' },
    { url: 'https://b.example', category: 'Politiek' },
    { url: 'https://c.example', category: 'Politiek' },
    { url: 'https://d.example' },
  ]);
  const body = await (await getCategories()).json();
  expect(body.categories).toEqual(['Politiek', 'Koken']);
});

test('PATCH sets the category and returns the updated row', async () => {
  const [row] = await db.insert(links).values({ url: 'https://a.example', category: 'Tech', status: 'done' }).returning();
  const res = await patch(row.id, { category: 'Wetenschap' });
  expect(res.status).toBe(200);
  expect((await res.json()).category).toBe('Wetenschap');
  const [updated] = await db.select().from(links).where(eq(links.id, row.id));
  expect(updated.category).toBe('Wetenschap');
});

test('PATCH reuses the spelling of an existing category', async () => {
  await db.insert(links).values({ url: 'https://a.example', category: 'Politiek' });
  const [row] = await db.insert(links).values({ url: 'https://b.example', category: 'Tech' }).returning();
  const res = await patch(row.id, { category: '  politiek ' });
  expect((await res.json()).category).toBe('Politiek');
});

test('PATCH with an empty category returns 400 and changes nothing', async () => {
  const [row] = await db.insert(links).values({ url: 'https://a.example', category: 'Tech' }).returning();
  const res = await patch(row.id, { category: '   ' });
  expect(res.status).toBe(400);
  const [unchanged] = await db.select().from(links).where(eq(links.id, row.id));
  expect(unchanged.category).toBe('Tech');
});

test('PATCH on an unknown id returns 404', async () => {
  const res = await patch('00000000-0000-0000-0000-000000000000', { category: 'Tech' });
  expect(res.status).toBe(404);
});
