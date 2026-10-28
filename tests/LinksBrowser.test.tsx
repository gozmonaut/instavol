// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LinksBrowser from '@/app/components/LinksBrowser';
import type { LinkRow } from '@/lib/schema';

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
  expect(screen.getAllByText('Opnieuw verwerken')).toHaveLength(1);
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

test('clicking retry calls the reprocess endpoint and updates the item', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    json: async () => ({ ...fixture[1], status: 'done', summary: 'Nu wel gelukt' }),
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<LinksBrowser initialLinks={fixture} />);
  await userEvent.click(screen.getByText('Opnieuw verwerken'));
  expect(fetchMock).toHaveBeenCalledWith('/api/links/2/reprocess', expect.objectContaining({ method: 'POST' }));
  await screen.findByText('Nu wel gelukt');
});

test('save button only appears when the search box contains a url', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ links: fixture }) }));
  render(<LinksBrowser initialLinks={fixture} />);
  expect(screen.queryByText('Bewaar deze link')).not.toBeInTheDocument();
  await userEvent.type(screen.getByRole('searchbox'), 'gewone zoekterm');
  expect(screen.queryByText('Bewaar deze link')).not.toBeInTheDocument();
  await userEvent.clear(screen.getByRole('searchbox'));
  await userEvent.type(screen.getByRole('searchbox'), 'https://c.example/nieuw');
  expect(screen.getByText('Bewaar deze link')).toBeInTheDocument();
});

test('clicking save posts the url, adds the new item on top and clears the search box', async () => {
  const created = { ...fixture[0], id: '3', url: 'https://c.example/nieuw', title: null, status: 'pending', summary: null, category: null };
  const fetchMock = vi.fn((url: string, init?: RequestInit) =>
    Promise.resolve(
      init?.method === 'POST'
        ? { ok: true, json: async () => created }
        : { ok: true, json: async () => ({ links: [created, ...fixture] }) },
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  render(<LinksBrowser initialLinks={fixture} />);
  await userEvent.type(screen.getByRole('searchbox'), 'https://c.example/nieuw');
  await userEvent.click(screen.getByText('Bewaar deze link'));
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/links',
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ url: 'https://c.example/nieuw' }) }),
  );
  await screen.findByText('https://c.example/nieuw');
  expect(screen.getByText('Wordt verwerkt...')).toBeInTheDocument();
  expect(screen.getByRole('searchbox')).toHaveValue('');
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
