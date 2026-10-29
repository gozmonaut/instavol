import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { lookup } from 'node:dns/promises';
import { BlockList } from 'node:net';
import { cleanArticleHtml } from '@/lib/articleHtml';

const MIN_ARTICLE_TEXT_LENGTH = 200;
const WORDS_PER_MINUTE = 230;
const MAX_ARTICLE_TEXT_LENGTH = 25_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;
const ALLOWED_CONTENT_TYPES = ['text/html', 'application/xhtml+xml'];

const blockedAddresses = new BlockList();
blockedAddresses.addSubnet('0.0.0.0', 8, 'ipv4');
blockedAddresses.addSubnet('127.0.0.0', 8, 'ipv4');
blockedAddresses.addSubnet('10.0.0.0', 8, 'ipv4');
blockedAddresses.addSubnet('172.16.0.0', 12, 'ipv4');
blockedAddresses.addSubnet('192.168.0.0', 16, 'ipv4');
blockedAddresses.addSubnet('169.254.0.0', 16, 'ipv4');
blockedAddresses.addAddress('::', 'ipv6');
blockedAddresses.addAddress('::1', 'ipv6');
blockedAddresses.addSubnet('fc00::', 7, 'ipv6');
blockedAddresses.addSubnet('fe80::', 10, 'ipv6');

export class PageFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PageFetchError';
  }
}

// Never retried another way: the address is blocked on purpose.
export class DisallowedHostError extends PageFetchError {
  constructor() {
    super('Dit adres mag niet opgehaald worden');
    this.name = 'DisallowedHostError';
  }
}

export async function isDisallowedHost(hostname: string): Promise<boolean> {
  const bareHostname = hostname.replace(/^\[|\]$/g, '');
  const addresses = await lookup(bareHostname, { all: true });
  return addresses.some(({ address, family }) =>
    blockedAddresses.check(address, family === 6 ? 'ipv6' : 'ipv4'),
  );
}

async function fetchFollowingRedirects(startUrl: string): Promise<Response> {
  let currentUrl = new URL(startUrl);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (await isDisallowedHost(currentUrl.hostname)) {
      throw new DisallowedHostError();
    }

    let response: Response;
    try {
      response = await fetch(currentUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; InstavolBot/1.0)' },
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : undefined;
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new PageFetchError('Pagina reageert niet binnen de tijdslimiet');
      }
      throw error;
    }

    const isRedirect = response.status >= 300 && response.status < 400;
    const location = response.headers.get('location');
    if (isRedirect && location) {
      currentUrl = new URL(location, currentUrl);
      continue;
    }

    return response;
  }

  throw new PageFetchError('Te veel doorverwijzingen');
}

export type PageArticle = {
  html: string;
  byline: string | null;
  publishedAt: Date | null;
  readingMinutes: number;
};

export type PageContent = {
  title: string;
  text: string;
  imageUrl?: string | null;
  // Only for pages that read as an article: what the reader view shows.
  article?: PageArticle | null;
};

export async function fetchPageText(url: string): Promise<PageContent> {
  const response = await fetchFollowingRedirects(url);

  if (!response.ok) {
    throw new PageFetchError(`Pagina niet beschikbaar (HTTP ${response.status})`);
  }

  const contentType = response.headers.get('content-type');
  if (contentType && !ALLOWED_CONTENT_TYPES.some((allowed) => contentType.toLowerCase().includes(allowed))) {
    throw new PageFetchError('Pagina is geen leesbare webpagina');
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES) {
    throw new PageFetchError('Pagina is te groot om te verwerken');
  }

  const html = await response.text();
  if (html.length > MAX_RESPONSE_BYTES) {
    throw new PageFetchError('Pagina is te groot om te verwerken');
  }

  let article: ReturnType<Readability['parse']>;
  let page: { title: string; text: string };
  let imageUrl: string | null;
  const pageUrl = response.url || url;
  const dom = new JSDOM(html, { url: pageUrl });
  try {
    // Readability changes the document it parses, so the plain-page fallback reads it first.
    page = describePage(dom.window.document);
    imageUrl = pageImage(dom.window.document, pageUrl);
    // Classes help cleanArticleHtml spot author photos; it strips them afterwards.
    article = new Readability(dom.window.document, { keepClasses: true }).parse();
  } finally {
    dom.window.close();
  }

  const text = article?.textContent?.trim() ?? '';
  if (article && text.length >= MIN_ARTICLE_TEXT_LENGTH) {
    const byline = article.byline?.trim() || null;
    const articleHtml = article.content ? cleanArticleHtml(article.content, pageUrl, byline) : null;
    return {
      title: article.title || page.title,
      text: text.slice(0, MAX_ARTICLE_TEXT_LENGTH),
      imageUrl,
      article: articleHtml
        ? {
            html: articleHtml,
            byline,
            publishedAt: parseDate(article.publishedTime),
            readingMinutes: Math.max(1, Math.round(text.split(/\s+/).length / WORDS_PER_MINUTE)),
          }
        : null,
    };
  }

  // Not an article (a homepage, product, tool, ...): use its title, description and visible text.
  if (page.text.length < MIN_ARTICLE_TEXT_LENGTH) {
    throw new PageFetchError('Geen leesbare inhoud gevonden');
  }
  return { title: page.title, text: page.text.slice(0, MAX_ARTICLE_TEXT_LENGTH), imageUrl };
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// The page's share image (og:image), used as thumbnail; only http(s) addresses.
function pageImage(document: Document, pageUrl: string): string | null {
  const value =
    metaContent(document, 'meta[property="og:image"]') ||
    metaContent(document, 'meta[name="twitter:image"]') ||
    metaContent(document, 'meta[name="twitter:image:src"]');
  if (!value) return null;
  try {
    const imageUrl = new URL(value, pageUrl);
    return imageUrl.protocol === 'https:' || imageUrl.protocol === 'http:' ? imageUrl.href : null;
  } catch {
    return null;
  }
}

function metaContent(document: Document, selector: string): string {
  return document.querySelector(selector)?.getAttribute('content')?.trim() ?? '';
}

function describePage(document: Document): { title: string; text: string } {
  const title = metaContent(document, 'meta[property="og:title"]') || document.title.trim();
  const description =
    metaContent(document, 'meta[name="description"]') || metaContent(document, 'meta[property="og:description"]');

  const body = document.body?.cloneNode(true) as HTMLElement | undefined;
  body?.querySelectorAll('script, style, noscript, template, svg').forEach((element) => element.remove());
  const visibleText = body?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  const text = [title && `Titel: ${title}`, description && `Beschrijving: ${description}`, visibleText]
    .filter(Boolean)
    .join('\n\n');
  return { title, text };
}
