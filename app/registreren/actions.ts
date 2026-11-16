'use server';

import { auth } from '@/lib/auth/server';
import { getSessionUserId } from '@/lib/currentUser';
import { isValidInviteCode } from '@/lib/invite';
import { addMember } from '@/lib/members';

export type ActionResult = { ok: true } | { ok: false; error: string };

const MIN_PASSWORD_LENGTH = 8;
const WRONG_CODE = 'Uitnodigingscode klopt niet';
// Deliberately vague: it must not tell whether the e-mail address already has an account.
const SIGN_UP_FAILED = 'Account aanmaken is niet gelukt';

// Signing up only goes through here: the invite code is checked before an account is made,
// and only an account made here is added to the members, which is what gives access.
export async function register(input: {
  name: string;
  email: string;
  password: string;
  inviteCode: string;
}): Promise<ActionResult> {
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  const email = typeof input?.email === 'string' ? input.email.trim() : '';
  const password = typeof input?.password === 'string' ? input.password : '';

  if (!isValidInviteCode(input?.inviteCode)) return { ok: false, error: WRONG_CODE };
  if (!name) return { ok: false, error: 'Vul je naam in' };
  if (!email) return { ok: false, error: 'Vul je e-mailadres in' };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Wachtwoord moet minstens ${MIN_PASSWORD_LENGTH} tekens zijn` };
  }

  let userId: string | undefined;
  try {
    const { data, error } = await auth.signUp.email({ name, email, password });
    if (!error) userId = data?.user?.id;
  } catch {
    // Handled below, the same as an error result.
  }
  if (!userId) return { ok: false, error: SIGN_UP_FAILED };

  await addMember(userId);
  return { ok: true };
}

// For an account that exists in Neon Auth but never passed the sign-up form above.
export async function joinWithInviteCode(inviteCode: string): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: 'Log eerst in' };
  if (!isValidInviteCode(inviteCode)) return { ok: false, error: WRONG_CODE };
  await addMember(userId);
  return { ok: true };
}
