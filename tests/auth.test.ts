import { afterEach, describe, expect, test, vi } from 'vitest';
import { isValidApiToken, isValidBasicAuth } from '@/lib/auth';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isValidApiToken', () => {
  test('accepts the matching bearer token', () => {
    vi.stubEnv('API_TOKEN', 'secret123');
    const req = new Request('https://x', { headers: { Authorization: 'Bearer secret123' } });
    expect(isValidApiToken(req)).toBe(true);
  });

  test('rejects a wrong or missing token', () => {
    vi.stubEnv('API_TOKEN', 'secret123');
    expect(isValidApiToken(new Request('https://x', { headers: { Authorization: 'Bearer wrong' } }))).toBe(false);
    expect(isValidApiToken(new Request('https://x'))).toBe(false);
  });

  test('rejects a non-Bearer scheme carrying the right value', () => {
    vi.stubEnv('API_TOKEN', 'secret123');
    const req = new Request('https://x', { headers: { Authorization: 'Basic secret123' } });
    expect(isValidApiToken(req)).toBe(false);
  });

  test('fails closed when API_TOKEN is not configured', () => {
    vi.stubEnv('API_TOKEN', '');
    expect(isValidApiToken(new Request('https://x', { headers: { Authorization: 'Bearer ' } }))).toBe(false);
  });
});

describe('isValidBasicAuth', () => {
  test('accepts matching credentials', () => {
    vi.stubEnv('SITE_USERNAME', 'user');
    vi.stubEnv('SITE_PASSWORD', 'pass');
    const encoded = Buffer.from('user:pass').toString('base64');
    const req = new Request('https://x', { headers: { Authorization: `Basic ${encoded}` } });
    expect(isValidBasicAuth(req)).toBe(true);
  });

  test('rejects wrong or missing credentials', () => {
    vi.stubEnv('SITE_USERNAME', 'user');
    vi.stubEnv('SITE_PASSWORD', 'pass');
    expect(isValidBasicAuth(new Request('https://x'))).toBe(false);
    const wrong = Buffer.from('user:nope').toString('base64');
    expect(isValidBasicAuth(new Request('https://x', { headers: { Authorization: `Basic ${wrong}` } }))).toBe(false);
  });

  test('accepts a password containing a colon and non-ASCII characters', () => {
    vi.stubEnv('SITE_USERNAME', 'user');
    vi.stubEnv('SITE_PASSWORD', 'pa:ss€');
    const encoded = Buffer.from('user:pa:ss€', 'utf8').toString('base64');
    const req = new Request('https://x', { headers: { Authorization: `Basic ${encoded}` } });
    expect(isValidBasicAuth(req)).toBe(true);
  });

  test('rejects malformed base64 without throwing', () => {
    vi.stubEnv('SITE_USERNAME', 'user');
    vi.stubEnv('SITE_PASSWORD', 'pass');
    const req = new Request('https://x', { headers: { Authorization: 'Basic %%%not-base64%%%' } });
    expect(isValidBasicAuth(req)).toBe(false);
  });

  test('fails closed when site credentials are not configured', () => {
    vi.stubEnv('SITE_USERNAME', '');
    vi.stubEnv('SITE_PASSWORD', '');
    const encoded = Buffer.from(':').toString('base64');
    const req = new Request('https://x', { headers: { Authorization: `Basic ${encoded}` } });
    expect(isValidBasicAuth(req)).toBe(false);
  });
});
