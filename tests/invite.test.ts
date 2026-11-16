import { afterEach, expect, test, vi } from 'vitest';
import { isValidInviteCode } from '@/lib/invite';

afterEach(() => {
  vi.unstubAllEnvs();
});

test('the configured code is accepted', () => {
  vi.stubEnv('INVITE_CODE', 'familie-2026');
  expect(isValidInviteCode('familie-2026')).toBe(true);
});

test.each([['a wrong code', 'familie-2025'], ['an empty code', ''], ['a number', 42], ['nothing', undefined]])(
  '%s is rejected',
  (_name, code) => {
    vi.stubEnv('INVITE_CODE', 'familie-2026');
    expect(isValidInviteCode(code)).toBe(false);
  },
);

test.each([['not set', undefined], ['empty', '']])('with INVITE_CODE %s nobody can sign up', (_name, value) => {
  vi.stubEnv('INVITE_CODE', value);
  expect(isValidInviteCode('')).toBe(false);
  expect(isValidInviteCode('undefined')).toBe(false);
});
