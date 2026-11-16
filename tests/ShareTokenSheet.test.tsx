// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ShareTokenSheet from '@/app/components/ShareTokenSheet';

function stubFetch(exists: boolean, post: () => Promise<unknown> = async () => ({ ok: true, json: async () => ({ token: 'nieuw-token-123' }) })) {
  const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
    init?.method === 'POST' ? post() : Promise.resolve({ ok: true, json: async () => ({ exists }) }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test('without a token yet it offers to make one, without a warning', async () => {
  stubFetch(false);
  render(<ShareTokenSheet onClose={() => {}} />);
  expect(screen.getByRole('dialog', { name: 'Token voor opslaan-snelkoppeling' })).toBeInTheDocument();
  expect(await screen.findByRole('button', { name: 'Token maken' })).toBeInTheDocument();
  expect(screen.queryByText(/Het oude token werkt daarna niet meer/)).not.toBeInTheDocument();
});

test('with an existing token it offers to replace it and warns that the old one stops working', async () => {
  stubFetch(true);
  render(<ShareTokenSheet onClose={() => {}} />);
  expect(await screen.findByRole('button', { name: 'Token vervangen' })).toBeInTheDocument();
  expect(screen.getByText(/Het oude token werkt daarna niet meer/)).toBeInTheDocument();
});

test('a new token is shown once and can be copied', async () => {
  const fetchMock = stubFetch(false);
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
  render(<ShareTokenSheet onClose={() => {}} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Token maken' }));
  expect(fetchMock).toHaveBeenCalledWith('/api/share-token', expect.objectContaining({ method: 'POST' }));
  expect(await screen.findByText('nieuw-token-123')).toBeInTheDocument();
  expect(screen.getByText('Je ziet dit token maar één keer.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Kopieer' }));
  expect(writeText).toHaveBeenCalledWith('nieuw-token-123');
  expect(await screen.findByRole('button', { name: 'Gekopieerd' })).toBeInTheDocument();
});

test('says so when making a token fails', async () => {
  stubFetch(false, async () => ({ ok: false, json: async () => ({}) }));
  render(<ShareTokenSheet onClose={() => {}} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Token maken' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Token maken is niet gelukt, probeer het opnieuw');
});

test('closes with the button and with Escape', async () => {
  stubFetch(false);
  const onClose = vi.fn();
  render(<ShareTokenSheet onClose={onClose} />);
  await userEvent.click(screen.getByRole('button', { name: 'Sluiten' }));
  await userEvent.keyboard('{Escape}');
  expect(onClose).toHaveBeenCalledTimes(2);
});
