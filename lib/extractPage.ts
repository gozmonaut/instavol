import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

export class PageFetchError extends Error {}

export async function fetchPageText(url: string): Promise<{ title: string; text: string }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new PageFetchError(`Pagina niet beschikbaar (HTTP ${response.status})`);
  }

  const html = await response.text();
  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();

  if (!article || !article.textContent?.trim()) {
    throw new PageFetchError('Geen leesbare inhoud gevonden');
  }

  return {
    title: article.title || dom.window.document.title,
    text: article.textContent.trim(),
  };
}
