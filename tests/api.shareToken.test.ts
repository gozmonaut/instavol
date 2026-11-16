import { GET, POST } from '@/app/api/share-token/route';
import { addMember } from '@/lib/members';
import { userIdForShareToken } from '@/lib/shareTokens';
import { signInAs } from '@/tests/helpers/user';

test('tells whether you already have a token, without showing it', async () => {
  await addMember('user-a');
  expect(await (await GET()).json()).toEqual({ exists: false });
  await POST();
  expect(await (await GET()).json()).toEqual({ exists: true });
});

test('creating a token returns one that saves into your own account', async () => {
  await addMember('user-a');
  const { token } = await (await POST()).json();
  expect(await userIdForShareToken(token)).toBe('user-a');
});

test('signed out: no token information and no new token', async () => {
  signInAs(null);
  expect((await GET()).status).toBe(401);
  expect((await POST()).status).toBe(401);
});
