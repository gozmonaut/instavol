import { JSDOM } from 'jsdom';
import { extractRecipe, isRecipeHtml } from '@/lib/recipe';

function pageWith(...jsonLd: unknown[]): Document {
  const scripts = jsonLd
    .map((data) => `<script type="application/ld+json">${typeof data === 'string' ? data : JSON.stringify(data)}</script>`)
    .join('');
  return new JSDOM(`<html><head>${scripts}</head><body><p>Het verhaal van oma.</p></body></html>`).window.document;
}

const recipe = {
  '@context': 'https://schema.org',
  '@type': 'Recipe',
  name: 'Pompoensoep',
  description: 'Een lang verhaal over de herfst',
  recipeYield: ['4', '4 porties'],
  totalTime: 'PT1H15M',
  recipeIngredient: ['1 pompoen', '2 uien &amp; knoflook'],
  recipeInstructions: [
    { '@type': 'HowToStep', text: 'Snijd de <b>pompoen</b> in blokjes.' },
    { '@type': 'HowToStep', text: 'Kook 30 minuten.' },
  ],
};

test('keeps only servings, time, ingredients and steps', () => {
  const result = extractRecipe(pageWith(recipe))!;
  const body = new JSDOM(result.html).window.document.body;
  expect(isRecipeHtml(result.html)).toBe(true);
  expect(body.textContent).toContain('Voor: 4 personen');
  expect(body.textContent).toContain('Bereidingstijd: 1 uur 15 min');
  expect(Array.from(body.querySelectorAll('ul li'), (li) => li.textContent)).toEqual(['1 pompoen', '2 uien & knoflook']);
  expect(Array.from(body.querySelectorAll('ol li'), (li) => li.textContent)).toEqual([
    'Snijd de pompoen in blokjes.',
    'Kook 30 minuten.',
  ]);
  expect(body.textContent).not.toContain('herfst');
  expect(body.querySelector('b')).toBeNull();
});

test('finds the recipe inside @graph and with a list of types', () => {
  const page = pageWith({ '@context': 'https://schema.org', '@graph': [{ '@type': 'WebPage' }, { ...recipe, '@type': ['Recipe', 'NewsArticle'] }] });
  expect(extractRecipe(page)).not.toBeNull();
});

test('skips broken JSON-LD and keeps looking', () => {
  expect(extractRecipe(pageWith('{ kapot', recipe))).not.toBeNull();
});

test('keeps step sections as subheadings, and splits a single text into lines', () => {
  const sectioned = extractRecipe(
    pageWith({
      ...recipe,
      prepTime: 'PT20M',
      totalTime: undefined,
      cookTime: 'PT25M',
      recipeInstructions: [
        { '@type': 'HowToSection', name: 'Saus', itemListElement: [{ '@type': 'HowToStep', text: 'Roer.' }] },
        { '@type': 'HowToSection', name: 'Pasta', itemListElement: [{ '@type': 'HowToStep', text: 'Kook.' }] },
      ],
    }),
  )!;
  const body = new JSDOM(sectioned.html).window.document.body;
  expect(Array.from(body.querySelectorAll('h3'), (h3) => h3.textContent)).toEqual(['Saus', 'Pasta']);
  expect(body.textContent).toContain('Bereidingstijd: 45 min');

  const lines = extractRecipe(pageWith({ ...recipe, recipeInstructions: 'Stap een.\nStap twee.' }))!;
  expect(new JSDOM(lines.html).window.document.querySelectorAll('ol li')).toHaveLength(2);
});

test('no recipe without both ingredients and steps', () => {
  expect(extractRecipe(pageWith({ '@type': 'NewsArticle', headline: 'Nieuws' }))).toBeNull();
  expect(extractRecipe(pageWith({ ...recipe, recipeInstructions: [] }))).toBeNull();
  expect(extractRecipe(pageWith({ ...recipe, recipeIngredient: [] }))).toBeNull();
});
