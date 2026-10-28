export class GeminiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiError';
  }
}

const DEFAULT_MODEL = 'gemini-1.5-flash';

type SummaryResult = { summary: string; category: string };

// Shared rules so new items and the one-off recategorization produce the same kind of categories.
function categorySection(existingCategories: string[]): string[] {
  const categoryList = existingCategories.length > 0
    ? existingCategories.map((category) => `- ${category}`).join('\n')
    : '(nog geen categorieën)';

  return [
    'Bestaande categorieën (meest gebruikt bovenaan):',
    categoryList,
    '',
    'Regels voor de categorie:',
    '- Hergebruik een bestaande categorie als die redelijkerwijs past; kies bij twijfel de meest gebruikte.',
    '- Verzin alleen een nieuwe categorie als echt geen enkele bestaande past.',
    '- Een categorie is een breed onderwerp (bijv. "Politiek", niet "EU-migratiebeleid").',
    '- Gebruik één of twee woorden, in het Nederlands, ook als de tekst in een andere taal is.',
    '- Geen samengestelde categorieën zoals "Tech & AI" of "Politiek/Economie".',
  ];
}

function buildPrompt(pageText: string, existingCategories: string[]): string {
  return [
    'Je krijgt de tekst van een webpagina. Maak een korte samenvatting in het Nederlands en kies een categorie.',
    '',
    ...categorySection(existingCategories),
    '',
    'Antwoord uitsluitend met JSON in exact dit formaat, zonder extra tekst:',
    '{"summary": "...", "category": "..."}',
    '',
    'Tekst:',
    pageText,
  ].join('\n');
}

function buildCategoryPrompt(title: string, summary: string, existingCategories: string[]): string {
  return [
    'Kies een categorie voor dit bewaarde artikel, op basis van de titel en samenvatting.',
    '',
    ...categorySection(existingCategories),
    '',
    'Antwoord uitsluitend met JSON in exact dit formaat, zonder extra tekst:',
    '{"category": "..."}',
    '',
    `Titel: ${title}`,
    `Samenvatting: ${summary}`,
  ].join('\n');
}

function stripCodeFence(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}

function parseJson(text: string): Record<string, unknown> {
  try {
    return (JSON.parse(stripCodeFence(text)) ?? {}) as Record<string, unknown>;
  } catch {
    throw new GeminiError('Gemini gaf geen geldige JSON terug');
  }
}

function parseResult(text: string): SummaryResult {
  const { summary, category } = parseJson(text);
  if (typeof summary !== 'string' || !summary.trim() || typeof category !== 'string' || !category.trim()) {
    throw new GeminiError('Gemini-antwoord mist een samenvatting of categorie');
  }

  return { summary, category };
}

async function generate(prompt: string): Promise<string> {
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const apiKey = process.env.GEMINI_API_KEY;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
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

  return text;
}

export async function summarizeAndCategorize(
  pageText: string,
  existingCategories: string[],
): Promise<SummaryResult> {
  return parseResult(await generate(buildPrompt(pageText, existingCategories)));
}

// Category only, from an already saved title and summary (used to recategorize existing items).
export async function categorize(title: string, summary: string, existingCategories: string[]): Promise<string> {
  const { category } = parseJson(await generate(buildCategoryPrompt(title, summary, existingCategories)));
  if (typeof category !== 'string' || !category.trim()) {
    throw new GeminiError('Gemini-antwoord mist een categorie');
  }
  return category;
}
