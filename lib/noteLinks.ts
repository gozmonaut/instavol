export type NotePiece = { text: string; url?: string };

// http(s) addresses only; punctuation at the very end (a full stop, a closing bracket) belongs to the sentence.
const LINK = /https?:\/\/[^\s<>"]+/g;
const TRAILING = /[.,;:!?)\]}'’"”]+$/;

// Splits a note's text into plain text and links, so the links can be shown clickable.
export function splitNoteLinks(text: string): NotePiece[] {
  const pieces: NotePiece[] = [];
  let rest = 0;
  for (const match of text.matchAll(LINK)) {
    const url = match[0].replace(TRAILING, '');
    if (!URL.canParse(url)) continue;
    if (match.index > rest) pieces.push({ text: text.slice(rest, match.index) });
    pieces.push({ text: url, url });
    rest = match.index + url.length;
  }
  if (rest < text.length || pieces.length === 0) pieces.push({ text: text.slice(rest) });
  return pieces;
}
