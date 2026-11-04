// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LinksBrowser from '@/app/components/LinksBrowser';
import type { LinkRow } from '@/lib/schema';

const routerReplace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: routerReplace }) }));

const fixture: LinkRow[] = [
  {
    id: '1',
    url: 'https://a.example',
    title: 'Artikel A',
    status: 'done',
    summary: 'Samenvatting A',
    category: 'Tech',
    errorMessage: null,
    tags: [],
    notes: [],
    imageUrl: null,
    byline: null,
    publishedAt: null,
    readingMinutes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: '2',
    url: 'https://b.example',
    title: 'Artikel B',
    status: 'failed',
    summary: null,
    category: null,
    errorMessage: 'Kon pagina niet ophalen',
    tags: [],
    notes: [],
    imageUrl: null,
    byline: null,
    publishedAt: null,
    readingMinutes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

// Card and reader actions sit behind the "..." button; the menu is a dropdown under the button.
async function chooseAction(name: string, opener: HTMLElement) {
  await userEvent.click(opener);
  const menu = screen.getByRole('menu');
  await userEvent.click(within(menu).getByRole('menuitem', { name }));
}

function moreButton(index = 0) {
  return screen.getAllByRole('button', { name: 'Meer' })[index];
}

test('renders links, and only offers retry for non-done items', async () => {
  render(<LinksBrowser initialLinks={fixture} />);
  expect(screen.getByText('Artikel A')).toBeInTheDocument();
  expect(screen.getByText('Samenvatting A')).toBeInTheDocument();
  await userEvent.click(moreButton(0));
  expect(screen.queryByRole('menuitem', { name: 'Opnieuw verwerken' })).not.toBeInTheDocument();
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  await userEvent.click(moreButton(1));
  expect(screen.getByRole('menuitem', { name: 'Opnieuw verwerken' })).toBeInTheDocument();
});

test('typing in search fetches /api/links?q=... and replaces the list', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ links: [fixture[0]] }) });
  vi.stubGlobal('fetch', fetchMock);
  render(<LinksBrowser initialLinks={fixture} />);
  await userEvent.type(screen.getByRole('searchbox'), 'Artikel A');
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('q=Artikel')));
});

test('selecting a category fetches /api/links?category=...', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ links: [fixture[0]] }) });
  vi.stubGlobal('fetch', fetchMock);
  render(<LinksBrowser initialLinks={fixture} />);
  await userEvent.selectOptions(screen.getByRole('combobox'), 'Tech');
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('category=Tech')));
});

describe('the category menu', () => {
  test('"Filter op" filters on the category, and the same menu can turn the filter off again', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ links: [fixture[0]] }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<LinksBrowser initialLinks={fixture} />);
    await userEvent.click(screen.getByRole('button', { name: 'Categorie Tech' }));
    await userEvent.click(screen.getByRole('button', { name: 'Filter op Tech' }));
    expect(screen.getByRole('combobox')).toHaveValue('Tech');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('category=Tech')));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Categorie Tech' }));
    await userEvent.click(screen.getByRole('button', { name: 'Toon alle categorieën' }));
    expect(screen.getByRole('combobox')).toHaveValue('');
  });

  test('"Categorie wijzigen" lists existing categories; picking one saves it on the item', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) =>
      Promise.resolve(
        url === '/api/categories'
          ? { ok: true, json: async () => ({ categories: ['Tech', 'Politiek', 'Koken'] }) }
          : { ok: true, json: async () => ({ ...fixture[0], category: JSON.parse(String(init?.body)).category }) },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<LinksBrowser initialLinks={fixture} />);
    await userEvent.click(screen.getByRole('button', { name: 'Categorie Tech' }));
    await userEvent.click(screen.getByRole('button', { name: 'Categorie wijzigen' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Politiek' }));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/links/1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ category: 'Politiek' }) }),
    );
    expect(await screen.findByRole('button', { name: 'Categorie Politiek' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('"Categorie wijzigen" is also in the "..." menu', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) =>
      Promise.resolve(
        url === '/api/categories'
          ? { ok: true, json: async () => ({ categories: ['Tech', 'Koken'] }) }
          : { ok: true, json: async () => ({ ...fixture[0], category: JSON.parse(String(init?.body)).category }) },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<LinksBrowser initialLinks={fixture} />);
    await chooseAction('Categorie wijzigen', moreButton(0));
    expect(await screen.findByRole('button', { name: 'Tech' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Koken' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/links/1', expect.objectContaining({ body: JSON.stringify({ category: 'Koken' }) }));
    expect(await screen.findByRole('button', { name: 'Categorie Koken' })).toBeInTheDocument();
  });

  test('a new category can be typed and saved with Enter', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) =>
      Promise.resolve(
        url === '/api/categories'
          ? { ok: true, json: async () => ({ categories: ['Tech'] }) }
          : { ok: true, json: async () => ({ ...fixture[0], category: JSON.parse(String(init?.body)).category }) },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<LinksBrowser initialLinks={fixture} />);
    await userEvent.click(screen.getByRole('button', { name: 'Categorie Tech' }));
    await userEvent.click(screen.getByRole('button', { name: 'Categorie wijzigen' }));
    const input = screen.getByLabelText('Nieuwe categorie');
    expect(input).toHaveValue('Tech');
    await userEvent.clear(input);
    await userEvent.type(input, 'Wetenschap{Enter}');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/links/1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ category: 'Wetenschap' }) }),
    );
    expect(await screen.findByRole('button', { name: 'Categorie Wetenschap' })).toBeInTheDocument();
  });
});

describe('browser back button in the reader', () => {
  const article = { ...fixture[0], readingMinutes: 2 };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ html: '<p>Tekst</p>' }) }));
  });

  test('opening the reader adds a history entry, and back closes the reader', async () => {
    const push = vi.spyOn(window.history, 'pushState');
    render(<LinksBrowser initialLinks={[article]} />);
    await userEvent.click(screen.getByRole('link', { name: article.title! }));
    expect(screen.getByRole('dialog', { name: article.title! })).toBeInTheDocument();
    expect(push).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('closing with the back arrow removes the extra history entry again', async () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    render(<LinksBrowser initialLinks={[article]} />);
    await userEvent.click(screen.getByRole('link', { name: article.title! }));
    await userEvent.click(screen.getByRole('button', { name: 'Terug' }));
    expect(back).toHaveBeenCalledTimes(1);
  });
});

test('only items without a reader view show the external link icon before the title', () => {
  const { container } = render(<LinksBrowser initialLinks={[fixture[0], { ...fixture[1], readingMinutes: 3 }]} />);
  expect(container.querySelectorAll('svg[class*="externalIcon"]')).toHaveLength(1);
  expect(screen.getByRole('link', { name: fixture[0].title! }).querySelector('svg')).not.toBeNull();
  expect(screen.getByRole('link', { name: fixture[1].title! }).querySelector('svg')).toBeNull();
});

describe('light and dark mode button', () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme;
    localStorage.removeItem('instavol-theme');
  });

  test('switches the theme on <html> and remembers it', async () => {
    render(<LinksBrowser initialLinks={fixture} />);
    const button = screen.getByRole('button', { name: 'Wissel tussen licht en donker' });
    document.documentElement.dataset.theme = 'light';
    await userEvent.click(button);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('instavol-theme')).toBe('dark');
    await userEvent.click(button);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('instavol-theme')).toBe('light');
  });
});

describe('the "..." menu and scrolling', () => {
  afterEach(() => {
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  test('rubber-banding at the top of the page (scroll events at scrollY 0) keeps the menu open', async () => {
    render(<LinksBrowser initialLinks={fixture} />);
    await userEvent.click(moreButton(0));
    act(() => {
      document.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('scroll'));
    });
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  test('really scrolling the page closes the menu', async () => {
    render(<LinksBrowser initialLinks={fixture} />);
    await userEvent.click(moreButton(0));
    Object.defineProperty(window, 'scrollY', { value: 120, configurable: true });
    act(() => {
      document.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

test('clicking the logo clears the search and filters', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ links: fixture }) });
  vi.stubGlobal('fetch', fetchMock);
  window.scrollTo = vi.fn();
  render(<LinksBrowser initialLinks={fixture} />);
  await userEvent.type(screen.getByRole('searchbox'), 'Artikel A');
  await userEvent.selectOptions(screen.getByRole('combobox'), 'Tech');
  await userEvent.click(screen.getByRole('button', { name: 'Instavol' }));
  expect(screen.getByRole('searchbox')).toHaveValue('');
  expect(screen.getByRole('combobox')).toHaveValue('');
  expect(window.scrollTo).toHaveBeenCalledWith({ top: 0 });
});

test('clicking retry calls the reprocess endpoint and updates the item', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    json: async () => ({ ...fixture[1], status: 'done', summary: 'Nu wel gelukt' }),
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<LinksBrowser initialLinks={fixture} />);
  await chooseAction('Opnieuw verwerken', moreButton(1));
  expect(fetchMock).toHaveBeenCalledWith('/api/links/2/reprocess', expect.objectContaining({ method: 'POST' }));
  await screen.findByText('Nu wel gelukt');
});

const pendingItem: LinkRow = {
  ...fixture[0],
  id: '3',
  url: 'https://c.example/nieuw',
  title: null,
  status: 'pending',
  summary: null,
  category: null,
};

test('pressing Enter with a url in the search box saves it, adds it on top and clears the box', async () => {
  const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
    Promise.resolve(
      init?.method === 'POST'
        ? { ok: true, json: async () => pendingItem }
        : { ok: true, json: async () => ({ links: [pendingItem, ...fixture] }) },
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  render(<LinksBrowser initialLinks={fixture} />);
  await userEvent.type(screen.getByRole('searchbox'), 'https://c.example/nieuw{Enter}');
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/links',
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ url: 'https://c.example/nieuw' }) }),
  );
  await screen.findByText('https://c.example/nieuw');
  expect(screen.getByText('Wordt verwerkt...')).toBeInTheDocument();
  expect(screen.getByRole('searchbox')).toHaveValue('');
  expect(screen.queryByText('Bewaar deze link')).not.toBeInTheDocument();
});

test('pressing Enter with normal search text does not save anything', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ links: fixture }) });
  vi.stubGlobal('fetch', fetchMock);
  render(<LinksBrowser initialLinks={fixture} />);
  await userEvent.type(screen.getByRole('searchbox'), 'gewone zoekterm{Enter}');
  expect(fetchMock).not.toHaveBeenCalledWith('/api/links', expect.objectContaining({ method: 'POST' }));
});

test('items are grouped under date headings, newest group first', () => {
  const older = { ...fixture[1], createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
  render(<LinksBrowser initialLinks={[fixture[0], older]} />);
  const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
  expect(headings).toEqual(['Vandaag', 'Vorige week']);
});

describe('jumping between date groups', () => {
  const older = { ...fixture[1], createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
  let scrollIntoView: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView as unknown as Element['scrollIntoView'];
  });

  test('tapping a heading lists all groups with their counts, and choosing one scrolls to it', async () => {
    const { container } = render(<LinksBrowser initialLinks={[fixture[0], older]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Vandaag, kies een periode' }));
    const menu = screen.getByRole('menu', { name: 'Ga naar' });
    expect(menu).toHaveTextContent('Vandaag');
    expect(menu).toHaveTextContent('Vorige week');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Vorige week (1)' }));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(container.querySelector('section[data-group="Vorige week"]'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  test('Escape closes the list without scrolling', async () => {
    render(<LinksBrowser initialLinks={[fixture[0], older]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Vandaag, kies een periode' }));
    await userEvent.keyboard('{Escape}');
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('research with Claude', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'share');
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  test('opens a menu, and the chosen focus shares a matching prompt', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    render(<LinksBrowser initialLinks={fixture} />);
    await chooseAction('AI-onderzoek', moreButton(0));
    expect(screen.getByRole('dialog', { name: 'Onderzoek met AI' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Factcheck' }));
    const { text } = share.mock.calls[0][0];
    expect(text).toContain('Titel: Artikel A');
    expect(text).toContain('Betrouwbaarheid:');
    expect(text).not.toContain('Context:');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('Annuleren closes the menu without sharing', async () => {
    const share = vi.fn();
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    render(<LinksBrowser initialLinks={fixture} />);
    await chooseAction('AI-onderzoek', moreButton(0));
    await userEvent.click(screen.getByRole('button', { name: 'Annuleren' }));
    expect(share).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('without share support the prompt is copied', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<LinksBrowser initialLinks={fixture} />);
    await chooseAction('AI-onderzoek', moreButton(0));
    await userEvent.click(screen.getByRole('button', { name: 'Alles' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Ik wil dit artikel verder onderzoeken.'));
    await screen.findByRole('button', { name: 'Gekopieerd' });
  });
});

describe('logging out', () => {
  test('asks for confirmation and then calls the logout endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<LinksBrowser initialLinks={fixture} />);
    await userEvent.click(screen.getByRole('button', { name: 'Instellingen' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Uitloggen' }));
    expect(confirm).toHaveBeenCalledWith('Weet je zeker dat je wilt uitloggen?');
    expect(fetchMock).toHaveBeenCalledWith('/api/logout', expect.objectContaining({ method: 'POST' }));
    expect(routerReplace).toHaveBeenCalledWith('/login');
  });

  test('cancelling keeps you logged in', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<LinksBrowser initialLinks={fixture} />);
    await userEvent.click(screen.getByRole('button', { name: 'Instellingen' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Uitloggen' }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('compact header on scroll', () => {
  let observerCallback: (entries: Partial<IntersectionObserverEntry>[]) => void;

  beforeEach(() => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: typeof observerCallback) {
          observerCallback = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
  });

  test('turns compact once the top of the page scrolls out of view, and back again', async () => {
    const { container } = render(<LinksBrowser initialLinks={fixture} />);
    const page = container.querySelector('main')!;
    expect(page).toHaveAttribute('data-compact', 'false');
    act(() => observerCallback([{ isIntersecting: false }]));
    expect(page).toHaveAttribute('data-compact', 'true');
    act(() => observerCallback([{ isIntersecting: true }]));
    expect(page).toHaveAttribute('data-compact', 'false');
  });

  test('renders fine without IntersectionObserver support', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(<LinksBrowser initialLinks={fixture} />);
    expect(screen.getByText('Artikel A')).toBeInTheDocument();
  });
});

describe('sharing an item', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'share');
    Reflect.deleteProperty(navigator, 'clipboard');
    Reflect.deleteProperty(navigator, 'platform');
    Reflect.deleteProperty(navigator, 'maxTouchPoints');
  });

  test('opens the share sheet with title, date, category, summary and url in one text', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    render(<LinksBrowser initialLinks={fixture} />);
    await chooseAction('Delen', moreButton(0));
    expect(share).toHaveBeenCalledTimes(1);
    const { text, url } = share.mock.calls[0][0];
    expect(url).toBeUndefined();
    const lines = text.split('\n');
    expect(lines[0]).toBe('Artikel A');
    expect(lines[1]).toMatch(/^.+ \| Tech$/);
    expect(lines[2]).toBe('Samenvatting A');
    expect(lines[3]).toBe('https://a.example');
    expect(lines).toHaveLength(4);
  });

  test('on a Mac the url is also passed separately, so apps that only take links show up', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true });
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
    render(<LinksBrowser initialLinks={fixture} />);
    await chooseAction('Delen', moreButton(0));
    const { text, url } = share.mock.calls[0][0];
    expect(url).toBe('https://a.example');
    expect(text).toContain('Samenvatting A');
  });

  test('an iPad (MacIntel with touch) keeps sharing text only, like iOS', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true });
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true });
    render(<LinksBrowser initialLinks={fixture} />);
    await chooseAction('Delen', moreButton(0));
    expect(share.mock.calls[0][0].url).toBeUndefined();
  });

  test('cancelling the share sheet is silently ignored', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'));
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    render(<LinksBrowser initialLinks={fixture} />);
    await chooseAction('Delen', moreButton(0));
    expect(screen.queryByRole('button', { name: 'Gekopieerd' })).not.toBeInTheDocument();
  });

  test('without share support it copies the text and shows "Gekopieerd"', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<LinksBrowser initialLinks={fixture} />);
    await chooseAction('Delen', moreButton(1));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Artikel B'));
    expect(writeText.mock.calls[0][0]).not.toContain('Kon pagina niet ophalen');
    await screen.findByRole('button', { name: 'Gekopieerd' });
  });
});

describe('auto-refresh while items are pending', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('refetches every 3 seconds and shows the title once processing is done', async () => {
    const done = { ...pendingItem, status: 'done', title: 'Nieuw artikel', summary: 'Klaar', category: 'Tech' };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ links: [done, ...fixture] }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<LinksBrowser initialLinks={[pendingItem, ...fixture]} />);
    expect(screen.getByText('https://c.example/nieuw')).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(3000);
    await screen.findByText('Nieuw artikel');
    expect(screen.queryByText('https://c.example/nieuw')).not.toBeInTheDocument();
  });

  test('does not refetch when nothing is pending', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<LinksBrowser initialLinks={fixture} />);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('stops refetching after 2 minutes even if items stay pending', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ links: [pendingItem] }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<LinksBrowser initialLinks={[pendingItem]} />);
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000 + 3000);
    const callsAtTimeout = fetchMock.mock.calls.length;
    expect(callsAtTimeout).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock.mock.calls.length).toBe(callsAtTimeout);
  });
});

test('clicking delete and confirming calls the delete endpoint and removes the item', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetchMock);
  render(<LinksBrowser initialLinks={fixture} />);
  await chooseAction('Verwijderen', moreButton(0));
  expect(fetchMock).not.toHaveBeenCalled();
  await userEvent.click(within(screen.getByRole('alertdialog', { name: 'Item verwijderen?' })).getByRole('button', { name: 'Verwijderen' }));
  expect(fetchMock).toHaveBeenCalledWith('/api/links/1', expect.objectContaining({ method: 'DELETE' }));
  await waitFor(() => expect(screen.queryByText('Artikel A')).not.toBeInTheDocument());
  expect(screen.getByText('Artikel B')).toBeInTheDocument();
});

test('cancelling the delete confirmation keeps the item and does not call the endpoint', async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  render(<LinksBrowser initialLinks={fixture} />);
  await chooseAction('Verwijderen', moreButton(0));
  await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Annuleren' }));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(screen.getByText('Artikel A')).toBeInTheDocument();
});

describe('pull-to-refresh in the home-screen app', () => {
  function pull(fromY: number, toY: number) {
    fireEvent.touchStart(window, { touches: [{ clientY: fromY }] });
    fireEvent.touchMove(window, { touches: [{ clientY: toY }] });
    fireEvent.touchEnd(window, { touches: [] });
  }

  afterEach(() => {
    delete (navigator as Navigator & { standalone?: boolean }).standalone;
  });

  test('pulling down far enough refetches the list', async () => {
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ links: [fixture[0]] }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<LinksBrowser initialLinks={fixture} />);
    pull(100, 300);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/links?'));
    await waitFor(() => expect(screen.queryByText('Artikel B')).not.toBeInTheDocument());
  });

  test('a short pull does not refetch', () => {
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<LinksBrowser initialLinks={fixture} />);
    pull(100, 150);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('in the Safari browser the gesture is left to Safari', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<LinksBrowser initialLinks={fixture} />);
    pull(100, 300);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

test('the refresh button refetches the list', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ links: [fixture[0]] }) });
  vi.stubGlobal('fetch', fetchMock);
  render(<LinksBrowser initialLinks={fixture} />);
  await userEvent.click(screen.getByRole('button', { name: 'Verversen' }));
  expect(fetchMock).toHaveBeenCalledWith('/api/links?');
  await waitFor(() => expect(screen.queryByText('Artikel B')).not.toBeInTheDocument());
});

describe('changing the password', () => {
  async function fillIn(current: string, next: string, repeat: string) {
    await userEvent.click(screen.getByRole('button', { name: 'Instellingen' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Wachtwoord wijzigen' }));
    await userEvent.type(screen.getByLabelText('Huidig wachtwoord'), current);
    await userEvent.type(screen.getByLabelText('Nieuw wachtwoord'), next);
    await userEvent.type(screen.getByLabelText('Herhaal nieuw wachtwoord'), repeat);
    await userEvent.click(screen.getByRole('button', { name: 'Bewaar' }));
  }

  test('sends current and new password, and confirms the change', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<LinksBrowser initialLinks={fixture} />);
    await fillIn('geheim', 'nieuw-wachtwoord', 'nieuw-wachtwoord');
    expect(fetchMock).toHaveBeenCalledWith('/api/password', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ currentPassword: 'geheim', newPassword: 'nieuw-wachtwoord' }),
    }));
    expect(await screen.findByText('Je wachtwoord is gewijzigd')).toBeInTheDocument();
  });

  test('different new passwords are caught before anything is sent', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<LinksBrowser initialLinks={fixture} />);
    await fillIn('geheim', 'nieuw-wachtwoord', 'iets-anders1');
    expect(screen.getByRole('alert')).toHaveTextContent('niet gelijk');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('shows the error from the server', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Huidig wachtwoord klopt niet' }) }));
    render(<LinksBrowser initialLinks={fixture} />);
    await fillIn('fout', 'nieuw-wachtwoord', 'nieuw-wachtwoord');
    expect(await screen.findByRole('alert')).toHaveTextContent('Huidig wachtwoord klopt niet');
  });
});

describe('the reader', () => {
  const article: LinkRow = {
    ...fixture[0],
    id: '9',
    url: 'https://www.theverge.com/news/akai',
    title: 'Akai is embracing vibe-coded mods',
    imageUrl: 'https://cdn.example/akai.jpg',
    byline: "Terrence O'Brien",
    publishedAt: new Date('2026-10-28T09:00:00Z'),
    readingMinutes: 2,
  };

  test('a saved article shows its thumbnail and reading time, and the title opens the text', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ html: '<p>De volledige tekst</p>' }) });
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(<LinksBrowser initialLinks={[article]} />);
    expect(screen.getByText('2 min. leestijd')).toBeInTheDocument();
    expect(container.querySelector('img[src="https://cdn.example/akai.jpg"]')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'Akai is embracing vibe-coded mods' }));
    const reader = screen.getByRole('dialog', { name: 'Akai is embracing vibe-coded mods' });
    expect(fetchMock).toHaveBeenCalledWith('/api/links/9/content');
    expect(await screen.findByText('De volledige tekst')).toBeInTheDocument();
    expect(reader).toHaveTextContent("www.theverge.com · Terrence O'Brien · 28 oktober 2026 · 2 min. leestijd");
    expect(screen.getByRole('link', { name: 'Origineel openen' })).toHaveAttribute('href', article.url);
  });

  test('Terug and Escape close the reader', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ html: '<p>Tekst</p>' }) }));
    render(<LinksBrowser initialLinks={[article]} />);
    await userEvent.click(screen.getByRole('link', { name: article.title! }));
    await userEvent.click(screen.getByRole('button', { name: 'Terug' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: article.title! }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('when the text cannot be loaded it points to the original', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
    render(<LinksBrowser initialLinks={[article]} />);
    await userEvent.click(screen.getByRole('link', { name: article.title! }));
    expect(await screen.findByRole('link', { name: 'Open het origineel' })).toHaveAttribute('href', article.url);
  });

  test('the category label sits above the title', () => {
    render(<LinksBrowser initialLinks={[article]} />);
    const chip = screen.getByRole('button', { name: 'Categorie Tech' });
    const title = screen.getByRole('link', { name: article.title! });
    expect(chip.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('the top bar shares the item and opens the AI research menu', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ html: '<p>Tekst</p>' }) }));
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    render(<LinksBrowser initialLinks={[article]} />);
    await userEvent.click(screen.getByRole('link', { name: article.title! }));
    const reader = screen.getByRole('dialog', { name: article.title! });

    await chooseAction('Delen', within(reader).getByRole('button', { name: 'Meer' }));
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining(article.url) }));

    await chooseAction('AI-onderzoek', within(reader).getByRole('button', { name: 'Meer' }));
    expect(screen.getByRole('dialog', { name: 'Onderzoek met AI' })).toBeInTheDocument();
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });

  test('deleting from the top bar removes the item and closes the reader', async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      Promise.resolve(init?.method === 'DELETE' ? { ok: true } : { ok: true, json: async () => ({ html: '<p>Tekst</p>' }) }),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<LinksBrowser initialLinks={[article]} />);
    await userEvent.click(screen.getByRole('link', { name: article.title! }));
    await chooseAction('Verwijderen', within(screen.getByRole('dialog')).getByRole('button', { name: 'Meer' }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Verwijderen' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/links/9', expect.objectContaining({ method: 'DELETE' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByText(article.title!)).not.toBeInTheDocument();
  });

  test('an item without saved text keeps opening the site itself', async () => {
    render(<LinksBrowser initialLinks={fixture} />);
    await userEvent.click(screen.getByRole('link', { name: 'Artikel A' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('tags', () => {
  test('adding a tag from the menu saves it and shows it on the card', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/tags') return Promise.resolve({ json: async () => ({ tags: ['koken'] }) });
      const tags = JSON.parse(String(init?.body)).tags;
      return Promise.resolve({ ok: true, json: async () => ({ ...fixture[0], tags }) });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<LinksBrowser initialLinks={fixture} />);

    await chooseAction('Tags toevoegen', moreButton(0));
    const sheet = screen.getByRole('dialog', { name: 'Tags' });
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Nieuwe tag' }), 'weekend{Enter}');

    expect(fetchMock).toHaveBeenCalledWith('/api/links/1', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ tags: ['weekend'] }) }));
    expect(await within(sheet).findByRole('button', { name: 'Tag weekend verwijderen' })).toBeInTheDocument();

    // A tag used before is one tap away
    await userEvent.click(within(sheet).getByRole('button', { name: 'koken' }));
    expect(fetchMock).toHaveBeenLastCalledWith('/api/links/1', expect.objectContaining({ body: JSON.stringify({ tags: ['weekend', 'koken'] }) }));

    await userEvent.click(within(sheet).getByRole('button', { name: 'Klaar' }));
    const tagList = await screen.findByRole('list', { name: 'Tags' });
    expect(within(tagList).getByRole('button', { name: 'koken' })).toBeInTheDocument();
  });

  test('tapping a tag on a card filters on it, and tapping the filter stops it', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ links: [fixture[0]] }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<LinksBrowser initialLinks={[{ ...fixture[0], tags: ['weekend'] }, fixture[1]]} />);

    await userEvent.click(screen.getByRole('button', { name: 'weekend' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('tag=weekend')));

    await userEvent.click(screen.getByRole('button', { name: 'Stop filter op tag weekend' }));
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith('/api/links?'));
  });

  test('the reader shows category and tags, and a tag goes back to the filtered list', async () => {
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve({ ok: true, json: async () => (url.startsWith('/api/links?') ? { links: [] } : { html: '<p>Tekst</p>' }) }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const item = { ...fixture[0], readingMinutes: 2, tags: ['weekend'] };
    render(<LinksBrowser initialLinks={[item]} />);
    await userEvent.click(screen.getByRole('link', { name: item.title! }));
    const reader = screen.getByRole('dialog', { name: item.title! });
    expect(within(reader).getByRole('button', { name: 'Categorie Tech' })).toBeInTheDocument();

    await userEvent.click(within(reader).getByRole('button', { name: 'weekend' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('tag=weekend')));
  });
});

test('a card shows how many notes the item has', () => {
  const note = (id: string) => ({ id, text: 'x', createdAt: '2026-11-01T12:00:00.000Z' });
  render(<LinksBrowser initialLinks={[{ ...fixture[0], notes: [note('a'), note('b')] }, { ...fixture[1], notes: [note('c')] }]} />);
  expect(screen.getByText('2 notities')).toBeInTheDocument();
  expect(screen.getByText('1 notitie')).toBeInTheDocument();
});
