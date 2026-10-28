import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createSessionToken, isValidLogin, verifySessionToken } from '@/lib/session';

beforeEach(() => {
  vi.stubEnv('SESSION_SECRET', 'test-session-secret');
  vi.stubEnv('SITE_USERNAME', 'Volkan');
  vi.stubEnv('SITE_PASSWORD', 'geheim:met-dubbele-punt');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('session tokens', () => {
  test('a freshly created token verifies', async () => {
    expect(await verifySessionToken(await createSessionToken())).toBe(true);
  });

  test('a tampered token is rejected', async () => {
    const token = await createSessionToken();
    const [expiresAt, signature] = token.split('.');
    expect(await verifySessionToken(`${Number(expiresAt) + 1000}.${signature}`)).toBe(false);
    expect(await verifySessionToken(`${expiresAt}.${signature.slice(0, -2)}xx`)).toBe(false);
  });

  test('an expired token is rejected', async () => {
    vi.useFakeTimers();
    const token = await createSessionToken();
    vi.advanceTimersByTime(31 * 24 * 60 * 60 * 1000);
    expect(await verifySessionToken(token)).toBe(false);
  });

  test('a token signed with another secret is rejected', async () => {
    const token = await createSessionToken();
    vi.stubEnv('SESSION_SECRET', 'another-secret');
    expect(await verifySessionToken(token)).toBe(false);
  });

  test('fails closed without SESSION_SECRET', async () => {
    const token = await createSessionToken();
    vi.stubEnv('SESSION_SECRET', '');
    expect(await verifySessionToken(token)).toBe(false);
    await expect(createSessionToken()).rejects.toThrow();
  });

  test('rejects missing or malformed tokens', async () => {
    expect(await verifySessionToken(undefined)).toBe(false);
    expect(await verifySessionToken('')).toBe(false);
    expect(await verifySessionToken('no-dot')).toBe(false);
    expect(await verifySessionToken('abc.def')).toBe(false);
  });
});

describe('isValidLogin', () => {
  test('accepts the configured username and password', () => {
    expect(isValidLogin('Volkan', 'geheim:met-dubbele-punt')).toBe(true);
  });

  test('rejects wrong credentials, including a wrongly cased username', () => {
    expect(isValidLogin('volkan', 'geheim:met-dubbele-punt')).toBe(false);
    expect(isValidLogin('Volkan', 'fout')).toBe(false);
    expect(isValidLogin(undefined, undefined)).toBe(false);
  });

  test('fails closed when credentials are not configured', () => {
    vi.stubEnv('SITE_USERNAME', '');
    vi.stubEnv('SITE_PASSWORD', '');
    expect(isValidLogin('', '')).toBe(false);
  });
});
