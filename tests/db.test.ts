import { db } from '@/lib/db';
import { links } from '@/lib/schema';

test('inserting a link applies defaults', async () => {
  const [row] = await db.insert(links).values({ url: 'https://example.com' }).returning();
  expect(row.status).toBe('pending');
  expect(row.summary).toBeNull();
  expect(row.category).toBeNull();
  expect(row.createdAt).toBeInstanceOf(Date);
});
