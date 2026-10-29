import { db } from '@/lib/db';
import { links } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { normalizeCategory } from '@/lib/categories';
import { DisallowedHostError, fetchPageText } from '@/lib/extractPage';
import { summarizeAndCategorize, summarizeUrlAndCategorize } from '@/lib/gemini';
import { getCategoriesByUsage } from '@/lib/links';

export async function processLink(id: string): Promise<void> {
  try {
    const [row] = await db.select().from(links).where(eq(links.id, id));

    let page: { title: string; text: string } | null = null;
    let fetchError: unknown = null;
    try {
      page = await fetchPageText(row.url);
    } catch (error) {
      if (error instanceof DisallowedHostError) throw error;
      fetchError = error;
    }

    if (page && !row.title) {
      await db.update(links).set({ title: page.title }).where(eq(links.id, id));
    }

    const existingCategories = await getCategoriesByUsage();

    let result: { summary: string; category: string };
    if (page) {
      result = await summarizeAndCategorize(page.text, existingCategories);
    } else {
      // We couldn't read the page ourselves; let Gemini open the URL instead.
      try {
        const fromUrl = await summarizeUrlAndCategorize(row.url, existingCategories);
        if (!row.title && fromUrl.title) {
          await db.update(links).set({ title: fromUrl.title }).where(eq(links.id, id));
        }
        result = fromUrl;
      } catch (geminiError) {
        const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));
        throw new Error(`${reason(fetchError)} (ook via Gemini niet gelukt: ${reason(geminiError)})`);
      }
    }
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
