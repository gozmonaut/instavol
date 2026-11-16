import { NextResponse } from 'next/server';
import { createImageItem, createNoteItem, ItemInputError } from '@/lib/createItem';
import type { LinkRow } from '@/lib/schema';

function created(row: LinkRow): Response {
  return NextResponse.json(row, { status: 201 });
}

function failure(error: unknown): Response {
  if (error instanceof ItemInputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  throw error;
}

export function isMultipart(request: Request): boolean {
  return (request.headers.get('content-type') ?? '').startsWith('multipart/form-data');
}

// multipart/form-data with a `file` (and optionally a `title`): a screenshot or other image.
export async function imageResponse(request: Request, userId: string): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  try {
    return created(
      await createImageItem(userId, {
        bytes: Buffer.from(await file.arrayBuffer()),
        mime: file.type,
        title: form.get('title'),
      }),
    );
  } catch (error) {
    return failure(error);
  }
}

// JSON with `text` (and optionally a `title`) instead of a url: a loose note.
export async function noteResponse(userId: string, body: { text: unknown; title?: unknown }): Promise<Response> {
  try {
    const row = await createNoteItem(userId, body);
    return created(row);
  } catch (error) {
    return failure(error);
  }
}
