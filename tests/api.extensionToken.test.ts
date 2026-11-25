import { POST } from '@/app/api/extension-token/route';
import { addMember } from '@/lib/members';
import { createShareToken, userIdForShareToken } from '@/lib/shareTokens';
import { signInAs } from '@/tests/helpers/user';

test('creating an extension token returns one that saves into your own account', async () => {
  await addMember('user-a');
  const { token } = await (await POST()).json();
  expect(await userIdForShareToken(token)).toBe('user-a');
});

test('pairing the extension does not break the shortcut token', async () => {
  await addMember('user-a');
  const shortcut = await createShareToken('user-a');
  await POST();
  expect(await userIdForShareToken(shortcut)).toBe('user-a');
});

test('signed out: no extension token', async () => {
  signInAs(null);
  expect((await POST()).status).toBe(401);
});
