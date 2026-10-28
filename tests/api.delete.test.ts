import { eq } from 'drizzle-orm';
import { DELETE } from '@/app/api/links/[id]/route';
import { db } from '@/lib/db';
import { links } from '@/lib/schema';

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

test('deletes the link and returns 204', async () => {
  const [row] = await db.insert(links).values({ url: 'https://x.example' }).returning();
  const res = await DELETE(new Request('https://x', { method: 'DELETE' }), context(row.id));
  expect(res.status).toBe(204);
  const remaining = await db.select().from(links).where(eq(links.id, row.id));
  expect(remaining).toHaveLength(0);
});

test('unknown id returns 404', async () => {
  const res = await DELETE(new Request('https://x', { method: 'DELETE' }), context('00000000-0000-0000-0000-000000000000'));
  expect(res.status).toBe(404);
});
