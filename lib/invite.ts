import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (value: string) => createHash('sha256').update(value).digest();

// The family's shared code (INVITE_CODE). Without it configured, nobody can sign up.
// Hashing both sides first gives equal lengths, so the comparison takes the same time for every guess.
export function isValidInviteCode(code: unknown): boolean {
  const expected = process.env.INVITE_CODE;
  if (!expected || typeof code !== 'string' || !code) return false;
  return timingSafeEqual(digest(code), digest(expected));
}
