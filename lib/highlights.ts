import type { LinkHighlight } from '@/lib/schema';

// Highlights are kept as text plus a little text on both sides, not as positions, so they survive
// small changes to the page. The functions below work on the DOM of the reader's article body.

const CONTEXT_LENGTH = 32;

function textNodesOf(root: Element): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);
  return nodes;
}

// Unwraps all <mark data-highlight-id> elements again.
export function clearHighlights(root: Element): void {
  for (const mark of Array.from(root.querySelectorAll('mark[data-highlight-id]'))) {
    mark.replaceWith(...Array.from(mark.childNodes));
  }
  root.normalize();
}

// Where in the article's text a highlight sits: the occurrence whose surroundings match best.
export function findHighlight(fullText: string, highlight: Pick<LinkHighlight, 'text' | 'prefix' | 'suffix'>): number {
  let best = -1;
  let bestScore = -1;
  for (let at = fullText.indexOf(highlight.text); at !== -1; at = fullText.indexOf(highlight.text, at + 1)) {
    const before = fullText.slice(Math.max(0, at - highlight.prefix.length), at);
    const after = fullText.slice(at + highlight.text.length, at + highlight.text.length + highlight.suffix.length);
    let score = 0;
    for (let i = 1; i <= Math.min(before.length, highlight.prefix.length); i++) {
      if (before[before.length - i] !== highlight.prefix[highlight.prefix.length - i]) break;
      score++;
    }
    for (let i = 0; i < Math.min(after.length, highlight.suffix.length); i++) {
      if (after[i] !== highlight.suffix[i]) break;
      score++;
    }
    if (score > bestScore) {
      best = at;
      bestScore = score;
    }
  }
  return best;
}

function wrap(root: Element, start: number, end: number, id: string): void {
  let position = 0;
  const segments: { node: Text; from: number; to: number }[] = [];
  for (const node of textNodesOf(root)) {
    const length = node.data.length;
    const from = Math.max(start, position) - position;
    const to = Math.min(end, position + length) - position;
    if (to > from && node.data.slice(from, to).trim() !== '') segments.push({ node, from, to });
    position += length;
  }
  for (const { node, from, to } of segments) {
    const range = document.createRange();
    range.setStart(node, from);
    range.setEnd(node, to);
    const mark = document.createElement('mark');
    mark.dataset.highlightId = id;
    range.surroundContents(mark);
  }
}

// Marks every highlight in the article body (starting from a clean body).
export function applyHighlights(root: Element, highlights: LinkHighlight[]): void {
  clearHighlights(root);
  for (const highlight of highlights) {
    const at = findHighlight(root.textContent ?? '', highlight);
    if (at !== -1) wrap(root, at, at + highlight.text.length, highlight.id);
  }
}

// A selection inside the body, as the text to store and where to find it again; null when the
// selection is empty or reaches outside the body.
export function selectionToHighlight(root: Element, range: Range): Pick<LinkHighlight, 'text' | 'prefix' | 'suffix'> | null {
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const before = document.createRange();
  before.selectNodeContents(root);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  const end = start + range.toString().length;
  const fullText = root.textContent ?? '';
  const text = fullText.slice(start, end);
  const lead = text.length - text.trimStart().length;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const from = start + lead;
  const to = from + trimmed.length;
  return {
    text: trimmed,
    prefix: fullText.slice(Math.max(0, from - CONTEXT_LENGTH), from),
    suffix: fullText.slice(to, to + CONTEXT_LENGTH),
  };
}
