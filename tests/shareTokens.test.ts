import { createShareToken, hasShareToken, userIdForShareToken } from '@/lib/shareTokens';
import { db } from '@/lib/db';
import { addMember } from '@/lib/members';
import { shareTokens } from '@/lib/schema';

test('a new token leads back to its user', async () => {
  await addMember('user-a');
  const token = await createShareToken('user-a');
  expect(token.length).toBeGreaterThanOrEqual(40);
  expect(await userIdForShareToken(token)).toBe('user-a');
  expect(await hasShareToken('user-a')).toBe(true);
  expect(await hasShareToken('user-b')).toBe(false);
});

test('the readable token is not stored', async () => {
  await addMember('user-a');
  const token = await createShareToken('user-a');
  const [row] = await db.select().from(shareTokens);
  expect(JSON.stringify(row)).not.toContain(token);
});

test('replacing a token makes the old one useless', async () => {
  await addMember('user-a');
  const first = await createShareToken('user-a');
  const second = await createShareToken('user-a');
  expect(second).not.toBe(first);
  expect(await userIdForShareToken(first)).toBeNull();
  expect(await userIdForShareToken(second)).toBe('user-a');
});

test('an empty or unknown token belongs to nobody', async () => {
  await addMember('user-a');
  await createShareToken('user-a');
  expect(await userIdForShareToken('')).toBeNull();
  expect(await userIdForShareToken('not-a-token')).toBeNull();
});

test('a token of someone who is not a member gives no access', async () => {
  const token = await createShareToken('user-c');
  expect(await userIdForShareToken(token)).toBeNull();
});

test('the extension token and the shortcut token exist side by side', async () => {
  await addMember('user-a');
  const shortcut = await createShareToken('user-a');
  const extension = await createShareToken('user-a', 'extension');
  expect(extension).not.toBe(shortcut);
  expect(await userIdForShareToken(shortcut)).toBe('user-a');
  expect(await userIdForShareToken(extension)).toBe('user-a');
  expect(await hasShareToken('user-a', 'extension')).toBe(true);
});

test('replacing the extension token leaves the shortcut token working', async () => {
  await addMember('user-a');
  const shortcut = await createShareToken('user-a');
  const first = await createShareToken('user-a', 'extension');
  const second = await createShareToken('user-a', 'extension');
  expect(await userIdForShareToken(first)).toBeNull();
  expect(await userIdForShareToken(second)).toBe('user-a');
  expect(await userIdForShareToken(shortcut)).toBe('user-a');
});

test('having one kind of token does not count as having the other', async () => {
  await addMember('user-a');
  await createShareToken('user-a', 'extension');
  expect(await hasShareToken('user-a')).toBe(false);
  expect(await hasShareToken('user-a', 'extension')).toBe(true);
});
