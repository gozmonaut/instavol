import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getUserId } from '@/lib/currentUser';
import { db } from '@/lib/db';
import { ownedLink } from '@/lib/links';
import { links } from '@/lib/schema';

// Removes one note from an item; returns the updated item.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> },
): Promise<Response> {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id, noteId } = await params;

  const [row] = await db
    .update(links)
    .set({
      notes: sql`(
        select coalesce(jsonb_agg(note order by position), '[]'::jsonb)
        from jsonb_array_elements(${links.notes}) with ordinality as kept(note, position)
        where note->>'id' <> ${noteId}
      )`,
      updatedAt: new Date(),
    })
    .where(ownedLink(userId, id))
    .returning();
  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(row);
}
