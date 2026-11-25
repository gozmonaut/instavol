import { createHash, randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { isMember } from '@/lib/members';
import { shareTokens } from '@/lib/schema';

// 'shortcut': the share-menu shortcut. 'extension': the Safari extension. Replacing one leaves the other working.
export type ShareTokenKind = 'shortcut' | 'extension';

// Only this hash is stored, so a leaked database does not give away working tokens.
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Makes the user's personal token of this kind, replacing any earlier one of the same kind.
// The readable token is only returned here; it cannot be looked up again later.
export async function createShareToken(userId: string, kind: ShareTokenKind = 'shortcut'): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  await db
    .insert(shareTokens)
    .values({ userId, kind, tokenHash })
    .onConflictDoUpdate({ target: [shareTokens.userId, shareTokens.kind], set: { tokenHash, createdAt: new Date() } });
  return token;
}

export async function hasShareToken(userId: string, kind: ShareTokenKind = 'shortcut'): Promise<boolean> {
  const [row] = await db
    .select({ userId: shareTokens.userId })
    .from(shareTokens)
    .where(and(eq(shareTokens.userId, userId), eq(shareTokens.kind, kind)));
  return Boolean(row);
}

// Whose token this is (of any kind); null when it is unknown or its owner has no access (any more).
export async function userIdForShareToken(token: string): Promise<string | null> {
  if (!token) return null;
  const [row] = await db.select().from(shareTokens).where(eq(shareTokens.tokenHash, hashToken(token)));
  if (!row || !(await isMember(row.userId))) return null;
  return row.userId;
}
