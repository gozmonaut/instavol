import { db } from '@/lib/db';
import { links } from '@/lib/schema';
import { eq, isNotNull } from 'drizzle-orm';
import { fetchPageText } from '@/lib/extractPage';
import { summarizeAndCategorize } from '@/lib/gemini';

export async function processLink(id: string): Promise<void> {
  try {
    const [row] = await db.select().from(links).where(eq(links.id, id));
    const { title, text } = await fetchPageText(row.url);

    if (!row.title) {
      await db.update(links).set({ title }).where(eq(links.id, id));
    }

    const existingCategoryRows = await db
      .selectDistinct({ category: links.category })
      .from(links)
      .where(isNotNull(links.category));
    const existingCategories = existingCategoryRows
      .map((r) => r.category)
      .filter((category): category is string => category !== null);

    const { summary, category } = await summarizeAndCategorize(text, existingCategories);

    await db
      .update(links)
      .set({ summary, category, status: 'done', updatedAt: new Date() })
      .where(eq(links.id, id));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(links)
      .set({ status: 'failed', errorMessage: message, updatedAt: new Date() })
      .where(eq(links.id, id));
  }
}
