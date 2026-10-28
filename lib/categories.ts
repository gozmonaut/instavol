const MAX_LENGTH = 40;

// Case- and accent-insensitive key, so "politiek", "Politiek" and "Politíek" count as the same category.
function categoryKey(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

// Cleans up a category from the AI or the user, reusing the spelling of an existing category when one matches.
// Returns null when nothing usable is left. Synonyms (Tech vs Technologie) are deliberately not merged.
export function normalizeCategory(raw: unknown, existing: string[]): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’.,;:!?]+$/g, '')
    .trim()
    .slice(0, MAX_LENGTH)
    .trim();
  if (!cleaned) return null;

  const match = existing.find((category) => categoryKey(category) === categoryKey(cleaned));
  if (match) return match;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
