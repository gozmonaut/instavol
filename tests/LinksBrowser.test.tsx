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
