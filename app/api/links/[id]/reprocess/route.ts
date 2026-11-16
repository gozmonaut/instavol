import { NextResponse } from 'next/server';
import { getUserId } from '@/lib/currentUser';
import { db } from '@/lib/db';
import { ownedLink } from '@/lib/links';
import { links } from '@/lib/schema';
import { processLink } from '@/lib/processLink';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  const [existing] = await db.select().from(links).where(ownedLink(userId, id));
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await processLink(id);

  const [row] = await db.select().from(links).where(ownedLink(userId, id));
  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(row);
}
