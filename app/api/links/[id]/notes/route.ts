import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getUserId } from '@/lib/currentUser';
import { db } from '@/lib/db';
import { ownedLink } from '@/lib/links';
import { links, type LinkNote } from '@/lib/schema';

const MAX_NOTE_LENGTH = 2000;

// Adds a note to an item; returns the updated item.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  let body: { text?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_NOTE_LENGTH) : '';
  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  const note: LinkNote = { id: crypto.randomUUID(), text, createdAt: new Date().toISOString() };
  // Appended in the database, so two notes saved at once don't overwrite each other.
  const [row] = await db
    .update(links)
    .set({ notes: sql`${links.notes} || ${JSON.stringify([note])}::jsonb`, updatedAt: new Date() })
    .where(ownedLink(userId, id))
    .returning();
  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(row, { status: 201 });
}
