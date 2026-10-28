import { afterEach, beforeEach } from 'vitest';
import { POST } from '@/app/api/share/route';
import { db } from '@/lib/db';
import { links } from '@/lib/schema';
import { eq } from 'drizzle-orm';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  after: (cb: () => void) => cb(),
}));
vi.mock('@/lib/processLink', () => ({ processLink: vi.fn().mockResolvedValue(undefined) }));

beforeEach(() => {
  vi.stubEnv('API_TOKEN', 'test-secret');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function req(body: unknown, token = process.env.API_TOKEN) {
  return new Request('https://x/api/share', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
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
