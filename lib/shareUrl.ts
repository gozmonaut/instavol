// Returns the trimmed http(s) URL, or null if the input isn't one.
// new URL() silently strips inner newlines, so whitespace is rejected before parsing.
export function parseShareUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const url = raw.trim();
  if (!url || /\s/.test(url)) return null;

  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}
