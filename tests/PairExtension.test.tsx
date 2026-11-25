// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PairExtension from '@/app/extensie-koppelen/PairExtension';

afterEach(() => {
  vi.restoreAllMocks();
});

test('pairing asks for a token and hands it to the page for the extension', async () => {
  const fetchMock = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(JSON.stringify({ token: 'abc' }), { status: 200 }));
  const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
  render(<PairExtension />);
  await userEvent.click(screen.getByRole('button', { name: 'Koppel extensie' }));
  expect(fetchMock).toHaveBeenCalledWith('/api/extension-token', { method: 'POST' });
  expect(postMessage).toHaveBeenCalledWith({ type: 'instavol-extension-token', token: 'abc' }, window.location.origin);
  expect(await screen.findByRole('status')).toHaveTextContent('Gekoppeld');
});

test('a failed request shows an error and sends nothing', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 401 }));
  const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
  render(<PairExtension />);
  await userEvent.click(screen.getByRole('button', { name: 'Koppel extensie' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Koppelen is niet gelukt');
  expect(postMessage).not.toHaveBeenCalled();
});
