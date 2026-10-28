import { eq } from 'drizzle-orm';
import { POST } from '@/app/api/links/route';
import { db } from '@/lib/db';
import { links } from '@/lib/schema';
import { processLink } from '@/lib/processLink';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  after: (cb: () => void) => cb(),
}));
vi.mock('@/lib/processLink', () => ({ processLink: vi.fn().mockResolvedValue(undefined) }));

function req(body: unknown) {
  return new Request('https://x/api/links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('valid url creates a pending link, starts processing and returns the full row with 201', async () => {
  const res = await POST(req({ url: '  https://example.com/pasted\n' }));
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body.status).toBe('pending');
  expect(body.url).toBe('https://example.com/pasted');
  expect(body.createdAt).toBeDefined();
  const [row] = await db.select().from(links).where(eq(links.id, body.id));
  expect(row.url).toBe('https://example.com/pasted');
  expect(processLink).toHaveBeenCalledWith(body.id);
});

test.each([
  ['not a url', 'zoekterm'],
  ['non-http protocol', 'ftp://example.com'],
  ['two urls joined by a newline', 'https://example.com/a\nhttps://example.com/a'],
  ['missing url', undefined],
])('%s returns 400 and inserts nothing', async (_label, url) => {
  const before = (await db.select().from(links)).length;
  const res = await POST(req({ url }));
  expect(res.status).toBe(400);
  expect((await db.select().from(links)).length).toBe(before);
});
