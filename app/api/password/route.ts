import { NextResponse } from 'next/server';
import { MIN_PASSWORD_LENGTH, isCorrectPassword, setPassword } from '@/lib/password';

// Change the site password (only reachable when logged in, see proxy.ts).
export async function POST(request: Request): Promise<Response> {
  let body: { currentPassword?: unknown; newPassword?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!(await isCorrectPassword(body.currentPassword))) {
    return NextResponse.json({ error: 'Huidig wachtwoord klopt niet' }, { status: 403 });
  }

  const { newPassword } = body;
  if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Nieuw wachtwoord moet minstens ${MIN_PASSWORD_LENGTH} tekens zijn` },
      { status: 400 },
    );
  }

  await setPassword(newPassword);
  return NextResponse.json({ ok: true });
}
