import { beforeEach, expect, test, vi } from 'vitest';
import { getSessionUserId, getUserId } from '@/lib/currentUser';
import { addMember } from '@/lib/members';

vi.unmock('@/lib/currentUser');
const getSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/server', () => ({ auth: { getSession } }));

beforeEach(() => {
  getSession.mockReset();
});

test('without a session there is no user', async () => {
  getSession.mockResolvedValue({ data: null });
  expect(await getSessionUserId()).toBeNull();
  expect(await getUserId()).toBeNull();
});

test('a signed-in user who was never invited gets no access', async () => {
  getSession.mockResolvedValue({ data: { user: { id: 'user-a' } } });
  expect(await getSessionUserId()).toBe('user-a');
  expect(await getUserId()).toBeNull();
});

test('a signed-in member is the current user', async () => {
  await addMember('user-a');
  getSession.mockResolvedValue({ data: { user: { id: 'user-a' } } });
  expect(await getUserId()).toBe('user-a');
});

test('a failing session lookup counts as signed out', async () => {
  getSession.mockRejectedValue(new Error('auth service unreachable'));
  expect(await getUserId()).toBeNull();
});
