// Signed session cookie for the website login (replaces Basic Auth).
// Token format: "<expiresAtMs>.<base64url HMAC-SHA256 of expiresAtMs>". Web Crypto, so it runs in the proxy too.

export const SESSION_COOKIE = 'instavol_session';
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const encoder = new TextEncoder();

async function signingKey(): Promise<CryptoKey | null> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

function toBase64Url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

export async function createSessionToken(): Promise<string> {
  const key = await signingKey();
  if (!key) throw new Error('SESSION_SECRET is not configured');
  const expiresAt = String(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(expiresAt));
  return `${expiresAt}.${toBase64Url(signature)}`;
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [expiresAt, signature, ...rest] = token.split('.');
  if (!expiresAt || !signature || rest.length > 0) return false;
  if (!/^\d+$/.test(expiresAt) || Number(expiresAt) <= Date.now()) return false;

  const key = await signingKey();
  const signatureBytes = fromBase64Url(signature);
  if (!key || !signatureBytes) return false;
  // subtle.verify compares in constant time.
  return crypto.subtle.verify('HMAC', key, signatureBytes, encoder.encode(expiresAt));
}

export function isValidLogin(username: unknown, password: unknown): boolean {
  const expectedUsername = process.env.SITE_USERNAME;
  const expectedPassword = process.env.SITE_PASSWORD;
  if (!expectedUsername || !expectedPassword) return false;
  return username === expectedUsername && password === expectedPassword;
}
