import { randomUUID } from 'node:crypto';
import { NextResponse, after } from 'next/server';
import { MAX_NOTE_LENGTH } from '@/lib/createItem';
import { db } from '@/lib/db';
import { links } from '@/lib/schema';
import { imageResponse, isMultipart, noteResponse } from '@/lib/itemResponses';
import { processLink } from '@/lib/processLink';
import { userIdForShareToken } from '@/lib/shareTokens';

const BEARER_PREFIX = 'Bearer ';

export async function POST(request: Request): Promise<Response> {
  // Saving from the share menu: the personal token says whose collection the link goes into.
  const header = request.headers.get('authorization');
  const userId = header?.startsWith(BEARER_PREFIX) ? await userIdForShareToken(header.slice(BEARER_PREFIX.length)) : null;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (isMultipart(request)) return imageResponse(request, userId);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Text without a url is a loose note.
  if (typeof (body as { text?: unknown } | null)?.text === 'string' && (body as { url?: unknown }).url === undefined) {
    return noteResponse(userId, body as { text: string; title?: unknown });
  }

  const rawUrl = (body as { url?: unknown } | null)?.url;
  const title = (body as { title?: unknown } | null)?.title;

  if (typeof rawUrl !== 'string') {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }

  // new URL() silently strips inner newlines, so "url\nurl" (a list joined by Shortcuts) would parse.
  const url = rawUrl.trim();
  if (/\s/.test(url)) {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
  }

  // Text sent along with a url (a Safari page with selected text) becomes the link's first note.
  const rawText = (body as { text?: unknown }).text;
  const text = typeof rawText === 'string' ? rawText.trim() : '';
  if (text.length > MAX_NOTE_LENGTH) {
    return NextResponse.json({ error: 'text is too long' }, { status: 400 });
  }
  const notes = text ? [{ id: randomUUID(), text, createdAt: new Date().toISOString() }] : [];

  const [row] = await db
    .insert(links)
    .values({ url, userId, title: typeof title === 'string' ? title : null, notes })
    .returning();

  after(() => processLink(row.id).catch(console.error));

  return NextResponse.json(
    { id: row.id, url: row.url, title: row.title, status: row.status },
    { status: 201 },
  );
}
