import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getUserId } from '@/lib/currentUser';
import { db } from '@/lib/db';
import { ownedLink } from '@/lib/links';
import { links } from '@/lib/schema';

// Removes one highlight from an item; returns the updated item.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; highlightId: string }> },
): Promise<Response> {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id, highlightId } = await params;

  const [row] = await db
    .update(links)
    .set({
      highlights: sql`(
        select coalesce(jsonb_agg(highlight order by position), '[]'::jsonb)
        from jsonb_array_elements(${links.highlights}) with ordinality as kept(highlight, position)
        where highlight->>'id' <> ${highlightId}
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
