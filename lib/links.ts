import { and, arrayContains, count, desc, eq, ilike, isNotNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { links, type LinkRow } from '@/lib/schema';

// Escape LIKE wildcards so user input like "100%" is matched literally.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function getLinks(filters: { q?: string; category?: string; tag?: string }): Promise<LinkRow[]> {
  const term = filters.q?.trim();
  const pattern = term ? `%${escapeLike(term)}%` : undefined;

  return db
    .select()
    .from(links)
    .where(
      and(
        pattern
          ? or(
              ilike(links.title, pattern),
              ilike(links.summary, pattern),
              // Also finds items by one of their tags (part of a tag is enough).
              sql`exists (select 1 from unnest(${links.tags}) as tag where tag ilike ${pattern})`,
            )
          : undefined,
        filters.category ? eq(links.category, filters.category) : undefined,
        filters.tag ? arrayContains(links.tags, [filters.tag]) : undefined,
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

// All tags in use, most used first (ties alphabetically).
export async function getTagsByUsage(): Promise<string[]> {
  const expanded = db
    .select({ tag: sql<string>`unnest(${links.tags})`.as('tag') })
    .from(links)
    .as('expanded');
  const rows = await db
    .select({ tag: expanded.tag, uses: count() })
    .from(expanded)
    .groupBy(expanded.tag)
    .orderBy(desc(count()), expanded.tag);
  return rows.map((row) => row.tag);
}
