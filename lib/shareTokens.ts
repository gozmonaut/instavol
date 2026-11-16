import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { isMember } from '@/lib/members';
import { shareTokens } from '@/lib/schema';

// Only this hash is stored, so a leaked database does not give away working tokens.
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Makes the user's personal token for saving from the share menu, replacing any earlier one.
// The readable token is only returned here; it cannot be looked up again later.
export async function createShareToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  await db
    .insert(shareTokens)
    .values({ userId, tokenHash })
    .onConflictDoUpdate({ target: shareTokens.userId, set: { tokenHash, createdAt: new Date() } });
  return token;
}

export async function hasShareToken(userId: string): Promise<boolean> {
  const [row] = await db.select({ userId: shareTokens.userId }).from(shareTokens).where(eq(shareTokens.userId, userId));
  return Boolean(row);
}

// Whose token this is; null when it is unknown or its owner has no access (any more).
export async function userIdForShareToken(token: string): Promise<string | null> {
  if (!token) return null;
  const [row] = await db.select().from(shareTokens).where(eq(shareTokens.tokenHash, hashToken(token)));
  if (!row || !(await isMember(row.userId))) return null;
  return row.userId;
}
