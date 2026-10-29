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
  , { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
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
    '<html><head><title>App</title></head><body><div id="app"></div></body></html>', { status: 200, headers: { 'Content-Type': 'text/html' } }
  )));
  await expect(fetchPageText('https://example.com/spa')).rejects.toBeInstanceOf(PageFetchError);
});

test('a page that is not an article still yields its title, description and visible text', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '<html><head><title>Fietsshop</title><meta name="description" content="De webshop voor elektrische fietsen, onderdelen en accessoires met gratis levering in heel Nederland."><script>var tracking = "geheim";</script></head>'
    + '<body><nav><a href="/">Home</a> <a href="/fietsen">Fietsen</a></nav><ul><li>Stadsfietsen</li><li>Bakfietsen</li><li>Racefietsen</li><li>Mountainbikes</li><li>Kinderfietsen</li><li>Fietstassen en sloten</li></ul><button>In winkelwagen</button></body></html>',
    { status: 200, headers: { 'Content-Type': 'text/html' } },
  )));
  const result = await fetchPageText('https://example.com/');
  expect(result.title).toBe('Fietsshop');
  expect(result.text).toContain('Beschrijving: De webshop voor elektrische fietsen');
  expect(result.text).toContain('Bakfietsen');
  expect(result.text).not.toContain('tracking');
});

test('throws PageFetchError when the extracted text is only short boilerplate', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '<html><head><title>Site</title></head><body><article><p>Enable JavaScript to continue.</p></article></body></html>', { status: 200, headers: { 'Content-Type': 'text/html' } }
  )));
  await expect(fetchPageText('https://example.com/boilerplate')).rejects.toThrow('Geen leesbare inhoud gevonden');
});

test('throws PageFetchError when the Content-Type is not HTML', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '%PDF-1.4 binary garbage that happens to be longer than two hundred characters so it would otherwise clear the minimum article length check used to decide whether page content looks like a real extracted article body.',
    { status: 200, headers: { 'Content-Type': 'application/pdf' } },
  )));
  await expect(fetchPageText('https://example.com/file.pdf')).rejects.toThrow('Pagina is geen leesbare webpagina');
});

test('throws PageFetchError when Content-Length exceeds the size cap', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '<html><head><title>Huge</title></head><body><article><p>content</p></article></body></html>',
    { status: 200, headers: { 'Content-Type': 'text/html', 'Content-Length': String(6 * 1024 * 1024) } },
  )));
  await expect(fetchPageText('https://example.com/huge')).rejects.toThrow('Pagina is te groot om te verwerken');
});

test('truncates very long extracted article text to the cap', async () => {
  const longParagraph = 'Dit is een voldoende lange zin die herhaald wordt om de afkap-grens te testen. '.repeat(400);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    `<html><head><title>Long</title></head><body><article><p>${longParagraph}</p></article></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html' } },
  )));
  const result = await fetchPageText('https://example.com/long-article');
  expect(result.text.length).toBe(25_000);
});

test('surfaces a fetch timeout as PageFetchError', async () => {
  const timeoutError = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeoutError));
  await expect(fetchPageText('https://example.com/slow')).rejects.toBeInstanceOf(PageFetchError);
});

test('fetchPageText refuses to follow a redirect to a disallowed host', async () => {
  lookupMock.mockImplementation(async (hostname: string) => {
    if (hostname === 'metadata.example') {
      return [{ address: '169.254.169.254', family: 4 }];
    }
    return [{ address: '93.184.216.34', family: 4 }];
  });
  const fetchMock = vi.fn().mockResolvedValueOnce(
    new Response(null, { status: 302, headers: { Location: 'http://metadata.example/secret' } }),
  );
  vi.stubGlobal('fetch', fetchMock);
  await expect(fetchPageText('https://example.com/redirect')).rejects.toThrow('Dit adres mag niet opgehaald worden');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('fetchPageText follows a redirect to a public host', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(null, { status: 301, headers: { Location: 'https://example.com/final' } }))
    .mockResolvedValueOnce(new Response(
      '<html><head><title>Final Title</title></head><body><article><p>Een bekende alinea met genoeg tekst om als artikel herkend te worden door Readability. Deze zin is bewust wat langer gemaakt, zodat de tekst ruim boven de minimale lengte van tweehonderd tekens uitkomt.</p></article></body></html>',
      { status: 200, headers: { 'Content-Type': 'text/html' } },
    ));
  vi.stubGlobal('fetch', fetchMock);
  const result = await fetchPageText('https://example.com/start');
  expect(result.title).toBe('Final Title');
  expect(fetchMock).toHaveBeenCalledTimes(2);
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

test('an article also yields its cleaned html, byline, date, reading time and share image', async () => {
  const paragraph = '<p>Een bekende alinea met genoeg tekst om als artikel herkend te worden door Readability. Deze zin is bewust wat langer gemaakt, zodat de tekst ruim boven de minimale lengte uitkomt.</p>';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '<html><head><title>Artikel</title><meta property="og:image" content="/beeld.jpg">'
    + '<meta name="author" content="Jan Jansen"><meta property="article:published_time" content="2026-10-28T09:00:00Z"></head>'
    + `<body><article>${paragraph.repeat(30)}<script>steal()</script></article></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html' } },
  )));
  const result = await fetchPageText('https://example.com/nieuws/artikel');
  expect(result.imageUrl).toBe('https://example.com/beeld.jpg');
  expect(result.article?.byline).toBe('Jan Jansen');
  expect(result.article?.publishedAt).toEqual(new Date('2026-10-28T09:00:00Z'));
  expect(result.article?.readingMinutes).toBe(4);
  expect(result.article?.html).toContain('Een bekende alinea');
  expect(result.article?.html).not.toContain('steal');
});

test('a page that is not an article has no reader html, but keeps its share image', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '<html><head><title>Fietsshop</title><meta property="og:image" content="https://cdn.example/shop.jpg">'
    + '<meta name="description" content="De webshop voor elektrische fietsen, onderdelen en accessoires met gratis levering in heel Nederland."></head>'
    + '<body><ul><li>Stadsfietsen</li><li>Bakfietsen</li><li>Racefietsen</li><li>Mountainbikes</li><li>Kinderfietsen</li><li>Fietstassen en sloten</li></ul><button>In winkelwagen</button></body></html>',
    { status: 200, headers: { 'Content-Type': 'text/html' } },
  )));
  const result = await fetchPageText('https://example.com/');
  expect(result.imageUrl).toBe('https://cdn.example/shop.jpg');
  expect(result.article).toBeUndefined();
});

test('a share image that is not http(s) is ignored', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '<html><head><title>Fixture Title</title><meta property="og:image" content="javascript:alert(1)"></head><body><article><p>Een bekende alinea met genoeg tekst om als artikel herkend te worden door Readability. Deze zin is bewust wat langer gemaakt, zodat de tekst ruim boven de minimale lengte van tweehonderd tekens uitkomt en de test betrouwbaar slaagt.</p></article></body></html>',
    { status: 200, headers: { 'Content-Type': 'text/html' } },
  )));
  const result = await fetchPageText('https://example.com/article');
  expect(result.imageUrl).toBeNull();
});
