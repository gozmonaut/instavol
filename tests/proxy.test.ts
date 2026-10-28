import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
import proxy from '@/proxy';
import { SESSION_COOKIE, createSessionToken } from '@/lib/session';

beforeEach(() => {
  vi.stubEnv('SESSION_SECRET', 'test-session-secret');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function request(path: string, token?: string) {
  return new NextRequest(`https://instavol.example${path}`, {
    headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {},
  });
}

test('pages without a session redirect to /login', async () => {
  const res = await proxy(request('/'));
  expect(res.status).toBe(307);
  expect(res.headers.get('location')).toBe('https://instavol.example/login');
});

test('api routes without a session return 401 instead of redirecting', async () => {
  const res = await proxy(request('/api/links'));
  expect(res.status).toBe(401);
});

test('an invalid session cookie is treated as logged out', async () => {
  const res = await proxy(request('/', 'tampered.token'));
  expect(res.status).toBe(307);
});

test('a valid session lets the request through', async () => {
  const res = await proxy(request('/', await createSessionToken()));
  expect(res.headers.get('x-middleware-next')).toBe('1');
});

test('/login is reachable without a session', async () => {
  const res = await proxy(request('/login'));
  expect(res.headers.get('x-middleware-next')).toBe('1');
});

test('/login with a valid session redirects to the app', async () => {
  const res = await proxy(request('/login', await createSessionToken()));
  expect(res.status).toBe(307);
  expect(res.headers.get('location')).toBe('https://instavol.example/');
});
