import { and, count, desc, eq, ilike, isNotNull, or } from 'drizzle-orm';
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

// All categories in use, most used first (ties alphabetically, so the order is stable).
export async function getCategoriesByUsage(): Promise<string[]> {
  const rows = await db
    .select({ category: links.category, uses: count() })
    .from(links)
    .where(isNotNull(links.category))
    .groupBy(links.category)
    .orderBy(desc(count()), links.category);
  return rows.map((row) => row.category).filter((category): category is string => category !== null);
}
