import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { links } from '@/lib/schema';

// Removes one note from an item; returns the updated item.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> },
): Promise<Response> {
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
    .where(eq(links.id, id))
    .returning();
  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(row);
}
