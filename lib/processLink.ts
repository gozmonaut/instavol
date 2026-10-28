import { db } from '@/lib/db';
import { links } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { normalizeCategory } from '@/lib/categories';
import { fetchPageText } from '@/lib/extractPage';
import { summarizeAndCategorize } from '@/lib/gemini';
import { getCategoriesByUsage } from '@/lib/links';

export async function processLink(id: string): Promise<void> {
  try {
    const [row] = await db.select().from(links).where(eq(links.id, id));
    const { title, text } = await fetchPageText(row.url);

    if (!row.title) {
      await db.update(links).set({ title }).where(eq(links.id, id));
    }

    const existingCategories = await getCategoriesByUsage();

    const result = await summarizeAndCategorize(text, existingCategories);
    const category = normalizeCategory(result.category, existingCategories);

    await db
      .update(links)
      .set({ summary: result.summary, category, status: 'done', updatedAt: new Date() })
      .where(eq(links.id, id));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(links)
      .set({ status: 'failed', errorMessage: message, updatedAt: new Date() })
      .where(eq(links.id, id));
  }
}
