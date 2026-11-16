import { NextResponse } from 'next/server';
import { getUserId } from '@/lib/currentUser';
import { createShareToken, hasShareToken } from '@/lib/shareTokens';

// Whether the signed-in user already has a token for the share-menu shortcut (the token itself is never shown again).
export async function GET(): Promise<Response> {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ exists: await hasShareToken(userId) });
}

// Makes a new token, replacing the old one.
export async function POST(): Promise<Response> {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ token: await createShareToken(userId) });
}
