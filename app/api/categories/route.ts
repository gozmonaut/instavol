import { NextResponse } from 'next/server';
import { getUserId } from '@/lib/currentUser';
import { getCategoriesByUsage } from '@/lib/links';

export async function GET(): Promise<Response> {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ categories: await getCategoriesByUsage(userId) });
}
