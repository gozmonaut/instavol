import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { POST as login } from '@/app/api/login/route';
import { POST as logout } from '@/app/api/logout/route';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session';

beforeEach(() => {
  vi.stubEnv('SESSION_SECRET', 'test-session-secret');
  vi.stubEnv('SITE_USERNAME', 'Volkan');
  vi.stubEnv('SITE_PASSWORD', 'geheim');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function loginRequest(body: unknown) {
  return new Request('https://x/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function sessionCookieValue(res: Response): string | undefined {
  const header = res.headers.get('set-cookie') ?? '';
  return header.match(new RegExp(`${SESSION_COOKIE}=([^;]*)`))?.[1];
}

test('valid credentials set an HttpOnly session cookie that verifies', async () => {
  const res = await login(loginRequest({ username: 'Volkan', password: 'geheim' }));
  expect(res.status).toBe(200);
  const header = res.headers.get('set-cookie') ?? '';
  expect(header).toMatch(/HttpOnly/i);
  expect(header).toMatch(/SameSite=lax/i);
  expect(header).toMatch(/Max-Age=2592000/);
  expect(await verifySessionToken(sessionCookieValue(res))).toBe(true);
});

test('wrong credentials return 401 and set no cookie', async () => {
  const res = await login(loginRequest({ username: 'Volkan', password: 'fout' }));
  expect(res.status).toBe(401);
  expect(res.headers.get('set-cookie')).toBeNull();
});

test('invalid JSON returns 400', async () => {
  const res = await login(new Request('https://x/api/login', { method: 'POST', body: 'not json' }));
  expect(res.status).toBe(400);
});

test('logout clears the session cookie', async () => {
  const res = await logout();
  expect(res.status).toBe(204);
  const header = res.headers.get('set-cookie') ?? '';
  expect(header).toContain(`${SESSION_COOKIE}=;`);
  expect(header).toMatch(/Max-Age=0/);
});
