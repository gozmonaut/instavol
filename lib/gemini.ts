export class GeminiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiError';
  }
}

const DEFAULT_MODEL = 'gemini-1.5-flash';

type SummaryResult = { summary: string; category: string };

function buildPrompt(pageText: string, existingCategories: string[]): string {
  const categoryList = existingCategories.length > 0
    ? existingCategories.map((category) => `- ${category}`).join('\n')
    : '(nog geen categorieën)';

  return [
    'Je krijgt de tekst van een webpagina. Maak een korte samenvatting in het Nederlands en kies een categorie.',
    '',
    'Bestaande categorieën:',
    categoryList,
    '',
    'Hergebruik een van de bestaande categorieën als die redelijkerwijs past. Verzin alleen een nieuwe categorie als geen van de bestaande past.',
    '',
    'Antwoord uitsluitend met JSON in exact dit formaat, zonder extra tekst:',
    '{"summary": "...", "category": "..."}',
    '',
    'Tekst:',
    pageText,
  ].join('\n');
}

function stripCodeFence(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}

function parseResult(text: string): SummaryResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(text));
  } catch {
    throw new GeminiError('Gemini gaf geen geldige JSON terug');
  }

  const { summary, category } = (parsed ?? {}) as Partial<Record<keyof SummaryResult, unknown>>;
  if (typeof summary !== 'string' || !summary.trim() || typeof category !== 'string' || !category.trim()) {
    throw new GeminiError('Gemini-antwoord mist een samenvatting of categorie');
  }

  return { summary, category };
}

export async function summarizeAndCategorize(
  pageText: string,
  existingCategories: string[],
): Promise<SummaryResult> {
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const apiKey = process.env.GEMINI_API_KEY;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(pageText, existingCategories) }] }],
      }),
    },
  );
  if (!response.ok) {
    throw new GeminiError(`Gemini-verzoek mislukt (HTTP ${response.status})`);
  }

  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') {
    throw new GeminiError('Gemini-antwoord bevat geen tekst');
  }

  return parseResult(text);
}
