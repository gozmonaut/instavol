// @vitest-environment jsdom
import { applyHighlights, clearHighlights, findHighlight, planHighlight, selectionToHighlight } from '@/lib/highlights';
import type { LinkHighlight } from '@/lib/schema';

function body(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

const make = (text: string, prefix = '', suffix = ''): LinkHighlight => ({
  id: 'h1',
  text,
  prefix,
  suffix,
  createdAt: '2026-11-04T10:00:00.000Z',
});

afterEach(() => {
  document.body.innerHTML = '';
});

test('findHighlight picks the occurrence whose surroundings match', () => {
  const text = 'kat zit hier. De kat zit daar.';
  expect(findHighlight(text, { text: 'kat zit', prefix: 'De ', suffix: ' daar' })).toBe(text.lastIndexOf('kat zit'));
  expect(findHighlight(text, { text: 'kat zit', prefix: '', suffix: ' hier' })).toBe(0);
  expect(findHighlight(text, { text: 'hond', prefix: '', suffix: '' })).toBe(-1);
});

test('applyHighlights wraps the text in a mark, and clearHighlights restores the body', () => {
  const root = body('<p>Een <b>vette</b> zin.</p><p>Tweede alinea.</p>');
  const original = root.innerHTML;
  applyHighlights(root, [make('vette zin')]);
  const marks = Array.from(root.querySelectorAll('mark[data-highlight-id="h1"]'));
  expect(marks.map((m) => m.textContent)).toEqual(['vette', ' zin']);
  expect(root.textContent).toBe('Een vette zin.Tweede alinea.');
  clearHighlights(root);
  expect(root.querySelector('mark')).toBeNull();
  expect(root.innerHTML).toBe(original);
});

test('a highlight over two paragraphs marks both, and applying twice does not stack marks', () => {
  const root = body('<p>Eerste alinea.</p><p>Tweede alinea.</p>');
  const highlight = make('alinea.Tweede');
  applyHighlights(root, [highlight]);
  applyHighlights(root, [highlight]);
  expect(Array.from(root.querySelectorAll('mark')).map((m) => m.textContent)).toEqual(['alinea.', 'Tweede']);
});

test('a highlight whose text is gone is skipped', () => {
  const root = body('<p>Iets anders.</p>');
  applyHighlights(root, [make('weg')]);
  expect(root.querySelector('mark')).toBeNull();
});

test('selectionToHighlight stores the trimmed text with the text around it', () => {
  const root = body('<p>Vandaag was het erg mooi weer in Utrecht.</p>');
  const node = root.querySelector('p')!.firstChild!;
  const range = document.createRange();
  range.setStart(node, 15); // starts on the space before "erg", which is trimmed away
  range.setEnd(node, 29);
  const data = selectionToHighlight(root, range)!;
  expect(data.text).toBe('erg mooi weer');
  expect(data.prefix.endsWith('het ')).toBe(true);
  expect(data.suffix.startsWith(' in Utrecht')).toBe(true);
});

test('selectionToHighlight ignores a selection outside the body', () => {
  const root = body('<p>Binnen.</p>');
  const outside = document.createElement('p');
  outside.textContent = 'Buiten.';
  document.body.append(outside);
  const range = document.createRange();
  range.selectNodeContents(outside);
  expect(selectionToHighlight(root, range)).toBeNull();
});

describe('planHighlight', () => {
  const text = 'Een twee drie vier vijf zes.';
  const at = (word: string) => ({ start: text.indexOf(word), end: text.indexOf(word) + word.length });
  const highlight = (id: string, words: string): LinkHighlight => ({ ...make(words), id });

  test('a selection within a highlight can only remove it', () => {
    const root = body(`<p>${text}</p>`);
    applyHighlights(root, [highlight('h1', 'twee drie vier')]);
    expect(planHighlight(root, at('drie'))).toEqual({ kind: 'inside', id: 'h1' });
    expect(planHighlight(root, at('twee drie vier'))).toEqual({ kind: 'inside', id: 'h1' });
  });

  test('a selection overlapping highlights merges with them', () => {
    const root = body(`<p>${text}</p>`);
    applyHighlights(root, [highlight('h1', 'twee drie'), highlight('h2', 'vijf')]);
    const merged = at('drie vier vijf zes');
    expect(planHighlight(root, merged)).toEqual({
      kind: 'add',
      start: text.indexOf('twee'),
      end: merged.end,
      replaces: ['h1', 'h2'],
    });
  });

  test('a selection apart from highlights is just added', () => {
    const root = body(`<p>${text}</p>`);
    applyHighlights(root, [highlight('h1', 'twee')]);
    expect(planHighlight(root, at('vijf'))).toEqual({ kind: 'add', ...at('vijf'), replaces: [] });
  });
});
