import { POST } from '@/app/api/links/[id]/notes/route';
import { DELETE } from '@/app/api/links/[id]/notes/[noteId]/route';
import { db } from '@/lib/db';
import { links, type LinkRow } from '@/lib/schema';

function addNote(id: string, body: unknown) {
  return POST(
    new Request('https://x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );
}

function deleteNote(id: string, noteId: string) {
  return DELETE(new Request('https://x', { method: 'DELETE' }), { params: Promise.resolve({ id, noteId }) });
}

test('new items start without notes', async () => {
  const [row] = await db.insert(links).values({ url: 'https://a.example' }).returning();
  expect(row.notes).toEqual([]);
});

test('POST adds notes in order, trimmed', async () => {
  const [row] = await db.insert(links).values({ url: 'https://a.example', tags: ['koken'] }).returning();
  expect((await addNote(row.id, { text: '  Minder zout  ' })).status).toBe(201);
  const body: LinkRow = await (await addNote(row.id, { text: 'Lekker met rijst' })).json();
  expect(body.notes.map((note) => note.text)).toEqual(['Minder zout', 'Lekker met rijst']);
  expect(body.notes[0].id).not.toBe(body.notes[1].id);
  expect(body.tags).toEqual(['koken']);
});

test('POST rejects an empty note and an unknown item', async () => {
  const [row] = await db.insert(links).values({ url: 'https://a.example' }).returning();
  expect((await addNote(row.id, { text: '   ' })).status).toBe(400);
  expect((await addNote(row.id, {})).status).toBe(400);
  expect((await addNote('00000000-0000-0000-0000-000000000000', { text: 'x' })).status).toBe(404);
});

test('DELETE removes only that note and keeps the order', async () => {
  const [row] = await db.insert(links).values({ url: 'https://a.example' }).returning();
  for (const text of ['een', 'twee', 'drie']) await addNote(row.id, { text });
  const [{ notes }] = await db.select().from(links);

  const res = await deleteNote(row.id, notes[1].id);
  expect(res.status).toBe(200);
  const body: LinkRow = await res.json();
  expect(body.notes.map((note) => note.text)).toEqual(['een', 'drie']);

  const last: LinkRow = await (await deleteNote(row.id, notes[0].id)).json();
  await deleteNote(row.id, notes[2].id);
  expect(last.notes.map((note) => note.text)).toEqual(['drie']);
  const [after] = await db.select().from(links);
  expect(after.notes).toEqual([]);
});
