import { NextResponse, after } from 'next/server';
import { db } from '@/lib/db';
import { getLinks } from '@/lib/links';
import { imageResponse, isMultipart, noteResponse } from '@/lib/itemResponses';
import { processLink } from '@/lib/processLink';
import { links as linksTable } from '@/lib/schema';
import { parseShareUrl } from '@/lib/shareUrl';

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const links = await getLinks({
    q: searchParams.get('q') ?? undefined,
    category: searchParams.get('category') ?? undefined,
    tag: searchParams.get('tag') ?? undefined,
  });

  return NextResponse.json({ links });
}

// Saving from the website itself; protected by the site's Basic Auth (see proxy.ts).
export async function POST(request: Request): Promise<Response> {
  if (isMultipart(request)) return imageResponse(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Text without a url is a loose note.
  if (typeof (body as { text?: unknown } | null)?.text === 'string' && (body as { url?: unknown }).url === undefined) {
    return noteResponse(body as { text: string; title?: unknown });
  }

  const url = parseShareUrl((body as { url?: unknown } | null)?.url);
  if (!url) {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
  }

  const [row] = await db.insert(linksTable).values({ url }).returning();

  after(() => processLink(row.id).catch(console.error));

  return NextResponse.json(row, { status: 201 });
}
