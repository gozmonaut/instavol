import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { links } from '@/lib/schema';
import { processLink } from '@/lib/processLink';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  const [existing] = await db.select().from(links).where(eq(links.id, id));
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await processLink(id);

  const [row] = await db.select().from(links).where(eq(links.id, id));
  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(row);
}
