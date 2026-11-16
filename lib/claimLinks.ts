import { count, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { isMember } from '@/lib/members';
import { links } from '@/lib/schema';

// Links saved before accounts existed have no owner.
export async function countUnownedLinks(): Promise<number> {
  const [{ total }] = await db.select({ total: count() }).from(links).where(isNull(links.userId));
  return total;
}

// One-off, for moving from one user to accounts: gives all links without an owner to this member.
export async function claimUnownedLinks(userId: string): Promise<number> {
  if (!(await isMember(userId))) {
    throw new Error(`${userId} is geen lid; maak eerst een account aan met de uitnodigingscode`);
  }
  const claimed = await db.update(links).set({ userId }).where(isNull(links.userId)).returning();
  return claimed.length;
}
