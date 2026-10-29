import { summarizeAndCategorize, summarizeUrlAndCategorize, categorize, GeminiError } from '@/lib/gemini';

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

test('the prompt asks for broad, short, Dutch categories and to reuse existing ones', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: '{"summary": "S.", "category": "Tech"}' }] } }],
  }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  await summarizeAndCategorize('tekst', ['Politiek', 'Tech']);
  const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text as string;
  expect(prompt).toContain('één of twee woorden');
  expect(prompt).toContain('in het Nederlands');
  expect(prompt).toContain('specifiek onderwerp');
  expect(prompt).toContain('Kies geen bredere categorie alleen omdat die vaak gebruikt wordt');
  expect(prompt).not.toContain('breed onderwerp');
  expect(prompt).toMatch(/- Politiek\n- Tech/);
});

describe('categorize (category only, from title and summary)', () => {
  test('returns the category and sends title, summary and existing categories', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '{"category": "Politiek"}' }] } }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(categorize('Frontex wordt deportatiebureau', 'De EU wil Frontex versterken.', ['Politiek'])).resolves.toBe('Politiek');
    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text as string;
    expect(prompt).toContain('Frontex wordt deportatiebureau');
    expect(prompt).toContain('De EU wil Frontex versterken.');
    expect(prompt).toContain('- Politiek');
  });

  test('throws GeminiError when the answer has no category', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '{"summary": "x"}' }] } }],
    }), { status: 200 })));
    await expect(categorize('T', 'S', [])).rejects.toBeInstanceOf(GeminiError);
  });
});

test('the prompt also covers pages that are not articles', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: '{"summary": "S.", "category": "Tech"}' }] } }],
  }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  await summarizeAndCategorize('tekst', []);
  const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text as string;
  expect(prompt).toContain('homepage, product, tool of dienst');
});

describe('summarizeUrlAndCategorize (Gemini opens the URL itself)', () => {
  const answer = '{"title": "Fietsshop", "summary": "Een webshop voor fietsen.", "category": "Winkelen"}';

  test('enables the URL context tool and returns title, summary and category', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{
        content: { parts: [{ text: answer.slice(0, 20) }, { text: answer.slice(20) }] },
        urlContextMetadata: { urlMetadata: [{ retrievedUrl: 'https://shop.example', urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_SUCCESS' }] },
      }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await summarizeUrlAndCategorize('https://shop.example', ['Winkelen']);

    expect(result).toEqual({ title: 'Fietsshop', summary: 'Een webshop voor fietsen.', category: 'Winkelen' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tools).toEqual([{ url_context: {} }]);
    expect(body.contents[0].parts[0].text).toContain('https://shop.example');
  });

  test('throws when Gemini could not retrieve the page, instead of guessing from the URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{
        content: { parts: [{ text: answer }] },
        urlContextMetadata: { urlMetadata: [{ retrievedUrl: 'https://shop.example', urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_ERROR' }] },
      }],
    }), { status: 200 })));
    await expect(summarizeUrlAndCategorize('https://shop.example', [])).rejects.toThrow('Gemini kon de pagina niet openen');
  });

  test('throws when the answer has no retrieval metadata at all', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: answer }] } }],
    }), { status: 200 })));
    await expect(summarizeUrlAndCategorize('https://shop.example', [])).rejects.toBeInstanceOf(GeminiError);
  });

  test('the text-based summary does not enable any tools', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '{"summary": "S.", "category": "C"}' }] } }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await summarizeAndCategorize('tekst', []);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).tools).toBeUndefined();
  });
});
