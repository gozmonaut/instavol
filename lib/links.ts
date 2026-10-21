import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { links, type LinkRow } from '@/lib/schema';

// Escape LIKE wildcards so user input like "100%" is matched literally.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function getLinks(filters: { q?: string; category?: string }): Promise<LinkRow[]> {
  const term = filters.q?.trim();
  const pattern = term ? `%${escapeLike(term)}%` : undefined;

  return db
    .select()
    .from(links)
    .where(
      and(
        pattern ? or(ilike(links.title, pattern), ilike(links.summary, pattern)) : undefined,
        filters.category ? eq(links.category, filters.category) : undefined,
      ),
    )
    .orderBy(desc(links.createdAt));
}
