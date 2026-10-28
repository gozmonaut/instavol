import { normalizeCategory } from '@/lib/categories';

test.each([
  ['  politiek ', [], 'Politiek'],
  ['Politiek.', [], 'Politiek'],
  ['"Tech"', [], 'Tech'],
  ['kunst  en   cultuur', [], 'Kunst en cultuur'],
  ['politiek', ['Politiek'], 'Politiek'],
  ['POLITIEK', ['Politiek'], 'Politiek'],
  ['Economie', ['Économie'], 'Économie'],
  ['Tech', ['Technologie'], 'Tech'],
])('normalizes %j (existing %j) to %j', (raw, existing, expected) => {
  expect(normalizeCategory(raw, existing)).toBe(expected);
});

test.each([[''], ['   '], ['...'], [null], [undefined], [42]])('returns null for empty or invalid input %j', (raw) => {
  expect(normalizeCategory(raw, ['Politiek'])).toBeNull();
});

test('caps very long categories at 40 characters', () => {
  expect(normalizeCategory('a'.repeat(60), [])).toHaveLength(40);
});
