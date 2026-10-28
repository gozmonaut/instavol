import type { LinkRow } from '@/lib/schema';

const QUESTIONS = {
  kern: 'Kern: wat zijn de belangrijkste beweringen, feiten en cijfers?',
  context: 'Context: welke achtergrond heb ik nodig (voorgeschiedenis, betrokken partijen, eerdere besluiten)?',
  betrouwbaarheid: 'Betrouwbaarheid: wat is onderbouwd, wat ontbreekt, en is het stuk eenzijdig?',
  perspectieven: 'Andere perspectieven: hoe kijken andere partijen, experts of media hiernaar?',
  sindsdien: 'Wat is er sindsdien gebeurd: is er een vervolg of nieuwer nieuws?',
  lezen: 'Verder lezen: 3 à 5 betrouwbare bronnen, met link.',
} as const;

type Question = keyof typeof QUESTIONS;

export const RESEARCH_FOCUSES = [
  { id: 'achtergrond', label: 'Achtergrond', questions: ['kern', 'context', 'sindsdien', 'lezen'] },
  { id: 'factcheck', label: 'Factcheck', questions: ['kern', 'betrouwbaarheid', 'lezen'] },
  { id: 'perspectieven', label: 'Andere perspectieven', questions: ['kern', 'perspectieven', 'lezen'] },
  {
    id: 'alles',
    label: 'Alles',
    questions: ['kern', 'context', 'betrouwbaarheid', 'perspectieven', 'sindsdien', 'lezen'],
  },
] as const satisfies readonly { id: string; label: string; questions: readonly Question[] }[];

export type ResearchFocus = (typeof RESEARCH_FOCUSES)[number]['id'];

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// Prompt to paste into Claude for researching a saved article further.
export function buildResearchPrompt(link: LinkRow, focus: ResearchFocus, savedOn: string): string {
  const { questions } = RESEARCH_FOCUSES.find((f) => f.id === focus)!;
  const summary = link.status === 'done' && link.summary ? link.summary : null;

  const details = [
    link.title && `Titel: ${link.title}`,
    `Bron: ${domainFromUrl(link.url)} – ${link.url}`,
    `Bewaard op: ${savedOn}${link.category ? ` · Categorie: ${link.category}` : ''}`,
    summary && `Samenvatting (automatisch gemaakt, kan onvolledig zijn):\n${summary}`,
  ].filter(Boolean);

  return [
    'Ik wil dit artikel verder onderzoeken.',
    '',
    ...details,
    '',
    'Open het artikel via de link als je dat kunt, en help me met:',
    ...questions.map((q, i) => `${i + 1}. ${QUESTIONS[q]}`),
    '',
    'Antwoord in het Nederlands, ook als het artikel in een andere taal is.',
    'Zeg duidelijk wat je zeker weet en wat niet. Kun je de pagina niet openen,',
    'zeg dat dan en werk met de samenvatting hierboven.',
  ].join('\n');
}
