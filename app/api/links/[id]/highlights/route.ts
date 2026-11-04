import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { links, type LinkHighlight } from '@/lib/schema';

const MAX_TEXT_LENGTH = 4000;
const MAX_CONTEXT_LENGTH = 64;
const MAX_HIGHLIGHTS = 200;

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

// Adds a highlight to an item; returns the updated item.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  let body: { text?: unknown; prefix?: unknown; suffix?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const text = clean(body.text, MAX_TEXT_LENGTH).trim();
  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  const [current] = await db.select({ highlights: links.highlights }).from(links).where(eq(links.id, id));
  if (!current) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (current.highlights.length >= MAX_HIGHLIGHTS) {
    return NextResponse.json({ error: 'Too many highlights on this item' }, { status: 400 });
  }

  const highlight: LinkHighlight = {
    id: crypto.randomUUID(),
    text,
    prefix: clean(body.prefix, MAX_CONTEXT_LENGTH),
    suffix: clean(body.suffix, MAX_CONTEXT_LENGTH),
    createdAt: new Date().toISOString(),
  };
  // Appended in the database, so two highlights saved at once don't overwrite each other.
  const [row] = await db
    .update(links)
    .set({ highlights: sql`${links.highlights} || ${JSON.stringify([highlight])}::jsonb`, updatedAt: new Date() })
    .where(eq(links.id, id))
    .returning();
  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(row, { status: 201 });
}
