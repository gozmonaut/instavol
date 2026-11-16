import { addMember, isMember } from '@/lib/members';

test('an unknown user is not a member', async () => {
  expect(await isMember('user-a')).toBe(false);
});

test('a user is a member after being added', async () => {
  await addMember('user-a');
  expect(await isMember('user-a')).toBe(true);
  expect(await isMember('user-b')).toBe(false);
});

test('adding the same member twice is harmless', async () => {
  await addMember('user-a');
  await expect(addMember('user-a')).resolves.toBeUndefined();
});
