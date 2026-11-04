import { POST } from '@/app/api/links/[id]/highlights/route';
import { DELETE } from '@/app/api/links/[id]/highlights/[highlightId]/route';
import { db } from '@/lib/db';
import { links, type LinkRow } from '@/lib/schema';

function addHighlight(id: string, body: unknown) {
  return POST(
    new Request('https://x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );
}

function deleteHighlight(id: string, highlightId: string) {
  return DELETE(new Request('https://x', { method: 'DELETE' }), { params: Promise.resolve({ id, highlightId }) });
}

test('new items start without highlights', async () => {
  const [row] = await db.insert(links).values({ url: 'https://a.example' }).returning();
  expect(row.highlights).toEqual([]);
});

test('POST adds highlights in order with their surroundings', async () => {
  const [row] = await db.insert(links).values({ url: 'https://a.example', tags: ['koken'] }).returning();
  expect((await addHighlight(row.id, { text: '  eerste  ', prefix: 'voor ', suffix: ' na' })).status).toBe(201);
  const body: LinkRow = await (await addHighlight(row.id, { text: 'tweede' })).json();
  expect(body.highlights.map((h) => h.text)).toEqual(['eerste', 'tweede']);
  expect(body.highlights[0]).toMatchObject({ prefix: 'voor ', suffix: ' na' });
  expect(body.highlights[1]).toMatchObject({ prefix: '', suffix: '' });
  expect(body.highlights[0].id).not.toBe(body.highlights[1].id);
  expect(body.tags).toEqual(['koken']);
});

test('POST rejects empty text and an unknown item', async () => {
  const [row] = await db.insert(links).values({ url: 'https://a.example' }).returning();
  expect((await addHighlight(row.id, { text: '   ' })).status).toBe(400);
  expect((await addHighlight(row.id, {})).status).toBe(400);
  expect((await addHighlight('00000000-0000-0000-0000-000000000000', { text: 'x' })).status).toBe(404);
});

test('DELETE removes only that highlight and keeps the order', async () => {
  const [row] = await db.insert(links).values({ url: 'https://a.example' }).returning();
  for (const text of ['een', 'twee', 'drie']) await addHighlight(row.id, { text });
  const [{ highlights }] = await db.select().from(links);

  const res = await deleteHighlight(row.id, highlights[1].id);
  expect(res.status).toBe(200);
  const body: LinkRow = await res.json();
  expect(body.highlights.map((h) => h.text)).toEqual(['een', 'drie']);
  expect((await deleteHighlight('00000000-0000-0000-0000-000000000000', highlights[0].id)).status).toBe(404);
});

test('POST does not add the exact same highlight twice', async () => {
  const [row] = await db.insert(links).values({ url: 'https://a.example' }).returning();
  await addHighlight(row.id, { text: 'zelfde', prefix: 'a ', suffix: ' b' });
  const res = await addHighlight(row.id, { text: 'zelfde', prefix: 'a ', suffix: ' b' });
  expect(res.status).toBe(200);
  const body: LinkRow = await res.json();
  expect(body.highlights).toHaveLength(1);
});

test('POST with replaces swaps the merged highlights for the new one', async () => {
  const [row] = await db.insert(links).values({ url: 'https://a.example' }).returning();
  for (const text of ['een', 'twee', 'drie']) await addHighlight(row.id, { text });
  const [{ highlights }] = await db.select().from(links);
  const body: LinkRow = await (
    await addHighlight(row.id, { text: 'een twee', replaces: [highlights[0].id, highlights[1].id] })
  ).json();
  expect(body.highlights.map((h) => h.text)).toEqual(['drie', 'een twee']);
});
