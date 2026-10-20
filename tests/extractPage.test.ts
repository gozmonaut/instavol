import { lookup } from 'node:dns/promises';
import { fetchPageText, isDisallowedHost, PageFetchError } from '@/lib/extractPage';

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));

type LookupAll = (hostname: string, options: { all: true }) => Promise<{ address: string; family: number }[]>;
const lookupMock = vi.mocked(lookup as unknown as LookupAll);

beforeEach(() => {
  lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
});

test('extracts title and article text', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '<html><head><title>Fixture Title</title></head><body><article><p>Een bekende alinea met genoeg tekst om als artikel herkend te worden door Readability. Deze zin is bewust wat langer gemaakt, zodat de tekst ruim boven de minimale lengte van tweehonderd tekens uitkomt en de test betrouwbaar slaagt voor de extractie van de inhoud.</p></article></body></html>'
  , { status: 200 })));
  const result = await fetchPageText('https://example.com/article');
  expect(result.title).toBe('Fixture Title');
  expect(result.text).toContain('bekende alinea');
});

test('throws PageFetchError when the page cannot be fetched', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
  await expect(fetchPageText('https://example.com/missing')).rejects.toBeInstanceOf(PageFetchError);
});

test('throws PageFetchError when there is no extractable article text', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '<html><head><title>App</title></head><body><div id="app"></div></body></html>', { status: 200 }
  )));
  await expect(fetchPageText('https://example.com/spa')).rejects.toBeInstanceOf(PageFetchError);
});

test('throws PageFetchError when the extracted text is only short boilerplate', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '<html><head><title>Site</title></head><body><article><p>Enable JavaScript to continue.</p></article></body></html>', { status: 200 }
  )));
  await expect(fetchPageText('https://example.com/boilerplate')).rejects.toThrow('Geen leesbare inhoud gevonden');
});

test.each(['0.0.0.0', '127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '::', '::1', 'fd00::1', 'fe80::1'])(
  'isDisallowedHost blocks unspecified, private, loopback and link-local address %s',
  async (address) => {
    lookupMock.mockResolvedValueOnce([{ address, family: address.includes(':') ? 6 : 4 }]);
    await expect(isDisallowedHost('internal.example')).resolves.toBe(true);
  },
);

test('isDisallowedHost allows a public address', async () => {
  await expect(isDisallowedHost('example.com')).resolves.toBe(false);
});

test('fetchPageText refuses to fetch a host that resolves to a blocked address', async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  lookupMock.mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }]);
  await expect(fetchPageText('http://metadata.example/latest')).rejects.toThrow('Dit adres mag niet opgehaald worden');
  expect(fetchMock).not.toHaveBeenCalled();
});
