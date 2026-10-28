import { buildResearchPrompt, RESEARCH_FOCUSES } from '@/lib/researchPrompt';
import type { LinkRow } from '@/lib/schema';

const article: LinkRow = {
  id: '1',
  url: 'https://www.tagesschau.de/frontex',
  title: 'Frontex soll zur Abschiebeagentur werden',
  status: 'done',
  summary: 'De EU-Kommissie heeft wetgevingsvoorstellen gepresenteerd.',
  category: 'Politiek',
  errorMessage: null,
  createdAt: new Date('2026-10-28T15:20:00Z'),
  updatedAt: new Date('2026-10-28T15:20:00Z'),
};

const savedOn = '28 okt 2026, 16:20';

test('every prompt carries the article details and the honesty instructions', () => {
  for (const focus of RESEARCH_FOCUSES) {
    const prompt = buildResearchPrompt(article, focus.id, savedOn);
    expect(prompt).toContain('Titel: Frontex soll zur Abschiebeagentur werden');
    expect(prompt).toContain('Bron: www.tagesschau.de – https://www.tagesschau.de/frontex');
    expect(prompt).toContain('Bewaard op: 28 okt 2026, 16:20 · Categorie: Politiek');
    expect(prompt).toContain('De EU-Kommissie heeft wetgevingsvoorstellen gepresenteerd.');
    expect(prompt).toContain('Antwoord in het Nederlands');
    expect(prompt).toContain('Zeg duidelijk wat je zeker weet en wat niet.');
  }
});

test('"alles" asks all six questions, numbered 1 to 6', () => {
  const prompt = buildResearchPrompt(article, 'alles', savedOn);
  for (const n of [1, 2, 3, 4, 5, 6]) expect(prompt).toMatch(new RegExp(`^${n}\\. `, 'm'));
  expect(prompt).toContain('Betrouwbaarheid:');
  expect(prompt).toContain('Andere perspectieven:');
});

test('"factcheck" asks core, reliability and further reading, renumbered', () => {
  const prompt = buildResearchPrompt(article, 'factcheck', savedOn);
  expect(prompt).toMatch(/^1\. Kern:/m);
  expect(prompt).toMatch(/^2\. Betrouwbaarheid:/m);
  expect(prompt).toMatch(/^3\. Verder lezen:/m);
  expect(prompt).not.toContain('Context:');
  expect(prompt).not.toContain('Andere perspectieven:');
});

test('"achtergrond" asks core, context, what happened since and further reading', () => {
  const prompt = buildResearchPrompt(article, 'achtergrond', savedOn);
  expect(prompt).toMatch(/^2\. Context:/m);
  expect(prompt).toMatch(/^3\. Wat is er sindsdien gebeurd:/m);
  expect(prompt).not.toContain('Betrouwbaarheid:');
});

test('leaves out missing title, category and summary instead of printing empty fields', () => {
  const bare = { ...article, title: null, category: null, summary: null, status: 'failed' };
  const prompt = buildResearchPrompt(bare, 'perspectieven', savedOn);
  expect(prompt).not.toContain('Titel:');
  expect(prompt).not.toContain('Categorie');
  expect(prompt).not.toContain('Samenvatting');
  expect(prompt).toContain('Bewaard op: 28 okt 2026, 16:20');
  expect(prompt).toMatch(/^2\. Andere perspectieven:/m);
});
