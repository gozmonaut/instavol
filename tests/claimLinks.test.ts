import { isNull } from 'drizzle-orm';
import { claimUnownedLinks, countUnownedLinks } from '@/lib/claimLinks';
import { db } from '@/lib/db';
import { addMember } from '@/lib/members';
import { links } from '@/lib/schema';

async function seed() {
  await db.insert(links).values([
    { url: 'https://old-1.example' },
    { url: 'https://old-2.example' },
    { url: 'https://b.example', userId: 'user-b' },
  ]);
}

test('counts the links that have no owner yet', async () => {
  await seed();
  expect(await countUnownedLinks()).toBe(2);
});

test('gives every link without an owner to the member, and leaves other people\'s links alone', async () => {
  await seed();
  await addMember('user-a');
  expect(await claimUnownedLinks('user-a')).toBe(2);
  const rows = await db.select().from(links);
  expect(rows.map((row) => row.userId).sort()).toEqual(['user-a', 'user-a', 'user-b']);
});

test('refuses someone who is not a member and changes nothing', async () => {
  await seed();
  await expect(claimUnownedLinks('user-x')).rejects.toThrow('is geen lid');
  expect(await db.select().from(links).where(isNull(links.userId))).toHaveLength(2);
});

test('running it a second time changes nothing', async () => {
  await seed();
  await addMember('user-a');
  await claimUnownedLinks('user-a');
  expect(await claimUnownedLinks('user-a')).toBe(0);
});
