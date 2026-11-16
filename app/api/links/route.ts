import { NextResponse, after } from 'next/server';
import { getUserId } from '@/lib/currentUser';
import { db } from '@/lib/db';
import { getLinks } from '@/lib/links';
import { imageResponse, isMultipart, noteResponse } from '@/lib/itemResponses';
import { processLink } from '@/lib/processLink';
import { links as linksTable } from '@/lib/schema';
import { parseShareUrl } from '@/lib/shareUrl';

export async function GET(request: Request): Promise<Response> {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const links = await getLinks(userId, {
    q: searchParams.get('q') ?? undefined,
    category: searchParams.get('category') ?? undefined,
    tag: searchParams.get('tag') ?? undefined,
  });

  return NextResponse.json({ links });
}

// Saving from the website itself, into the signed-in user's own collection.
export async function POST(request: Request): Promise<Response> {
  const userId = await getUserId();
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

  const url = parseShareUrl((body as { url?: unknown } | null)?.url);
  if (!url) {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
  }

  const [row] = await db.insert(linksTable).values({ url, userId }).returning();

  after(() => processLink(row.id).catch(console.error));

  return NextResponse.json(row, { status: 201 });
}
