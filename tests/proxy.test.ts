import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

// lib/auth/server.ts reads these when it is first imported.
vi.hoisted(() => {
  process.env.NEON_AUTH_BASE_URL = 'https://auth.example.test/neondb/auth';
  process.env.NEON_AUTH_COOKIE_SECRET = 'test-cookie-secret-of-at-least-32-characters';
});

import proxy, { config } from '@/proxy';

beforeEach(() => {
  // Signed-out requests must be decided without calling Neon Auth.
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network in tests')));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const request = (path: string) => new NextRequest(`https://instavol.example${path}`);
const isCovered = (path: string) => config.matcher.some((pattern) => new RegExp(`^${pattern}$`).test(path));

test('pages without a session redirect to /login', async () => {
  const res = await proxy(request('/'));
  expect(res.status).toBe(307);
  expect(new URL(res.headers.get('location')!).pathname).toBe('/login');
});

test('api routes without a session return 401 instead of redirecting', async () => {
  const res = await proxy(request('/api/links'));
  expect(res.status).toBe(401);
  expect(res.headers.get('location')).toBeNull();
});

test.each(['/login', '/registreren', '/wachtwoord-vergeten', '/wachtwoord-herstellen', '/api/auth/sign-in/email'])(
  '%s is reachable without a session',
  async (path) => {
    const res = await proxy(request(path));
    expect(res.headers.get('x-middleware-next')).toBe('1');
  },
);

test('the screen for accounts without access still needs a session', async () => {
  const res = await proxy(request('/geen-toegang'));
  expect(res.status).toBe(307);
});

test.each(['/api/share', '/_next/static/chunk.js', '/favicon.ico', '/manifest.webmanifest', '/instavol-icon.svg'])(
  '%s is not checked at all (own token, or a public file)',
  (path) => {
    expect(isCovered(path)).toBe(false);
  },
);

test.each(['/', '/api/links', '/api/share-token', '/geen-toegang'])('%s is checked', (path) => {
  expect(isCovered(path)).toBe(true);
});
