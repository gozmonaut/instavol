import { fetchPageText, PageFetchError } from '@/lib/extractPage';

test('extracts title and article text', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '<html><head><title>Fixture Title</title></head><body><article><p>Een bekende alinea met genoeg tekst om als artikel herkend te worden door Readability, zodat de test betrouwbaar is.</p></article></body></html>'
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
