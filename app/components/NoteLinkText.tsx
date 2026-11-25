import { splitNoteLinks } from '@/lib/noteLinks';

// A note's text with its links clickable; they open in a new tab.
export default function NoteLinkText({ text }: { text: string }) {
  return (
    <>
      {splitNoteLinks(text).map((piece, index) =>
        piece.url ? (
          <a key={index} href={piece.url} target="_blank" rel="noreferrer">
            {piece.text}
          </a>
        ) : (
          piece.text
        ),
      )}
    </>
  );
}
