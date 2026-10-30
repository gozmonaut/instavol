import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { isRecipeHtml } from '@/lib/recipe';
import { linkContents } from '@/lib/schema';

// The saved article for the reader view (already cleaned and sanitized when it was saved);
// `recipe` tells the reader to show only the recipe.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  const [row] = await db.select().from(linkContents).where(eq(linkContents.linkId, id));
  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ html: row.html, recipe: isRecipeHtml(row.html) });
}
