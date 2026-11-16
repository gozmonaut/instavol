import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (value: string) => createHash('sha256').update(value).digest();

// The family's shared code (INVITE_CODE). Without it configured, nobody can sign up.
// Hashing both sides first gives equal lengths, so the comparison takes the same time for every guess.
export function isValidInviteCode(code: unknown): boolean {
  // Trimmed on both sides: a code pasted from a message often carries a space or newline.
  const expected = process.env.INVITE_CODE?.trim();
  const given = typeof code === 'string' ? code.trim() : '';
  if (!expected || !given) return false;
  return timingSafeEqual(digest(given), digest(expected));
}
