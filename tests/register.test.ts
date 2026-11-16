import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { joinWithInviteCode, register } from '@/app/registreren/actions';
import { db } from '@/lib/db';
import { isMember } from '@/lib/members';
import { members } from '@/lib/schema';
import { signInAs } from '@/tests/helpers/user';

const signUpEmail = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/server', () => ({ auth: { signUp: { email: signUpEmail } } }));

const input = { name: 'Oma', email: 'oma@example.com', password: 'lang-genoeg', inviteCode: 'familie-2026' };

beforeEach(() => {
  vi.stubEnv('INVITE_CODE', 'familie-2026');
  signUpEmail.mockReset().mockResolvedValue({ data: { user: { id: 'new-user' } }, error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test('with the right code the account is created and gets access', async () => {
  expect(await register(input)).toEqual({ ok: true });
  expect(signUpEmail).toHaveBeenCalledWith({ name: 'Oma', email: 'oma@example.com', password: 'lang-genoeg' });
  expect(await isMember('new-user')).toBe(true);
});

test('with a wrong code no account is created at all', async () => {
  expect(await register({ ...input, inviteCode: 'geraden' })).toEqual({ ok: false, error: 'Uitnodigingscode klopt niet' });
  expect(signUpEmail).not.toHaveBeenCalled();
  expect(await db.select().from(members)).toHaveLength(0);
});

test('without a configured INVITE_CODE signing up is closed', async () => {
  vi.stubEnv('INVITE_CODE', '');
  expect(await register({ ...input, inviteCode: '' })).toEqual({ ok: false, error: 'Uitnodigingscode klopt niet' });
  expect(signUpEmail).not.toHaveBeenCalled();
});

test('a password shorter than 8 characters is refused before anything is created', async () => {
  const result = await register({ ...input, password: '1234567' });
  expect(result).toEqual({ ok: false, error: 'Wachtwoord moet minstens 8 tekens zijn' });
  expect(signUpEmail).not.toHaveBeenCalled();
});

test.each([['name', { name: '  ' }], ['email', { email: '' }]])('a missing %s is refused', async (_field, change) => {
  expect((await register({ ...input, ...change })).ok).toBe(false);
  expect(signUpEmail).not.toHaveBeenCalled();
});

test.each([
  ['returns an error', () => signUpEmail.mockResolvedValue({ data: null, error: { message: 'User already exists' } })],
  ['throws', () => signUpEmail.mockRejectedValue(new Error('User already exists'))],
])('when Neon Auth %s, the message does not reveal why and nobody gets access', async (_name, arrange) => {
  arrange();
  expect(await register(input)).toEqual({ ok: false, error: 'Account aanmaken is niet gelukt' });
  expect(await db.select().from(members)).toHaveLength(0);
});

test('a signed-in account without access gets in with the right code', async () => {
  signInAs('user-c', { member: false });
  expect(await joinWithInviteCode('familie-2026')).toEqual({ ok: true });
  expect(await isMember('user-c')).toBe(true);
});

test('a signed-in account without access stays out with a wrong code', async () => {
  signInAs('user-c', { member: false });
  expect(await joinWithInviteCode('geraden')).toEqual({ ok: false, error: 'Uitnodigingscode klopt niet' });
  expect(await isMember('user-c')).toBe(false);
});

test('joining with a code needs a signed-in account', async () => {
  signInAs(null);
  expect((await joinWithInviteCode('familie-2026')).ok).toBe(false);
  expect(await db.select().from(members)).toHaveLength(0);
});
