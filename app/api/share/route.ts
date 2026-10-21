import { NextResponse, after } from 'next/server';
import { isValidApiToken } from '@/lib/auth';
import { db } from '@/lib/db';
import { links } from '@/lib/schema';
import { processLink } from '@/lib/processLink';

export async function POST(request: Request): Promise<Response> {
  if (!isValidApiToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const url = (body as { url?: unknown } | null)?.url;
  const title = (body as { title?: unknown } | null)?.title;

  if (typeof url !== 'string') {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
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

  const [row] = await db
    .insert(links)
    .values({ url, title: typeof title === 'string' ? title : null })
    .returning();

  after(() => processLink(row.id).catch(console.error));

  return NextResponse.json(
    { id: row.id, url: row.url, title: row.title, status: row.status },
    { status: 201 },
  );
}
