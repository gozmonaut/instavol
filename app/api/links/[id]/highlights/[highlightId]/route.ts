import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { links } from '@/lib/schema';

// Removes one highlight from an item; returns the updated item.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; highlightId: string }> },
): Promise<Response> {
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
    .where(eq(links.id, id))
    .returning();
  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(row);
}
