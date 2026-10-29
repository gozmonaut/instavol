import { NextResponse } from 'next/server';
import { and, asc, count, eq, lt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fetchPageText } from '@/lib/extractPage';
import { saveReaderContent } from '@/lib/processLink';
import { links } from '@/lib/schema';

const BATCH_SIZE = 5;

// One-off: fetch saved items again for their thumbnail and reader view, without Gemini,
// so summaries and categories stay as they are. Works like recategorize: the first call
// starts a run and returns `since`; pass it back until `remaining` is 0.
// Items touched after `since` count as done, also when their page couldn't be read.
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

  let processed = 0;
  const failed: { url: string; error: string }[] = [];
  for (const item of batch) {
    try {
      await saveReaderContent(item.id, await fetchPageText(item.url));
    } catch (error) {
      failed.push({ url: item.url, error: error instanceof Error ? error.message : String(error) });
    }
    await db.update(links).set({ updatedAt: new Date() }).where(eq(links.id, item.id));
    processed++;
  }

  const [{ remaining }] = await db.select({ remaining: count() }).from(links).where(todo);
  return NextResponse.json({ since: since.toISOString(), processed, remaining, failed });
}
