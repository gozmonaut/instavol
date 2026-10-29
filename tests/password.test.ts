import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { POST as changePassword } from '@/app/api/password/route';
import { POST as login } from '@/app/api/login/route';
import { hashPassword, isValidLogin, setPassword, verifyPasswordHash } from '@/lib/password';

beforeEach(() => {
  vi.stubEnv('SESSION_SECRET', 'test-session-secret');
  vi.stubEnv('SITE_USERNAME', 'Volkan');
  vi.stubEnv('SITE_PASSWORD', 'geheim');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function jsonRequest(url: string, body: unknown) {
  return new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

test('a hash verifies the right password only, and is salted', async () => {
  const hash = await hashPassword('nieuw-wachtwoord');
  expect(hash).toMatch(/^scrypt\$/);
  expect(hash).not.toContain('nieuw-wachtwoord');
  expect(await verifyPasswordHash('nieuw-wachtwoord', hash)).toBe(true);
  expect(await verifyPasswordHash('fout', hash)).toBe(false);
  expect(await hashPassword('nieuw-wachtwoord')).not.toBe(hash);
});

test('without a stored password, SITE_PASSWORD is used', async () => {
  expect(await isValidLogin('Volkan', 'geheim')).toBe(true);
  expect(await isValidLogin('Volkan', 'fout')).toBe(false);
  expect(await isValidLogin('iemand', 'geheim')).toBe(false);
});

test('once a password is stored, only that one works and SITE_PASSWORD no longer does', async () => {
  await setPassword('nieuw-wachtwoord');
  expect(await isValidLogin('Volkan', 'nieuw-wachtwoord')).toBe(true);
  expect(await isValidLogin('Volkan', 'geheim')).toBe(false);

  await setPassword('nog-een-keer');
  expect(await isValidLogin('Volkan', 'nieuw-wachtwoord')).toBe(false);
  expect(await isValidLogin('Volkan', 'nog-een-keer')).toBe(true);
});

test('changing the password via the API, then logging in with it', async () => {
  const res = await changePassword(jsonRequest('https://x/api/password', { currentPassword: 'geheim', newPassword: 'nieuw-wachtwoord' }));
  expect(res.status).toBe(200);

  expect((await login(jsonRequest('https://x/api/login', { username: 'Volkan', password: 'nieuw-wachtwoord' }))).status).toBe(200);
  expect((await login(jsonRequest('https://x/api/login', { username: 'Volkan', password: 'geheim' }))).status).toBe(401);
});

test('a wrong current password is refused and nothing changes', async () => {
  const res = await changePassword(jsonRequest('https://x/api/password', { currentPassword: 'fout', newPassword: 'nieuw-wachtwoord' }));
  expect(res.status).toBe(403);
  expect(await isValidLogin('Volkan', 'geheim')).toBe(true);
});

test('a new password shorter than 8 characters is refused', async () => {
  const res = await changePassword(jsonRequest('https://x/api/password', { currentPassword: 'geheim', newPassword: 'kort' }));
  expect(res.status).toBe(400);
  expect(await isValidLogin('Volkan', 'geheim')).toBe(true);
});
