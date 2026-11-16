import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getUserId } from '@/lib/currentUser';
import { db } from '@/lib/db';
import { ownedLink } from '@/lib/links';
import { isRecipeHtml } from '@/lib/recipe';
import { linkContents, links } from '@/lib/schema';

// The saved article for the reader view (already cleaned and sanitized when it was saved);
// `recipe` tells the reader to show only the recipe.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  // The article hangs off a link, so it is only readable by that link's owner.
  const [link] = await db.select({ id: links.id }).from(links).where(ownedLink(userId, id));
  const [row] = link ? await db.select().from(linkContents).where(eq(linkContents.linkId, id)) : [];
  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ html: row.html, recipe: isRecipeHtml(row.html) });
}
