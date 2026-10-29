import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sitePassword } from '@/lib/schema';

// Node's built-in scrypt, so no extra dependency. Stored as "scrypt$<salt>$<hash>" (base64url).
const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const ROW_ID = 1;

export const MIN_PASSWORD_LENGTH = 8;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyPasswordHash(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash, ...rest] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash || rest.length > 0) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64url'), expected.length);
  return timingSafeEqual(actual, expected);
}

async function storedPasswordHash(): Promise<string | null> {
  const [row] = await db.select().from(sitePassword).where(eq(sitePassword.id, ROW_ID));
  return row?.passwordHash ?? null;
}

// Once a password has been set in the app, SITE_PASSWORD no longer works.
export async function isCorrectPassword(password: unknown): Promise<boolean> {
  if (typeof password !== 'string' || !password) return false;
  const stored = await storedPasswordHash();
  if (stored) return verifyPasswordHash(password, stored);
  const envPassword = process.env.SITE_PASSWORD;
  return Boolean(envPassword) && password === envPassword;
}

export async function isValidLogin(username: unknown, password: unknown): Promise<boolean> {
  const expectedUsername = process.env.SITE_USERNAME;
  if (!expectedUsername || username !== expectedUsername) return false;
  return isCorrectPassword(password);
}

export async function setPassword(password: string): Promise<void> {
  const passwordHash = await hashPassword(password);
  await db
    .insert(sitePassword)
    .values({ id: ROW_ID, passwordHash })
    .onConflictDoUpdate({ target: sitePassword.id, set: { passwordHash, updatedAt: new Date() } });
}
