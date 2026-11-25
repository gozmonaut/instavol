import { splitNoteLinks } from '@/lib/noteLinks';

test('a link in a note is split out from the text around it', () => {
  expect(splitNoteLinks('Mooi stuk\n\nhttps://a.nl/x?b=1&c=2')).toEqual([
    { text: 'Mooi stuk\n\n' },
    { text: 'https://a.nl/x?b=1&c=2', url: 'https://a.nl/x?b=1&c=2' },
  ]);
});

test('punctuation right after a link is not part of it', () => {
  expect(splitNoteLinks('Zie https://a.nl/x. En (https://b.nl/y), toch?')).toEqual([
    { text: 'Zie ' },
    { text: 'https://a.nl/x', url: 'https://a.nl/x' },
    { text: '. En (' },
    { text: 'https://b.nl/y', url: 'https://b.nl/y' },
    { text: '), toch?' },
  ]);
});

test('text without a link, or with something that only looks like one, stays text', () => {
  expect(splitNoteLinks('Bel de loodgieter')).toEqual([{ text: 'Bel de loodgieter' }]);
  expect(splitNoteLinks('javascript:alert(1) en www.a.nl')).toEqual([{ text: 'javascript:alert(1) en www.a.nl' }]);
});
