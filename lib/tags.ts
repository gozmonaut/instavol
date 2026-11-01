const MAX_TAG_LENGTH = 40;
const MAX_TAGS = 20;

// The user's own labels: trimmed, without empty ones, and each only once (ignoring case).
// Returns null when the input isn't a list of strings.
export function normalizeTags(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((tag) => typeof tag === 'string')) return null;
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of value as string[]) {
    const tag = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH);
    const key = tag.toLocaleLowerCase('nl');
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags.slice(0, MAX_TAGS);
}
