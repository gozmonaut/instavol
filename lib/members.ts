import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { members } from '@/lib/schema';

// Only called after the invite code was checked: this is what gives an account access.
export async function addMember(userId: string): Promise<void> {
  await db.insert(members).values({ userId }).onConflictDoNothing();
}

export async function isMember(userId: string): Promise<boolean> {
  const [row] = await db.select().from(members).where(eq(members.userId, userId));
  return Boolean(row);
}
