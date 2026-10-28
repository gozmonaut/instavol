import { NextResponse } from 'next/server';
import { and, asc, count, desc, eq, gte, isNotNull, lt } from 'drizzle-orm';
import { normalizeCategory } from '@/lib/categories';
import { db } from '@/lib/db';
import { categorize } from '@/lib/gemini';
import { links } from '@/lib/schema';

const BATCH_SIZE = 5;

// One-off recategorization of saved items with the current category rules, in small batches.
// The first call starts a run and returns `since`; pass it back until `remaining` is 0.
// Items touched after `since` count as done; only categories from this run are offered for reuse,
// so the old categories don't leak back in.
export async function POST(request: Request): Promise<Response> {
  let body: { since?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // No body: start a new run.
  }
  const since = typeof body.since === 'string' && !Number.isNaN(Date.parse(body.since)) ? new Date(body.since) : new Date();

  const todo = and(eq(links.status, 'done'), lt(links.updatedAt, since));
  const batch = await db.select().from(links).where(todo).orderBy(asc(links.createdAt)).limit(BATCH_SIZE);

  const runCategoryRows = await db
    .select({ category: links.category, uses: count() })
    .from(links)
    .where(and(gte(links.updatedAt, since), isNotNull(links.category)))
    .groupBy(links.category)
    .orderBy(desc(count()), links.category);
  const runCategories = runCategoryRows.map((row) => row.category).filter((c): c is string => c !== null);

  let processed = 0;
  for (const item of batch) {
    let category: string | null;
    try {
      const suggestion = await categorize(item.title ?? item.url, item.summary ?? '', [...runCategories]);
      category = normalizeCategory(suggestion, runCategories);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ error: message, since: since.toISOString(), processed }, { status: 502 });
    }

    await db.update(links).set({ category, updatedAt: new Date() }).where(eq(links.id, item.id));
    if (category && !runCategories.includes(category)) runCategories.push(category);
    processed++;
  }

  const [{ remaining }] = await db.select({ remaining: count() }).from(links).where(todo);
  return NextResponse.json({ since: since.toISOString(), processed, remaining });
}
