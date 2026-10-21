const BEARER_PREFIX = 'Bearer ';
const BASIC_PREFIX = 'Basic ';

export function isValidApiToken(request: Request): boolean {
  const expected = process.env.API_TOKEN;
  const header = request.headers.get('authorization');
  if (!expected || !header?.startsWith(BEARER_PREFIX)) return false;
  return header.slice(BEARER_PREFIX.length) === expected;
}

export function isValidBasicAuth(request: Request): boolean {
  const username = process.env.SITE_USERNAME;
  const password = process.env.SITE_PASSWORD;
  const header = request.headers.get('authorization');
  if (!username || !password || !header?.startsWith(BASIC_PREFIX)) return false;

  const credentials = decodeBase64Utf8(header.slice(BASIC_PREFIX.length));
  if (credentials === null) return false;

  const separator = credentials.indexOf(':');
  if (separator === -1) return false;
  return credentials.slice(0, separator) === username && credentials.slice(separator + 1) === password;
}

// atob/TextDecoder instead of Buffer so this also runs in the edge runtime.
function decodeBase64Utf8(value: string): string | null {
  try {
    const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}
