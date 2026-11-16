import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { normalizeCategory } from '@/lib/categories';
import { getUserId } from '@/lib/currentUser';
import { db } from '@/lib/db';
import { getCategoriesByUsage, ownedLink } from '@/lib/links';
import { MAX_NOTE_LENGTH, NOTES_CATEGORY } from '@/lib/createItem';
import { links, type LinkNote } from '@/lib/schema';
import { normalizeTags } from '@/lib/tags';

const MAX_TITLE_LENGTH = 200;

// Manually change an item's title, category and/or tags, or the text of a loose note or image.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  let body: { title?: unknown; text?: unknown; category?: unknown; tags?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const changes: { title?: string; notes?: LinkNote[]; category?: string; tags?: string[] } = {};

  if (body.title !== undefined) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title || title.length > MAX_TITLE_LENGTH) {
      return NextResponse.json({ error: `title must be 1-${MAX_TITLE_LENGTH} characters` }, { status: 400 });
    }
    changes.title = title;
  }

  if (body.text !== undefined) {
    const text = typeof body.text === 'string' ? body.text.trim() : null;
    if (text === null || text.length > MAX_NOTE_LENGTH) {
      return NextResponse.json({ error: `text must be at most ${MAX_NOTE_LENGTH} characters` }, { status: 400 });
    }
    const [existing] = await db.select().from(links).where(ownedLink(userId, id));
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    // A note is its text, so it can't be empty; an image may have a description, or none.
    if (existing.kind === 'link' || (existing.kind === 'note' && !text)) {
      return NextResponse.json({ error: 'No text to set on this item' }, { status: 400 });
    }
    const first = existing.notes[0] ?? { id: randomUUID(), text, createdAt: new Date().toISOString() };
    changes.notes = text ? [{ ...first, text }, ...existing.notes.slice(1)] : existing.notes.slice(1);
    // An image that gets a note of its own becomes a "Notities" item, unless it already has a category.
    if (existing.kind === 'image' && text && !existing.category && body.category === undefined) {
      changes.category = normalizeCategory(NOTES_CATEGORY, await getCategoriesByUsage(userId)) ?? NOTES_CATEGORY;
    }
  }

  if (body.tags !== undefined) {
    const tags = normalizeTags(body.tags);
    if (!tags) {
      return NextResponse.json({ error: 'tags must be a list of strings' }, { status: 400 });
    }
    changes.tags = tags;
  }

  if (body.category !== undefined || (body.tags === undefined && body.title === undefined && body.text === undefined)) {
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
