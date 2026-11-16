import { NextResponse } from 'next/server';
import { normalizeCategory } from '@/lib/categories';
import { getUserId } from '@/lib/currentUser';
import { db } from '@/lib/db';
import { getCategoriesByUsage, ownedLink } from '@/lib/links';
import { links } from '@/lib/schema';
import { normalizeTags } from '@/lib/tags';

// Manually change an item's category and/or its tags.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  let body: { category?: unknown; tags?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const changes: { category?: string; tags?: string[] } = {};

  if (body.tags !== undefined) {
    const tags = normalizeTags(body.tags);
    if (!tags) {
      return NextResponse.json({ error: 'tags must be a list of strings' }, { status: 400 });
    }
    changes.tags = tags;
  }

  if (body.category !== undefined || body.tags === undefined) {
    const category = normalizeCategory(body.category, await getCategoriesByUsage(userId));
    if (!category) {
      return NextResponse.json({ error: 'category is required' }, { status: 400 });
    }
    changes.category = category;
  }

  const [row] = await db
    .update(links)
    .set({ ...changes, updatedAt: new Date() })
    .where(ownedLink(userId, id))
    .returning();
  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(row);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  const deleted = await db.delete(links).where(ownedLink(userId, id)).returning();
  if (deleted.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
