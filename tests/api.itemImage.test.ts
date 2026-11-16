import { eq } from 'drizzle-orm';
import { GET, POST, DELETE } from '@/app/api/links/[id]/image/route';
import { db } from '@/lib/db';
import { linkImages, links } from '@/lib/schema';

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function upload(id: string, file: File | null) {
  const form = new FormData();
  if (file) form.set('file', file);
  return POST(new Request('https://x', { method: 'POST', body: form }), ctx(id));
}

const png = (bytes: number[]) => new File([new Uint8Array(bytes)], 'a.png', { type: 'image/png' });

async function newNote() {
  const [row] = await db
    .insert(links)
    .values({ userId: 'user-a', kind: 'note', notes: [{ id: 'n1', text: 'Tekst', createdAt: '2026-11-13T10:00:00Z' }] })
    .returning();
  return row;
}

test('a picture can be added to a note afterwards and is served', async () => {
  const note = await newNote();
  const res = await upload(note.id, png([1, 2, 3]));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.kind).toBe('note');
  expect(body.imageUrl).toMatch(new RegExp(`^/api/links/${note.id}/image\\?v=\\d+$`));

  const image = await GET(new Request('https://x'), ctx(note.id));
  expect(new Uint8Array(await image.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
});

test('uploading again replaces the picture and gives it a new url', async () => {
  const note = await newNote();
  const first = await (await upload(note.id, png([1]))).json();
  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = await (await upload(note.id, png([9, 9]))).json();
  expect(second.imageUrl).not.toBe(first.imageUrl);
  const stored = await db.select().from(linkImages).where(eq(linkImages.linkId, note.id));
  expect(stored).toHaveLength(1);
  expect(new Uint8Array(stored[0].data)).toEqual(new Uint8Array([9, 9]));
});

test('adding a picture is refused for links, wrong types, a missing file and unknown ids', async () => {
  const [link] = await db.insert(links).values({ userId: 'user-a', url: 'https://a.example' }).returning();
  const note = await newNote();
  expect((await upload(link.id, png([1]))).status).toBe(400);
  expect((await upload(note.id, new File(['x'], 'a.txt', { type: 'text/plain' }))).status).toBe(400);
  expect((await upload(note.id, null)).status).toBe(400);
  expect((await upload('00000000-0000-0000-0000-000000000000', png([1]))).status).toBe(404);
});

test('a note can lose its picture again; an uploaded image cannot', async () => {
  const note = await newNote();
  await upload(note.id, png([1]));
  const res = await DELETE(new Request('https://x', { method: 'DELETE' }), ctx(note.id));
  expect(res.status).toBe(200);
  expect((await res.json()).imageUrl).toBeNull();
  expect(await db.select().from(linkImages).where(eq(linkImages.linkId, note.id))).toHaveLength(0);

  const [image] = await db.insert(links).values({ userId: 'user-a', kind: 'image', title: 'Foto' }).returning();
  await db.insert(linkImages).values({ linkId: image.id, mime: 'image/png', data: Buffer.from([1]) });
  expect((await DELETE(new Request('https://x', { method: 'DELETE' }), ctx(image.id))).status).toBe(400);
});
