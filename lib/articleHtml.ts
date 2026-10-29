import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';

const MAX_ARTICLE_HTML_LENGTH = 500_000;
const SUBSTANTIAL_PARAGRAPH_LENGTH = 120;
const MAX_CLUTTER_TEXT_LENGTH = 300;
const MIN_LINK_LIST_DENSITY = 0.6;
const SMALL_IMAGE_PX = 150;
const AUTHOR_HINT = /avatar|author|byline|headshot|profile|contributor/i;
// "Jane Doe is the Verge's weekend editor…": the author's bio, not the article.
const BIO_VERB = /^(is|was|covers|writes|reports|has)\b/i;

const ALLOWED_TAGS = [
  'p', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'em', 'strong', 'b', 'i', 'u', 's', 'sub', 'sup', 'br', 'hr', 'a', 'img', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
];
const ALLOWED_ATTR = ['href', 'src', 'alt', 'title', 'colspan', 'rowspan'];

function textOf(element: Element): string {
  return element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function authorName(byline: string | null): string | null {
  const name = byline?.replace(/^(by|door|von|par)\s+/i, '').split(/[,|•·]/)[0].trim();
  return name && name.length >= 3 ? name : null;
}

function isBio(element: Element, name: string | null): boolean {
  if (!name || element.tagName !== 'P') return false;
  const text = textOf(element);
  return text.startsWith(name) && BIO_VERB.test(text.slice(name.length).trim());
}

function isImageOnly(element: Element): boolean {
  return ['IMG', 'PICTURE', 'FIGURE'].includes(element.tagName) || (!textOf(element) && element.querySelector('img') !== null);
}

function isAuthorImage(element: Element, root: Element): boolean {
  for (let node: Element | null = element; node && node !== root; node = node.parentElement) {
    const hints = [node.className, node.id, node.getAttribute('src'), node.getAttribute('alt')].join(' ');
    if (AUTHOR_HINT.test(hints)) return true;
  }
  const img = element.tagName === 'IMG' ? element : element.querySelector('img');
  const width = Number(img?.getAttribute('width'));
  const height = Number(img?.getAttribute('height'));
  return width > 0 && height > 0 && width <= SMALL_IMAGE_PX && height <= SMALL_IMAGE_PX;
}

// "Part Of / All the latest in AI / see all updates": short blocks that are mostly links.
function isLinkList(element: Element): boolean {
  const text = textOf(element);
  if (!text || text.length > MAX_CLUTTER_TEXT_LENGTH) return false;
  const linkText = Array.from(element.querySelectorAll('a')).reduce((sum, a) => sum + textOf(a).length, 0);
  return linkText / text.length >= MIN_LINK_LIST_DENSITY;
}

// Readability keeps site furniture above the story (series links, author photo and bio);
// everything before the first real paragraph that looks like that is dropped.
function removeLeadingClutter(root: Element, byline: string | null): void {
  const name = authorName(byline);
  const firstParagraph = Array.from(root.querySelectorAll('p')).find(
    (p) => textOf(p).length >= SUBSTANTIAL_PARAGRAPH_LENGTH && !isBio(p, name),
  );
  if (!firstParagraph) return;

  const leading = Array.from(root.querySelectorAll('*')).filter(
    (element) =>
      !element.contains(firstParagraph) &&
      Boolean(element.compareDocumentPosition(firstParagraph) & element.DOCUMENT_POSITION_FOLLOWING),
  );

  leading.forEach((element, index) => {
    if (!root.contains(element)) return;
    if (isBio(element, name)) {
      // The author photo usually sits right above the bio.
      for (let j = index - 1; j >= 0; j--) {
        const previous = leading[j];
        if (previous.contains(element) || !root.contains(previous)) continue;
        if (isImageOnly(previous)) previous.remove();
        else if (textOf(previous)) break;
      }
      element.remove();
    } else if (isImageOnly(element) && isAuthorImage(element, root)) {
      element.remove();
    } else if (!isImageOnly(element) && isLinkList(element)) {
      element.remove();
    }
  });
}

function firstSrcsetUrl(srcset: string | null | undefined): string | null {
  return srcset?.split(',')[0]?.trim().split(/\s+/)[0] || null;
}

// Images that only have a srcset (often inside <picture>) get a plain src, since srcset isn't kept.
function fixImageSources(document: Document, baseUrl: string): void {
  document.querySelectorAll('img').forEach((img) => {
    const source =
      img.getAttribute('src') ||
      firstSrcsetUrl(img.getAttribute('srcset')) ||
      firstSrcsetUrl(img.closest('picture')?.querySelector('source[srcset]')?.getAttribute('srcset'));
    if (!source) {
      img.remove();
      return;
    }
    try {
      img.setAttribute('src', new URL(source, baseUrl).href);
    } catch {
      img.remove();
    }
  });
}

const IMAGE_FILE = /\.(jpe?g|png|webp|gif|avif)$/i;

// The same photo at another size or crop (?w=, ?crop=) counts as the same image;
// for addresses without an image file name the query may be what picks the image, so it stays.
function imageKey(src: string): string {
  const url = new URL(src);
  return IMAGE_FILE.test(url.pathname) ? `${url.origin}${url.pathname}` : url.href;
}

// Sites often have the lead image twice (hero plus figure, or lazy image plus <noscript> copy).
// The first one stays; a figure or picture left without an image goes with its duplicate.
function removeDuplicateImages(document: Document): void {
  const seen = new Set<string>();
  document.querySelectorAll('img').forEach((img) => {
    const key = imageKey(img.getAttribute('src')!);
    if (!seen.has(key)) {
      seen.add(key);
      return;
    }
    const wrapper = img.closest('figure, picture');
    img.remove();
    if (wrapper && !wrapper.querySelector('img')) wrapper.remove();
  });
}

// Readability's article HTML, without leading clutter and reduced to safe, simple markup.
// Returns null when nothing (or too much) is left.
export function cleanArticleHtml(html: string, baseUrl: string, byline: string | null): string | null {
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`, { url: baseUrl });
  try {
    const { document } = dom.window;
    document.querySelectorAll('h1').forEach((h1) => {
      const h2 = document.createElement('h2');
      h2.append(...Array.from(h1.childNodes));
      h1.replaceWith(h2);
    });
    removeLeadingClutter(document.body, byline);
    fixImageSources(document, baseUrl);
    removeDuplicateImages(document);

    const purify = createDOMPurify(dom.window);
    purify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A') {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noreferrer noopener');
      }
      if (node.tagName === 'IMG') {
        node.setAttribute('loading', 'lazy');
        node.setAttribute('referrerpolicy', 'no-referrer');
      }
    });
    const clean = purify
      .sanitize(document.body.innerHTML, {
        ALLOWED_TAGS,
        ALLOWED_ATTR,
        ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#)/i,
      })
      .trim();

    if (!clean || clean.length > MAX_ARTICLE_HTML_LENGTH) return null;
    return clean;
  } finally {
    dom.window.close();
  }
}
