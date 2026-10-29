// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

test('renders links, and only shows retry for non-done items', () => {
  render(<LinksBrowser initialLinks={fixture} />);
  expect(screen.getByText('Artikel A')).toBeInTheDocument();
  expect(screen.getByText('Samenvatting A')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Opnieuw verwerken' })).toHaveLength(1);
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

test('clicking retry calls the reprocess endpoint and updates the item', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    json: async () => ({ ...fixture[1], status: 'done', summary: 'Nu wel gelukt' }),
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<LinksBrowser initialLinks={fixture} />);
  await userEvent.click(screen.getByRole('button', { name: 'Opnieuw verwerken' }));
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
  const older = { ...fixture[1], createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) };
  render(<LinksBrowser initialLinks={[fixture[0], older]} />);
  const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
  expect(headings).toEqual(['Vandaag', 'Vorige week']);
});

describe('jumping between date groups', () => {
  const older = { ...fixture[1], createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) };
  let scrollIntoView: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView as unknown as Element['scrollIntoView'];
  });

  test('tapping a heading lists all groups with their counts, and choosing one scrolls to it', async () => {
    const { container } = render(<LinksBrowser initialLinks={[fixture[0], older]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Vandaag, kies een periode' }));
    const dialog = screen.getByRole('dialog', { name: 'Ga naar' });
    expect(dialog).toHaveTextContent('Vandaag');
    expect(dialog).toHaveTextContent('Vorige week');
    await userEvent.click(screen.getByRole('button', { name: 'Vorige week (1)' }));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(container.querySelector('section[data-group="Vorige week"]'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('Annuleren closes the list without scrolling', async () => {
    render(<LinksBrowser initialLinks={[fixture[0], older]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Vandaag, kies een periode' }));
    await userEvent.click(screen.getByRole('button', { name: 'Annuleren' }));
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
    await userEvent.click(screen.getAllByText('Onderzoek')[0]);
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
    await userEvent.click(screen.getAllByText('Onderzoek')[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Annuleren' }));
    expect(share).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('without share support the prompt is copied', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<LinksBrowser initialLinks={fixture} />);
    await userEvent.click(screen.getAllByText('Onderzoek')[0]);
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
    await userEvent.click(screen.getByRole('button', { name: 'Uitloggen' }));
    expect(confirm).toHaveBeenCalledWith('Weet je zeker dat je wilt uitloggen?');
    expect(fetchMock).toHaveBeenCalledWith('/api/logout', expect.objectContaining({ method: 'POST' }));
    expect(routerReplace).toHaveBeenCalledWith('/login');
  });

  test('cancelling keeps you logged in', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<LinksBrowser initialLinks={fixture} />);
    await userEvent.click(screen.getByRole('button', { name: 'Uitloggen' }));
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
    await userEvent.click(screen.getAllByText('Delen')[0]);
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
    await userEvent.click(screen.getAllByText('Delen')[0]);
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
    await userEvent.click(screen.getAllByText('Delen')[0]);
    expect(share.mock.calls[0][0].url).toBeUndefined();
  });

  test('cancelling the share sheet is silently ignored', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'));
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    render(<LinksBrowser initialLinks={fixture} />);
    await userEvent.click(screen.getAllByText('Delen')[0]);
    expect(screen.queryByText('Gekopieerd')).not.toBeInTheDocument();
  });

  test('without share support it copies the text and shows "Gekopieerd"', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<LinksBrowser initialLinks={fixture} />);
    await userEvent.click(screen.getAllByText('Delen')[1]);
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Artikel B'));
    expect(writeText.mock.calls[0][0]).not.toContain('Kon pagina niet ophalen');
    await screen.findByText('Gekopieerd');
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
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(<LinksBrowser initialLinks={fixture} />);
  await userEvent.click(screen.getAllByText('Verwijderen')[0]);
  expect(fetchMock).toHaveBeenCalledWith('/api/links/1', expect.objectContaining({ method: 'DELETE' }));
  await waitFor(() => expect(screen.queryByText('Artikel A')).not.toBeInTheDocument());
  expect(screen.getByText('Artikel B')).toBeInTheDocument();
});

test('cancelling the delete confirmation keeps the item and does not call the endpoint', async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  render(<LinksBrowser initialLinks={fixture} />);
  await userEvent.click(screen.getAllByText('Verwijderen')[0]);
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
    await userEvent.click(screen.getByRole('button', { name: 'Wachtwoord wijzigen' }));
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
