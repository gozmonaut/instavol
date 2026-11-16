import { auth } from '@/lib/auth/server';
import { isMember } from '@/lib/members';

// The signed-in account, whether or not it was invited.
export async function getSessionUserId(): Promise<string | null> {
  try {
    const { data: session } = await auth.getSession();
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

// The signed-in user, but only when they joined with the invite code. An account can exist in Neon Auth
// without ever passing our sign-up form, so a session alone does not give access.
export async function getUserId(): Promise<string | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  return (await isMember(userId)) ? userId : null;
}
