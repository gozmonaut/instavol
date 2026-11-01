import { dateGroupLabel, groupByDate } from '@/lib/dateGroups';

// Wednesday 28 Oct 2026, 10:00 in Amsterdam (CET, UTC+1)
const now = new Date('2026-10-28T09:00:00Z');

function amsterdam(localIso: string): Date {
  // All test dates fall in CET (UTC+1).
  return new Date(`${localIso}+01:00`);
}

test.each([
  ['2026-10-28T00:05', 'Vandaag'],
  ['2026-10-27T23:55', 'Gisteren'],
  ['2026-10-27T00:00', 'Gisteren'],
  ['2026-10-26T00:00', 'Eerder deze week'],
  ['2026-10-25T23:55', 'Vorige week'],
  ['2026-10-19T00:00', 'Vorige week'],
  ['2026-10-18T12:00', 'Eerder deze maand'],
  ['2026-10-01T12:00', 'Eerder deze maand'],
  ['2026-09-30T12:00', 'September'],
  ['2026-01-15T12:00', 'Januari'],
  ['2025-12-31T12:00', 'December 2025'],
])('%s is grouped under "%s"', (local, label) => {
  expect(dateGroupLabel(amsterdam(local), now)).toBe(label);
});

test.each([
  // On Sunday the whole week since Monday is "this week"...
  ['2026-11-01T12:00', '2026-10-26T12:00', 'Eerder deze week'],
  ['2026-11-01T12:00', '2026-10-25T12:00', 'Vorige week'],
  ['2026-11-01T12:00', '2026-10-18T12:00', 'Oktober'],
  // ...and on Monday, the day before yesterday already belongs to last week.
  ['2026-11-02T12:00', '2026-10-31T12:00', 'Vorige week'],
  ['2026-11-02T12:00', '2026-10-26T12:00', 'Vorige week'],
  ['2026-11-02T12:00', '2026-10-25T12:00', 'Oktober'],
])('on %s, %s is grouped under "%s"', (today, local, label) => {
  expect(dateGroupLabel(amsterdam(local), amsterdam(today))).toBe(label);
});

test('uses Amsterdam days, not UTC days, around midnight', () => {
  // 23:30 UTC on the 27th is already 00:30 on the 28th in Amsterdam.
  expect(dateGroupLabel(new Date('2026-10-27T23:30:00Z'), now)).toBe('Vandaag');
});

test('a date slightly in the future still counts as today', () => {
  expect(dateGroupLabel(new Date('2026-10-28T09:05:00Z'), now)).toBe('Vandaag');
});

test('groups consecutive items while keeping their order', () => {
  const items = [
    { id: 'a', createdAt: amsterdam('2026-10-28T08:00') },
    { id: 'b', createdAt: amsterdam('2026-10-28T07:00') },
    { id: 'c', createdAt: amsterdam('2026-10-27T12:00') },
    { id: 'd', createdAt: amsterdam('2026-08-01T12:00') },
  ];
  expect(groupByDate(items, now).map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
    ['Vandaag', ['a', 'b']],
    ['Gisteren', ['c']],
    ['Augustus', ['d']],
  ]);
});

test('accepts ISO strings, as returned by the API', () => {
  expect(groupByDate([{ createdAt: '2026-10-27T12:00:00Z' }], now)[0].label).toBe('Gisteren');
});
