import { summarizeAndCategorize, GeminiError } from '@/lib/gemini';

test('returns summary and category, and includes existing categories in the prompt', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: '{"summary": "Korte samenvatting.", "category": "Tech"}' }] } }],
  }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);

  const result = await summarizeAndCategorize('lange artikeltekst', ['Tech', 'Koken']);

  expect(result).toEqual({ summary: 'Korte samenvatting.', category: 'Tech' });
  const [, requestInit] = fetchMock.mock.calls[0];
  expect(requestInit.body).toContain('Tech');
  expect(requestInit.body).toContain('Koken');
});

test('throws GeminiError on a non-OK response', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 })));
  await expect(summarizeAndCategorize('tekst', [])).rejects.toBeInstanceOf(GeminiError);
});

test('accepts a JSON answer wrapped in a code fence', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: '```json\n{"summary": "Samenvatting.", "category": "Koken"}\n```' }] } }],
  }), { status: 200 })));
  await expect(summarizeAndCategorize('tekst', ['Koken'])).resolves.toEqual({ summary: 'Samenvatting.', category: 'Koken' });
});

test('uses GEMINI_MODEL from the environment, falling back to the default model', async () => {
  const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: '{"summary": "S.", "category": "C"}' }] } }],
  }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);

  vi.stubEnv('GEMINI_MODEL', 'gemini-test-model');
  await summarizeAndCategorize('tekst', []);
  expect(fetchMock.mock.calls[0][0]).toContain('/models/gemini-test-model:generateContent');

  vi.stubEnv('GEMINI_MODEL', '');
  await summarizeAndCategorize('tekst', []);
  expect(fetchMock.mock.calls[1][0]).toContain('/models/gemini-1.5-flash:generateContent');

  vi.unstubAllEnvs();
});

test('throws GeminiError when the response is not valid JSON', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: 'not json' }] } }],
  }), { status: 200 })));
  await expect(summarizeAndCategorize('tekst', [])).rejects.toBeInstanceOf(GeminiError);
});
