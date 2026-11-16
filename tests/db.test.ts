import { db } from '@/lib/db';
import { links, members, shareTokens } from '@/lib/schema';

test('inserting a link applies defaults', async () => {
  const [row] = await db.insert(links).values({ url: 'https://example.com' }).returning();
  expect(row.status).toBe('pending');
  expect(row.summary).toBeNull();
  expect(row.category).toBeNull();
  expect(row.createdAt).toBeInstanceOf(Date);
});

test('a link remembers its owner', async () => {
  const [row] = await db.insert(links).values({ url: 'https://example.com', userId: 'user-a' }).returning();
  expect(row.userId).toBe('user-a');
});

test('members and share tokens can be stored, and a token hash is unique', async () => {
  await db.insert(members).values({ userId: 'user-a' });
  await db.insert(shareTokens).values({ userId: 'user-a', tokenHash: 'hash-1' });
  const [member] = await db.select().from(members);
  expect(member.createdAt).toBeInstanceOf(Date);
  await expect(db.insert(shareTokens).values({ userId: 'user-b', tokenHash: 'hash-1' })).rejects.toThrow();
});
