import { POST } from '@/app/api/links/[id]/reprocess/route';
import { db } from '@/lib/db';
import { links } from '@/lib/schema';

vi.mock('@/lib/extractPage', () => ({ fetchPageText: vi.fn().mockResolvedValue({ title: 'T', text: 'content' }) }));
vi.mock('@/lib/gemini', () => ({ summarizeAndCategorize: vi.fn().mockResolvedValue({ summary: 'S', category: 'Tech' }) }));

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

test('reprocesses a failed link and returns the updated row', async () => {
  const [row] = await db.insert(links).values({ url: 'https://x.example', status: 'failed', errorMessage: 'oud probleem' }).returning();
  const res = await POST(new Request('https://x'), context(row.id));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.status).toBe('done');
  expect(body.summary).toBe('S');
});

test('unknown id returns 404', async () => {
  const res = await POST(new Request('https://x'), context('00000000-0000-0000-0000-000000000000'));
  expect(res.status).toBe(404);
});
