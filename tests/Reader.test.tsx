// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
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

test('unreadable saved settings fall back to the defaults', () => {
  localStorage.setItem('instavol.reader', JSON.stringify({ font: 'comic', size: 99, bold: 'ja' }));
  expect(loadSettings()).toMatchObject({ font: 'serif', size: 1, bold: false });
});
