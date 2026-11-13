import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { normalizeCategory } from '@/lib/categories';
import { db } from '@/lib/db';
import { getCategoriesByUsage } from '@/lib/links';
import { linkImages, links, type LinkRow } from '@/lib/schema';

// Vercel Functions accept request bodies up to 4.5 MB.
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_NOTE_LENGTH = 2000;
const MAX_TITLE_LENGTH = 200;
const MAX_NOTE_TITLE = 60;
export const NOTES_CATEGORY = 'Notities';

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/heic']);

export class ItemInputError extends Error {}

function cleanTitle(title: unknown): string | null {
  if (typeof title !== 'string') return null;
  const trimmed = title.trim().slice(0, MAX_TITLE_LENGTH);
  return trimmed || null;
}

function defaultImageTitle(): string {
  const date = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());
  return `Afbeelding ${date}`;
}

function checkImage(bytes: Buffer, mimeType: string): string {
  const mime = mimeType.toLowerCase();
  if (!IMAGE_TYPES.has(mime)) throw new ItemInputError('Unsupported image type');
  if (bytes.length === 0) throw new ItemInputError('Empty file');
  if (bytes.length > MAX_IMAGE_BYTES) throw new ItemInputError('Image too large');
  return mime;
}

// An uploaded image or screenshot: stored as it is, no processing.
export async function createImageItem(input: { bytes: Buffer; mime: string; title?: unknown }): Promise<LinkRow> {
  const mime = checkImage(input.bytes, input.mime);

  const id = randomUUID();
  const [row] = await db
    .insert(links)
    .values({
      id,
      kind: 'image',
      title: cleanTitle(input.title) ?? defaultImageTitle(),
      status: 'done',
      imageUrl: `/api/links/${id}/image`,
    })
    .returning();
  await db.insert(linkImages).values({ linkId: id, mime, data: input.bytes });
  return row;
}

// Adds a picture to a note afterwards, or replaces the picture of a note or an uploaded image.
// Returns null when the item doesn't exist. Links keep the thumbnail of their page.
export async function setItemImage(id: string, input: { bytes: Buffer; mime: string }): Promise<LinkRow | null> {
  const [existing] = await db.select().from(links).where(eq(links.id, id));
  if (!existing) return null;
  if (existing.kind === 'link') throw new ItemInputError('A link keeps the image of its page');
  const mime = checkImage(input.bytes, input.mime);

  await db
    .insert(linkImages)
    .values({ linkId: id, mime, data: input.bytes })
    .onConflictDoUpdate({ target: linkImages.linkId, set: { mime, data: input.bytes, updatedAt: new Date() } });
  // The version in the url makes browsers fetch a replaced picture again (the route caches it for a year).
  const [row] = await db
    .update(links)
    .set({ imageUrl: `/api/links/${id}/image?v=${Date.now()}`, updatedAt: new Date() })
    .where(eq(links.id, id))
    .returning();
  return row;
}

// Takes the picture off a note. An uploaded image is nothing without it, so that one stays.
export async function removeItemImage(id: string): Promise<LinkRow | null> {
  const [existing] = await db.select().from(links).where(eq(links.id, id));
  if (!existing) return null;
  if (existing.kind !== 'note') throw new ItemInputError('Only a note can lose its image');

  await db.delete(linkImages).where(eq(linkImages.linkId, id));
  const [row] = await db.update(links).set({ imageUrl: null, updatedAt: new Date() }).where(eq(links.id, id)).returning();
  return row;
}

// The first line of a note, as a name for its card.
function noteTitle(text: string): string {
  const line = text.split('\n')[0].trim();
  return line.length > MAX_NOTE_TITLE ? `${line.slice(0, MAX_NOTE_TITLE).trimEnd()}…` : line;
}

// A loose note: its text becomes the item's first note. Nothing is sent to Gemini; the name is the first
// line of the text and the category is "Notities", both changeable afterwards.
export async function createNoteItem(input: { text: unknown; title?: unknown }): Promise<LinkRow> {
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  if (!text) throw new ItemInputError('text is required');
  if (text.length > MAX_NOTE_LENGTH) throw new ItemInputError('text is too long');

  const [row] = await db
    .insert(links)
    .values({
      kind: 'note',
      title: cleanTitle(input.title) ?? noteTitle(text),
      category: normalizeCategory(NOTES_CATEGORY, await getCategoriesByUsage()) ?? NOTES_CATEGORY,
      status: 'done',
      notes: [{ id: randomUUID(), text, createdAt: new Date().toISOString() }],
    })
    .returning();
  return row;
}
