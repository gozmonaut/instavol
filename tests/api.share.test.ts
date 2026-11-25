import { beforeEach } from 'vitest';
import { POST } from '@/app/api/share/route';
import { db } from '@/lib/db';
import { links } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { addMember } from '@/lib/members';
import { createShareToken } from '@/lib/shareTokens';
import { signInAs } from '@/tests/helpers/user';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  after: (cb: () => void) => cb(),
}));
vi.mock('@/lib/processLink', () => ({ processLink: vi.fn().mockResolvedValue(undefined) }));

let userToken: string;

beforeEach(async () => {
  await addMember('user-b');
  userToken = await createShareToken('user-b');
});

function req(body: unknown, token: string | null = userToken) {
  return new Request('https://x/api/share', {
    method: 'POST',
    headers: { ...(token === null ? {} : { Authorization: `Bearer ${token}` }), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('valid request creates a pending link and returns 201', async () => {
  const res = await POST(req({ url: 'https://example.com/a' }));
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body.status).toBe('pending');
  const [row] = await db.select().from(links).where(eq(links.id, body.id));
  expect(row.url).toBe('https://example.com/a');
});

test('the link is saved for the owner of the token, not for whoever is signed in on the website', async () => {
  const res = await POST(req({ url: 'https://example.com/owner' }));
  const [row] = await db.select().from(links).where(eq(links.id, (await res.json()).id));
  expect(row.userId).toBe('user-b');
});

test.each([['an empty token', ''], ['no Authorization header', null]])('%s returns 401 and inserts nothing', async (_name, token) => {
  const res = await POST(req({ url: 'https://example.com/b' }, token));
  expect(res.status).toBe(401);
  expect(await db.select().from(links)).toHaveLength(0);
});

test('the old shared API_TOKEN no longer gives access', async () => {
  vi.stubEnv('API_TOKEN', 'test-secret');
  const res = await POST(req({ url: 'https://example.com/b' }, 'test-secret'));
  vi.unstubAllEnvs();
  expect(res.status).toBe(401);
  expect(await db.select().from(links)).toHaveLength(0);
});

test('invalid url returns 400 and inserts nothing', async () => {
  const before = (await db.select().from(links)).length;
  const res = await POST(req({ url: 'not-a-url' }));
  expect(res.status).toBe(400);
  expect((await db.select().from(links)).length).toBe(before);
});

test('url containing whitespace (e.g. two urls joined by a newline) returns 400 and inserts nothing', async () => {
  const before = (await db.select().from(links)).length;
  const res = await POST(req({ url: 'https://example.com/a\nhttps://example.com/a' }));
  expect(res.status).toBe(400);
  expect((await db.select().from(links)).length).toBe(before);
});

test('surrounding whitespace is trimmed before saving', async () => {
  const res = await POST(req({ url: '  https://example.com/trim\n' }));
  expect(res.status).toBe(201);
  const body = await res.json();
  const [row] = await db.select().from(links).where(eq(links.id, body.id));
  expect(row.url).toBe('https://example.com/trim');
});

test('missing or wrong token returns 401 and inserts nothing', async () => {
  const before = (await db.select().from(links)).length;
  const res = await POST(req({ url: 'https://example.com/b' }, 'wrong-token'));
  expect(res.status).toBe(401);
  expect((await db.select().from(links)).length).toBe(before);
});

test('saving the same url twice creates two separate rows', async () => {
  const res1 = await POST(req({ url: 'https://example.com/dup' }));
  const res2 = await POST(req({ url: 'https://example.com/dup' }));
  expect(res1.status).toBe(201);
  expect(res2.status).toBe(201);
  const body1 = await res1.json();
  const body2 = await res2.json();
  expect(body1.id).not.toBe(body2.id);
});

function imageReq(file: File | null, token: string = userToken) {
  const form = new FormData();
  if (file) form.set('file', file);
  return new Request('https://x/api/share', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
}

test('an uploaded image is stored and served, without a url', async () => {
  const { GET } = await import('@/app/api/links/[id]/image/route');
  const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
  const res = await POST(imageReq(new File([bytes], 'shot.png', { type: 'image/png' })));
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body.kind).toBe('image');
  expect(body.status).toBe('done');
  expect(body.url).toBeNull();
  expect(body.imageUrl).toBe(`/api/links/${body.id}/image`);

  // Whoever shared it (the owner of the token) can open it.
  signInAs('user-b');
  const image = await GET(new Request('https://x'), { params: Promise.resolve({ id: body.id }) });
  expect(image.status).toBe(200);
  expect(image.headers.get('content-type')).toBe('image/png');
  expect(new Uint8Array(await image.arrayBuffer())).toEqual(bytes);
});

test('image upload rejects a wrong type, a missing file and a missing token', async () => {
  expect((await POST(imageReq(new File(['x'], 'a.txt', { type: 'text/plain' })))).status).toBe(400);
  expect((await POST(imageReq(null))).status).toBe(400);
  expect((await POST(imageReq(new File(['x'], 'a.png', { type: 'image/png' }), 'wrong'))).status).toBe(401);
  expect(await db.select().from(links)).toHaveLength(0);
});

test('image upload rejects a file over 4 MB', async () => {
  const big = new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' });
  expect((await POST(imageReq(big))).status).toBe(400);
});

test('text without a url creates a finished note without asking Gemini', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  const res = await POST(req({ text: '  Bel de loodgieter over de kraan\nen vraag naar de prijs  ' }));
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body).toMatchObject({
    kind: 'note',
    url: null,
    status: 'done',
    title: 'Bel de loodgieter over de kraan',
    category: 'Notities',
  });
  expect(body.notes[0].text).toBe('Bel de loodgieter over de kraan\nen vraag naar de prijs');
  expect(fetchSpy).not.toHaveBeenCalled();
  fetchSpy.mockRestore();
});

test('a note takes an own title when given, and reuses an existing spelling of the category', async () => {
  await db.insert(links).values({ userId: 'user-b', url: 'https://a.example', category: 'notities' });
  const body = await (await POST(req({ text: 'Iets', title: 'Mijn titel' }))).json();
  expect(body.title).toBe('Mijn titel');
  expect(body.category).toBe('notities');
});

test('an empty or too long note returns 400', async () => {
  expect((await POST(req({ text: '   ' }))).status).toBe(400);
  expect((await POST(req({ text: 'x'.repeat(2001) }))).status).toBe(400);
});

test('url with text (a Safari page with selected text) saves the link with the text as its first note', async () => {
  const res = await POST(req({ url: 'https://example.com/sel', text: '  Een mooie zin  ' }));
  expect(res.status).toBe(201);
  const [row] = await db.select().from(links).where(eq(links.id, (await res.json()).id));
  expect(row.kind).toBe('link');
  expect(row.notes).toHaveLength(1);
  expect(row.notes[0].text).toBe('Een mooie zin');
});

test.each([['empty', ''], ['whitespace only', '   \n'], ['not a string', 42]])('url with %s text saves the link without notes', async (_name, text) => {
  const res = await POST(req({ url: 'https://example.com/empty-sel', text }));
  expect(res.status).toBe(201);
  const [row] = await db.select().from(links).where(eq(links.id, (await res.json()).id));
  expect(row.notes).toEqual([]);
});

test('url with text over 2000 characters returns 400 and inserts nothing', async () => {
  const res = await POST(req({ url: 'https://example.com/long', text: 'a'.repeat(2001) }));
  expect(res.status).toBe(400);
  expect(await db.select().from(links)).toHaveLength(0);
});
