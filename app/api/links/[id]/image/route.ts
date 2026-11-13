import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ItemInputError, removeItemImage, setItemImage } from '@/lib/createItem';
import { linkImages } from '@/lib/schema';

// The bytes of an uploaded image; behind the site's session like every other /api route (see proxy.ts).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  const [row] = await db.select().from(linkImages).where(eq(linkImages.linkId, id));
  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return new Response(new Uint8Array(row.data), {
    headers: { 'Content-Type': row.mime, 'Cache-Control': 'private, max-age=31536000, immutable' },
  });
}

function failure(error: unknown): Response {
  if (error instanceof ItemInputError) return NextResponse.json({ error: error.message }, { status: 400 });
  throw error;
}

// multipart/form-data with a `file`: adds or replaces the picture of a note or an uploaded image.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get('file');
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  try {
    const row = await setItemImage(id, { bytes: Buffer.from(await file.arrayBuffer()), mime: file.type });
    return row ? NextResponse.json(row) : NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  try {
    const row = await removeItemImage(id);
    return row ? NextResponse.json(row) : NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error) {
    return failure(error);
  }
}
