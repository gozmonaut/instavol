// @vitest-environment jsdom
import { render } from '@testing-library/react';
import ThemeKeeper from '@/app/components/ThemeKeeper';

afterEach(() => {
  delete document.documentElement.dataset.theme;
  localStorage.clear();
});

test('puts the remembered theme back on <html> after React rebuilt it', () => {
  localStorage.setItem('instavol-theme', 'dark');
  render(<ThemeKeeper />);
  expect(document.documentElement.dataset.theme).toBe('dark');
});

test('without a choice the device setting decides', () => {
  render(<ThemeKeeper />);
  expect(document.documentElement.dataset.theme).toBeUndefined();
});
