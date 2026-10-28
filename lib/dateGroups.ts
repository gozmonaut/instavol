// Date sections like the iOS Notes app: Vandaag, Gisteren, Vorige week (2–7 days),
// Vorige maand (8–30 days), then month names. Fixed to Amsterdam time so the
// server render and the browser agree on what "today" is.

const TIME_ZONE = 'Europe/Amsterdam';
const DAY_MS = 24 * 60 * 60 * 1000;

const dayParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const monthName = new Intl.DateTimeFormat('nl-NL', { timeZone: TIME_ZONE, month: 'long' });

// Calendar day in Amsterdam, as a UTC midnight timestamp, so days can be subtracted.
function amsterdamDay(date: Date): { stamp: number; year: number } {
  const [year, month, day] = dayParts.format(date).split('-').map(Number);
  return { stamp: Date.UTC(year, month - 1, day), year };
}

export function dateGroupLabel(date: Date, now: Date = new Date()): string {
  const day = amsterdamDay(date);
  const today = amsterdamDay(now);
  const daysAgo = Math.round((today.stamp - day.stamp) / DAY_MS);

  if (daysAgo <= 0) return 'Vandaag';
  if (daysAgo === 1) return 'Gisteren';
  if (daysAgo <= 7) return 'Vorige week';
  if (daysAgo <= 30) return 'Vorige maand';

  const name = monthName.format(date);
  const label = name.charAt(0).toUpperCase() + name.slice(1);
  return day.year === today.year ? label : `${label} ${day.year}`;
}

// Groups consecutive items (already sorted newest first) under their date label.
export function groupByDate<T extends { createdAt: Date | string }>(
  items: T[],
  now: Date = new Date(),
): { label: string; items: T[] }[] {
  const groups: { label: string; items: T[] }[] = [];
  for (const item of items) {
    const label = dateGroupLabel(new Date(item.createdAt), now);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}
