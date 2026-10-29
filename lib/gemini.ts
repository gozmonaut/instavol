export class GeminiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiError';
  }
}

const DEFAULT_MODEL = 'gemini-1.5-flash';

type SummaryResult = { summary: string; category: string };
type UrlSummaryResult = SummaryResult & { title: string };

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
    '- Hergebruik een bestaande categorie als die het onderwerp specifiek dekt. Kies geen bredere categorie alleen omdat die vaak gebruikt wordt.',
    '- Dekt geen enkele bestaande categorie het onderwerp specifiek, verzin dan een nieuwe.',
    '- Een categorie is een specifiek onderwerp, één niveau onder een algemeen thema: bijv. "Migratie" of "Verkiezingen" in plaats van "Politiek", "AI" of "Smartphones" in plaats van "Tech", "Voeding" in plaats van "Gezondheid".',
    '- Maar niet zo smal dat er maar één artikel bij past: niet "EU-migratiebeleid" of "Frontex".',
    '- Gebruik één of twee woorden, in het Nederlands, ook als de tekst in een andere taal is.',
    '- Geen samengestelde categorieën zoals "Tech & AI" of "Politiek/Economie".',
  ];
}

// Not every saved link is an article: a homepage, product or tool should still get a useful summary.
const NON_ARTICLE_INSTRUCTION =
  'Het kan een artikel zijn, maar ook bijvoorbeeld een homepage, product, tool of dienst. Is het geen artikel, beschrijf dan wat de site of pagina is en waarvoor je hem gebruikt.';

function buildPrompt(pageText: string, existingCategories: string[]): string {
  return [
    'Je krijgt de tekst van een webpagina. Maak een korte samenvatting in het Nederlands en kies een categorie.',
    NON_ARTICLE_INSTRUCTION,
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

function buildUrlPrompt(url: string, existingCategories: string[]): string {
  return [
    `Open de webpagina op ${url}. Geef de titel, maak een korte samenvatting in het Nederlands en kies een categorie.`,
    NON_ARTICLE_INSTRUCTION,
    'Baseer je alleen op wat er op de pagina staat; verzin niets op basis van de URL.',
    '',
    ...categorySection(existingCategories),
    '',
    'Antwoord uitsluitend met JSON in exact dit formaat, zonder extra tekst:',
    '{"title": "...", "summary": "...", "category": "..."}',
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

type UrlMetadata = { urlRetrievalStatus?: string; url_retrieval_status?: string };
type Candidate = {
  content?: { parts?: { text?: string }[] };
  urlContextMetadata?: { urlMetadata?: UrlMetadata[] };
  url_context_metadata?: { url_metadata?: UrlMetadata[] };
};

// With urlContext, Gemini fetches the URL in the prompt itself (needs Gemini 2.5 or newer).
async function generate(prompt: string, { urlContext = false } = {}): Promise<string> {
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const apiKey = process.env.GEMINI_API_KEY;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        ...(urlContext && { tools: [{ url_context: {} }] }),
      }),
    },
  );
  if (!response.ok) {
    throw new GeminiError(`Gemini-verzoek mislukt (HTTP ${response.status})`);
  }

  const data = (await response.json()) as { candidates?: Candidate[] };
  const candidate = data.candidates?.[0];
  if (urlContext && !pageWasRetrieved(candidate)) {
    throw new GeminiError('Gemini kon de pagina niet openen');
  }

  // With tools the answer can come in several parts.
  const texts = (candidate?.content?.parts ?? []).map((part) => part.text).filter((text) => typeof text === 'string');
  if (texts.length === 0) {
    throw new GeminiError('Gemini-antwoord bevat geen tekst');
  }

  return texts.join('');
}

// Without a successful retrieval the model would only be guessing from the URL.
function pageWasRetrieved(candidate: Candidate | undefined): boolean {
  const entries = candidate?.urlContextMetadata?.urlMetadata ?? candidate?.url_context_metadata?.url_metadata ?? [];
  return entries.some(
    (entry) => (entry.urlRetrievalStatus ?? entry.url_retrieval_status) === 'URL_RETRIEVAL_STATUS_SUCCESS',
  );
}

export async function summarizeAndCategorize(
  pageText: string,
  existingCategories: string[],
): Promise<SummaryResult> {
  return parseResult(await generate(buildPrompt(pageText, existingCategories)));
}

// For pages we can't read ourselves (blocked, built with JavaScript, PDF, ...): Gemini opens the URL.
export async function summarizeUrlAndCategorize(url: string, existingCategories: string[]): Promise<UrlSummaryResult> {
  const text = await generate(buildUrlPrompt(url, existingCategories), { urlContext: true });
  const { summary, category } = parseResult(text);
  const { title } = parseJson(text);
  return { title: typeof title === 'string' ? title.trim() : '', summary, category };
}

// Category only, from an already saved title and summary (used to recategorize existing items).
export async function categorize(title: string, summary: string, existingCategories: string[]): Promise<string> {
  const { category } = parseJson(await generate(buildCategoryPrompt(title, summary, existingCategories)));
  if (typeof category !== 'string' || !category.trim()) {
    throw new GeminiError('Gemini-antwoord mist een categorie');
  }
  return category;
}
