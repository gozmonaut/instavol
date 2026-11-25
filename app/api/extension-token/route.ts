import { NextResponse } from 'next/server';
import { getUserId } from '@/lib/currentUser';
import { createShareToken } from '@/lib/shareTokens';

// Pairing the Safari extension: makes its own token (replacing an earlier extension token,
// not the shortcut's). The token is shown once, to the pairing page that hands it to the extension.
export async function POST(): Promise<Response> {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ token: await createShareToken(userId, 'extension') });
}
