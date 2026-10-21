import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { lookup } from 'node:dns/promises';
import { BlockList } from 'node:net';

const MIN_ARTICLE_TEXT_LENGTH = 200;
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
      throw new PageFetchError('Dit adres mag niet opgehaald worden');
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

export async function fetchPageText(url: string): Promise<{ title: string; text: string }> {
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
  let documentTitle: string;
  const dom = new JSDOM(html, { url: response.url || url });
  try {
    article = new Readability(dom.window.document).parse();
    documentTitle = dom.window.document.title;
  } finally {
    dom.window.close();
  }

  const text = article?.textContent?.trim() ?? '';
  if (!article || text.length < MIN_ARTICLE_TEXT_LENGTH) {
    throw new PageFetchError('Geen leesbare inhoud gevonden');
  }

  return {
    title: article.title || documentTitle,
    text: text.slice(0, MAX_ARTICLE_TEXT_LENGTH),
  };
}
