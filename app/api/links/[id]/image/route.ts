import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getUserId } from '@/lib/currentUser';
import { db } from '@/lib/db';
import { ItemInputError, removeItemImage, setItemImage } from '@/lib/createItem';
import { ownedLink } from '@/lib/links';
import { linkImages, links } from '@/lib/schema';

const UNAUTHORIZED = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

// The bytes of an uploaded image, only for the item's owner: someone else's item counts as not existing.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return UNAUTHORIZED();
  const { id } = await params;

  const [owned] = await db.select({ id: links.id }).from(links).where(ownedLink(userId, id));
  const [row] = owned ? await db.select().from(linkImages).where(eq(linkImages.linkId, id)) : [];
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
  const userId = await getUserId();
  if (!userId) return UNAUTHORIZED();
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
    const row = await setItemImage(userId, id, { bytes: Buffer.from(await file.arrayBuffer()), mime: file.type });
    return row ? NextResponse.json(row) : NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return UNAUTHORIZED();
  const { id } = await params;

  try {
    const row = await removeItemImage(userId, id);
    return row ? NextResponse.json(row) : NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error) {
    return failure(error);
  }
}
