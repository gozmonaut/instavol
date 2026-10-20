import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { lookup } from 'node:dns/promises';
import { BlockList } from 'node:net';

const MIN_ARTICLE_TEXT_LENGTH = 200;

const blockedAddresses = new BlockList();
blockedAddresses.addSubnet('127.0.0.0', 8, 'ipv4');
blockedAddresses.addSubnet('10.0.0.0', 8, 'ipv4');
blockedAddresses.addSubnet('172.16.0.0', 12, 'ipv4');
blockedAddresses.addSubnet('192.168.0.0', 16, 'ipv4');
blockedAddresses.addSubnet('169.254.0.0', 16, 'ipv4');
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

export async function fetchPageText(url: string): Promise<{ title: string; text: string }> {
  const { hostname } = new URL(url);
  if (await isDisallowedHost(hostname)) {
    throw new PageFetchError('Dit adres mag niet opgehaald worden');
  }

  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; InstavolBot/1.0)' },
  });
  if (!response.ok) {
    throw new PageFetchError(`Pagina niet beschikbaar (HTTP ${response.status})`);
  }

  const html = await response.text();
  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();

  const text = article?.textContent?.trim() ?? '';
  if (!article || text.length < MIN_ARTICLE_TEXT_LENGTH) {
    throw new PageFetchError('Geen leesbare inhoud gevonden');
  }

  return {
    title: article.title || dom.window.document.title,
    text,
  };
}
