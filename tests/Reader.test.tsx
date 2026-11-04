// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Reader from '@/app/components/Reader';
import { loadSettings } from '@/app/components/ReaderSettings';
import type { LinkRow } from '@/lib/schema';

const link: LinkRow = {
  id: '1',
  url: 'https://a.example',
  title: 'Artikel A',
  status: 'done',
  summary: 'Samenvatting A',
  category: null,
  errorMessage: null,
  tags: [],
  notes: [],
  highlights: [],
  imageUrl: null,
  byline: null,
  publishedAt: null,
  readingMinutes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ html: '<p>Tekst</p>' }) }));
});

function renderReader(onClose = vi.fn()) {
  render(<Reader link={link} domain="a.example" actions={null} onClose={onClose} />);
  return screen.getByRole('dialog', { name: 'Artikel A' });
}

test('settings change the reader right away and are remembered on this device', async () => {
  const user = userEvent.setup();
  const reader = renderReader();
  expect(reader).toHaveAttribute('data-font', 'serif');

  await user.click(screen.getByRole('button', { name: 'Weergave' }));
  await user.click(screen.getByRole('radio', { name: 'Zonder' }));
  await user.click(screen.getByRole('radio', { name: 'Sepia' }));
  await user.click(screen.getByRole('switch', { name: 'Vettere tekst' }));

  expect(reader).toHaveAttribute('data-font', 'sans');
  expect(reader).toHaveAttribute('data-theme', 'sepia');
  expect(reader).toHaveAttribute('data-bold', 'true');
  expect(loadSettings()).toMatchObject({ font: 'sans', theme: 'sepia', bold: true });

  await user.click(screen.getByRole('button', { name: 'Standaard herstellen' }));
  expect(reader).toHaveAttribute('data-font', 'serif');
  expect(loadSettings().theme).toBe('auto');
});

test('Escape closes the settings first, then the reader', async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  renderReader(onClose);

  await user.click(screen.getByRole('button', { name: 'Weergave' }));
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog', { name: 'Weergave' })).not.toBeInTheDocument();
  expect(onClose).not.toHaveBeenCalled();

  await user.keyboard('{Escape}');
  expect(onClose).toHaveBeenCalled();
});

test('a recipe shows only the recipe, without summary or reading time', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ html: '<div data-recipe=""><h2>Ingrediënten</h2></div>', recipe: true }) }),
  );
  render(<Reader link={{ ...link, readingMinutes: 3 }} domain="a.example" actions={null} onClose={vi.fn()} />);
  expect(await screen.findByText('Ingrediënten')).toBeInTheDocument();
  expect(screen.queryByText('Samenvatting A')).not.toBeInTheDocument();
  expect(screen.queryByText(/leestijd/)).not.toBeInTheDocument();
});

test('an article still shows its summary', async () => {
  renderReader();
  expect(await screen.findByText('Samenvatting A')).toBeInTheDocument();
});

test('unreadable saved settings fall back to the defaults', () => {
  localStorage.setItem('instavol.reader', JSON.stringify({ font: 'comic', size: 99, bold: 'ja' }));
  expect(loadSettings()).toMatchObject({ font: 'serif', size: 1, bold: false });
});

test('a recipe shows its ingredients as one table, with a row for each group', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        html: '<div data-recipe=""><h2>Ingrediënten</h2><ul><li>200 g bloem</li></ul><h3>Saus</h3><ul><li>zout</li></ul><h2>Bereiding</h2><ol><li>Mengen</li></ol></div>',
        recipe: true,
      }),
    }),
  );
  render(<Reader link={{ ...link, readingMinutes: 3 }} domain="a.example" actions={null} onClose={vi.fn()} />);
  const table = await screen.findByRole('table');
  expect(screen.getByRole('columnheader', { name: 'Hoeveelheid' })).toBeInTheDocument();
  const rows = Array.from(table.querySelectorAll('tbody tr')).map((row) =>
    Array.from(row.children).map((cell) => cell.textContent),
  );
  expect(rows).toEqual([['200 g', 'bloem'], ['Saus'], ['', 'zout']]);
  expect(screen.getByText('Mengen')).toBeInTheDocument();
});

test('a note can be added from the reader and is shown above the article', async () => {
  const user = userEvent.setup();
  const note = { id: 'n1', text: 'Minder zout', createdAt: '2026-11-01T12:00:00.000Z' };
  const fetchMock = vi.fn(async (url: string) => ({
    ok: true,
    json: async () => (url.endsWith('/notes') ? { ...link, notes: [note] } : { html: '<p>Tekst</p>' }),
  }));
  vi.stubGlobal('fetch', fetchMock);
  const onChange = vi.fn();
  const { rerender } = render(<Reader link={link} domain="a.example" actions={null} onChange={onChange} onClose={vi.fn()} />);

  await user.click(screen.getByRole('button', { name: 'Notitie toevoegen' }));
  await user.type(screen.getByRole('textbox', { name: 'Notitie' }), 'Minder zout');
  await user.click(screen.getByRole('button', { name: 'Bewaar' }));

  expect(fetchMock).toHaveBeenCalledWith('/api/links/1/notes', expect.objectContaining({ method: 'POST' }));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ notes: [note] }));
  expect(screen.queryByRole('dialog', { name: 'Notitie' })).not.toBeInTheDocument();

  rerender(<Reader link={{ ...link, notes: [note] }} domain="a.example" actions={null} onChange={onChange} onClose={vi.fn()} />);
  expect(screen.getByRole('region', { name: 'Notitie' })).toHaveTextContent('Minder zout');
});

describe('highlighting text', () => {
  afterEach(() => {
    document.getSelection()?.removeAllRanges();
  });

  function select(node: Node) {
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
    });
  }

  test('"Highlight" saves the selection, and a tap on the marked text offers to remove it', async () => {
    const withHighlight = {
      ...link,
      highlights: [{ id: 'h1', text: 'Tekst', prefix: '', suffix: '', createdAt: '2026-11-04T10:00:00.000Z' }],
    };
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.resolve({ ok: true, json: async () => withHighlight });
      if (init?.method === 'DELETE') return Promise.resolve({ ok: true, json: async () => ({ ...link, highlights: [] }) });
      return Promise.resolve({ ok: true, json: async () => ({ html: '<p>Tekst</p>' }) });
    });
    vi.stubGlobal('fetch', fetchMock);
    const onChange = vi.fn();
    const { rerender } = render(<Reader link={link} domain="a.example" actions={null} onChange={onChange} onClose={vi.fn()} />);

    select(await screen.findByText('Tekst'));
    await userEvent.click(screen.getByRole('button', { name: 'Highlight' }));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/links/1/highlights',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ text: 'Tekst', prefix: '', suffix: '', replaces: [] }) }),
    );
    expect(onChange).toHaveBeenCalledWith(withHighlight);

    rerender(<Reader link={withHighlight} domain="a.example" actions={null} onChange={onChange} onClose={vi.fn()} />);
    const mark = document.querySelector('mark[data-highlight-id="h1"]')!;
    expect(mark).toHaveTextContent('Tekst');
    await userEvent.click(mark);
    await userEvent.click(screen.getByRole('button', { name: 'Highlight weg' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/links/1/highlights/h1', expect.objectContaining({ method: 'DELETE' }));
  });

  test('selecting article text shows only a Highlight button; a selection outside the body shows nothing', async () => {
    renderReader();
    select(await screen.findByText('Tekst'));
    expect(screen.getByRole('button', { name: 'Highlight' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Onderzoek' })).not.toBeInTheDocument();
    select(screen.getByRole('heading', { name: 'Artikel A' }));
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(screen.queryByRole('button', { name: 'Highlight' })).not.toBeInTheDocument();
  });

  test('selecting text that is already highlighted offers to remove it instead of highlighting it again', async () => {
    const withHighlight = {
      ...link,
      highlights: [{ id: 'h1', text: 'Tekst', prefix: '', suffix: '', createdAt: '2026-11-04T10:00:00.000Z' }],
    };
    render(<Reader link={withHighlight} domain="a.example" actions={null} onClose={vi.fn()} />);
    await screen.findByText('Tekst');
    select(document.querySelector('mark[data-highlight-id="h1"]')!);
    expect(screen.getByRole('button', { name: 'Highlight weg' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Highlight' })).not.toBeInTheDocument();
  });
});

describe('swiping back', () => {
  function swipe(reader: HTMLElement, toX: number, toY = 100) {
    fireEvent.touchStart(reader, { touches: [{ clientX: 20, clientY: 100 }] });
    fireEvent.touchMove(reader, { touches: [{ clientX: 40, clientY: 100 }] });
    fireEvent.touchMove(reader, { touches: [{ clientX: toX, clientY: toY }] });
    fireEvent.touchEnd(reader, { changedTouches: [{ clientX: toX, clientY: toY }] });
  }

  test('the reader follows the finger, and far enough slides it away and closes it', async () => {
    const onClose = vi.fn();
    const reader = renderReader(onClose);
    fireEvent.touchStart(reader, { touches: [{ clientX: 20, clientY: 100 }] });
    fireEvent.touchMove(reader, { touches: [{ clientX: 120, clientY: 105 }] });
    expect(reader.style.transform).toBe('translateX(100px)');
    fireEvent.touchMove(reader, { touches: [{ clientX: 700, clientY: 105 }] });
    fireEvent.touchEnd(reader, { changedTouches: [{ clientX: 700, clientY: 105 }] });
    expect(reader).toHaveAttribute('data-closing', 'true');
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  test('a short, slow drag springs back without closing', async () => {
    const onClose = vi.fn();
    const reader = renderReader(onClose);
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValueOnce(now).mockReturnValue(now + 1000);
    swipe(reader, 60);
    vi.mocked(Date.now).mockRestore();
    expect(reader.style.transform).toBe('');
    expect(reader).not.toHaveAttribute('data-closing');
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(onClose).not.toHaveBeenCalled();
  });

  test('scrolling down is not a swipe', () => {
    const reader = renderReader();
    swipe(reader, 30, 400);
    expect(reader.style.transform).toBe('');
  });
});
