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

// Where a selection inside the body starts and ends in the body's text, without the white space
// around it; null when the selection is empty or reaches outside the body.
export function selectionOffsets(root: Element, range: Range): { start: number; end: number } | null {
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const before = document.createRange();
  before.selectNodeContents(root);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  const text = (root.textContent ?? '').slice(start, start + range.toString().length);
  const trimmed = text.trim();
  if (!trimmed) return null;
  const from = start + (text.length - text.trimStart().length);
  return { start: from, end: from + trimmed.length };
}

// The text between two offsets, with a little text on both sides to find it again later.
export function highlightAt(root: Element, start: number, end: number): Pick<LinkHighlight, 'text' | 'prefix' | 'suffix'> {
  const fullText = root.textContent ?? '';
  return {
    text: fullText.slice(start, end),
    prefix: fullText.slice(Math.max(0, start - CONTEXT_LENGTH), start),
    suffix: fullText.slice(end, end + CONTEXT_LENGTH),
  };
}

export function selectionToHighlight(root: Element, range: Range): Pick<LinkHighlight, 'text' | 'prefix' | 'suffix'> | null {
  const offsets = selectionOffsets(root, range);
  return offsets ? highlightAt(root, offsets.start, offsets.end) : null;
}

// Where each highlight shown in the body starts and ends in the body's text.
export function markedRanges(root: Element): { id: string; start: number; end: number }[] {
  const ranges = new Map<string, { id: string; start: number; end: number }>();
  for (const mark of Array.from(root.querySelectorAll<HTMLElement>('mark[data-highlight-id]'))) {
    const before = document.createRange();
    before.selectNodeContents(root);
    before.setEndBefore(mark);
    const start = before.toString().length;
    const end = start + (mark.textContent ?? '').length;
    const id = mark.dataset.highlightId!;
    const known = ranges.get(id);
    ranges.set(id, known ? { id, start: Math.min(known.start, start), end: Math.max(known.end, end) } : { id, start, end });
  }
  return Array.from(ranges.values());
}

// What highlighting a selection means: a selection that lies within one highlight can only take that
// highlight away again; otherwise it becomes a highlight, merged with any highlight it overlaps,
// so the same text is never highlighted twice.
export function planHighlight(
  root: Element,
  selection: { start: number; end: number },
): { kind: 'inside'; id: string } | { kind: 'add'; start: number; end: number; replaces: string[] } {
  const ranges = markedRanges(root);
  const around = ranges.find((r) => r.start <= selection.start && r.end >= selection.end);
  if (around) return { kind: 'inside', id: around.id };
  const overlapping = ranges.filter((r) => r.start < selection.end && r.end > selection.start);
  return {
    kind: 'add',
    start: Math.min(selection.start, ...overlapping.map((r) => r.start)),
    end: Math.max(selection.end, ...overlapping.map((r) => r.end)),
    replaces: overlapping.map((r) => r.id),
  };
}
