import { beforeEach, expect, test, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { DELETE as deleteImage, GET as getImage, POST as postImage } from '@/app/api/links/[id]/image/route';
import { PATCH as patchLink } from '@/app/api/links/[id]/route';
import { POST as postLink } from '@/app/api/links/route';
import { POST as share } from '@/app/api/share/route';
import { db } from '@/lib/db';
import { addMember } from '@/lib/members';
import { linkImages, links, type LinkRow } from '@/lib/schema';
import { createShareToken } from '@/lib/shareTokens';
import { signInAs } from '@/tests/helpers/user';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  after: () => {},
}));
vi.mock('@/lib/processLink', () => ({ processLink: vi.fn().mockResolvedValue(undefined) }));

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
let mine: LinkRow;
let theirs: LinkRow;

beforeEach(async () => {
  [mine] = await db.insert(links).values({ userId: 'user-a', kind: 'note', title: 'Mijn notitie', status: 'done', category: 'Notities' }).returning();
  [theirs] = await db
    .insert(links)
    .values({ userId: 'user-b', kind: 'note', title: 'Hun notitie', status: 'done', category: 'NOTITIES', imageUrl: '/x', notes: [{ id: 'n1', text: 'geheim', createdAt: '2026-01-01T00:00:00Z' }] })
    .returning();
  await db.insert(linkImages).values([
    { linkId: mine.id, mime: 'image/png', data: PNG },
    { linkId: theirs.id, mime: 'image/png', data: PNG },
  ]);
  signInAs('user-a');
});

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (body: unknown, method = 'POST') =>
  new Request('https://x/api', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
function upload(extra: Record<string, string> = {}): Request {
  const form = new FormData();
  form.set('file', new File([PNG], 'foto.png', { type: 'image/png' }));
  for (const [key, value] of Object.entries(extra)) form.set(key, value);
  return new Request('https://x/api', { method: 'POST', body: form });
}
async function theirImageCount(): Promise<number> {
  return (await db.select().from(linkImages).where(eq(linkImages.linkId, theirs.id))).length;
}
async function theirRow(): Promise<LinkRow> {
  return (await db.select().from(links).where(eq(links.id, theirs.id)))[0];
}

test('you can open the picture of your own item', async () => {
  const res = await getImage(new Request('https://x/api'), params(mine.id));
  expect(res.status).toBe(200);
  expect(res.headers.get('Content-Type')).toBe('image/png');
});

test('the picture of someone else\'s item is a 404', async () => {
  expect((await getImage(new Request('https://x/api'), params(theirs.id))).status).toBe(404);
});

test('adding a picture to someone else\'s note is a 404 and changes nothing', async () => {
  const res = await postImage(upload(), params(theirs.id));
  expect(res.status).toBe(404);
  expect(await theirRow()).toEqual(theirs);
  expect(await theirImageCount()).toBe(1);
});

test('removing the picture of someone else\'s note is a 404 and keeps the picture', async () => {
  const res = await deleteImage(new Request('https://x/api', { method: 'DELETE' }), params(theirs.id));
  expect(res.status).toBe(404);
  expect(await theirRow()).toEqual(theirs);
  expect(await theirImageCount()).toBe(1);
});

test('changing the text of someone else\'s note is a 404 and changes nothing', async () => {
  const res = await patchLink(json({ text: 'overschreven' }, 'PATCH'), params(theirs.id));
  expect(res.status).toBe(404);
  expect(await theirRow()).toEqual(theirs);
});

test.each([
  ['GET image', () => getImage(new Request('https://x/api'), params(mine.id))],
  ['POST image', () => postImage(upload(), params(mine.id))],
  ['DELETE image', () => deleteImage(new Request('https://x/api', { method: 'DELETE' }), params(mine.id))],
  ['POST note', () => postLink(json({ text: 'nieuw' }))],
  ['POST image upload', () => postLink(upload())],
])('%s without a signed-in user is a 401', async (_name, call) => {
  signInAs(null);
  expect((await call()).status).toBe(401);
});

test.each([
  ['GET image', () => getImage(new Request('https://x/api'), params(mine.id))],
  ['POST note', () => postLink(json({ text: 'nieuw' }))],
])('%s for an account that was never invited is a 401', async (_name, call) => {
  signInAs('user-c', { member: false });
  expect((await call()).status).toBe(401);
});

test('a loose note from the website belongs to its writer and only borrows that person\'s category spelling', async () => {
  const res = await postLink(json({ text: 'boodschappen' }));
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body.userId).toBe('user-a');
  // user-b has "NOTITIES"; user-a's own existing "Notities" is the spelling that is reused.
  expect(body.category).toBe('Notities');
});

test('a note from someone with no categories of their own gets the plain spelling, not another user\'s', async () => {
  await addMember('user-d');
  signInAs('user-d');
  const body = await (await postLink(json({ text: 'iets' }))).json();
  expect(body.userId).toBe('user-d');
  expect(body.category).toBe('Notities');
});

test('an image uploaded on the website belongs to whoever uploaded it', async () => {
  const body = await (await postLink(upload({ title: 'Screenshot' }))).json();
  expect(body.userId).toBe('user-a');
  expect(body.kind).toBe('image');
});

async function shareAs(userId: string, request: (token: string) => Request): Promise<Response> {
  await addMember(userId);
  return share(request(await createShareToken(userId)));
}
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

test('a note shared from the share menu goes to the owner of the token', async () => {
  const res = await shareAs('user-b', (token) =>
    new Request('https://x/api/share', { method: 'POST', headers: { ...bearer(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'via snelkoppeling' }) }),
  );
  expect(res.status).toBe(201);
  expect((await res.json()).userId).toBe('user-b');
});

test('a picture shared from the share menu goes to the owner of the token', async () => {
  const res = await shareAs('user-b', (token) => {
    const form = new FormData();
    form.set('file', new File([PNG], 'foto.png', { type: 'image/png' }));
    return new Request('https://x/api/share', { method: 'POST', headers: bearer(token), body: form });
  });
  expect(res.status).toBe(201);
  expect((await res.json()).userId).toBe('user-b');
});
