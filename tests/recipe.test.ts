import { JSDOM } from 'jsdom';
import { extractRecipe, isRecipeHtml, recipeFromArticle, splitIngredient } from '@/lib/recipe';

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

test('splitIngredient separates the amount from the ingredient', () => {
  expect(splitIngredient('200 g bloem')).toEqual({ amount: '200 g', name: 'bloem' });
  expect(splitIngredient('1½ el olijfolie')).toEqual({ amount: '1½ el', name: 'olijfolie' });
  expect(splitIngredient('2-3 teentjes knoflook')).toEqual({ amount: '2-3 teentjes', name: 'knoflook' });
  expect(splitIngredient('1/2 tl zout')).toEqual({ amount: '1/2 tl', name: 'zout' });
  expect(splitIngredient('3 eieren')).toEqual({ amount: '3', name: 'eieren' });
  expect(splitIngredient('1 blik tomaten (400 g)')).toEqual({ amount: '1 blik', name: 'tomaten (400 g)' });
  expect(splitIngredient('zout en peper')).toEqual({ amount: '', name: 'zout en peper' });
});

function articleDocument(html: string): Document {
  return new JSDOM(`<body>${html}</body>`).window.document;
}

test('recipeFromArticle keeps only the ingredients and steps of a recipe written as an article', () => {
  const recipe = recipeFromArticle(
    articleDocument(`
      <p><strong>In het nieuwe kookboek draait alles om voorbereiding.</strong></p>
      <p>Wie liever vis eet, kan garnalen nemen.</p>
      <h2>Ingrediënten, voor 4 personen</h2>
      <p><em>Sticky kippendijen</em></p>
      <ul><li>3 eetlepels sojasaus</li><li>2 eetlepels honing</li></ul>
      <p><em>Rijstsalade </em></p>
      <ul><li>1 rijpe mango</li></ul>
      <h2>Bereiding rijstsalade met sticky kippendij</h2>
      <h3>Sticky kippendijen</h3>
      <p>Meng de sojasaus en honing.</p>
      <p>Bak de kip.</p>
      <h3>Rijstsalade</h3>
      <p>Kook de rijst.</p>
      <p><strong>Kijk voor meer recepten op <a href="https://x.example">onze receptenpagina</a>.</strong></p>
      <p><em>Foto: Jeroen</em></p>
    `),
  );
  expect(recipe).not.toBeNull();
  expect(isRecipeHtml(recipe!.html)).toBe(true);
  const body = new JSDOM(recipe!.html).window.document.body;
  expect(body.textContent).not.toContain('kookboek');
  expect(body.textContent).not.toContain('garnalen');
  expect(body.textContent).not.toContain('Kijk voor meer');
  expect(body.textContent).not.toContain('Foto');
  expect(body.textContent).toContain('Voor: 4 personen');
  expect(Array.from(body.querySelectorAll('h2, h3')).map((h) => h.textContent)).toEqual([
    'Ingrediënten',
    'Sticky kippendijen',
    'Rijstsalade',
    'Bereiding',
    'Sticky kippendijen',
    'Rijstsalade',
  ]);
  expect(Array.from(body.querySelectorAll('ul li')).map((li) => li.textContent)).toEqual([
    '3 eetlepels sojasaus',
    '2 eetlepels honing',
    '1 rijpe mango',
  ]);
  expect(Array.from(body.querySelectorAll('ol li')).map((li) => li.textContent)).toEqual([
    'Meng de sojasaus en honing.',
    'Bak de kip.',
    'Kook de rijst.',
  ]);
});

test('recipeFromArticle stops the steps at the next main heading', () => {
  const recipe = recipeFromArticle(
    articleDocument(`
      <h2>Ingrediënten</h2><ul><li>200 g bloem</li><li>1 ei</li></ul>
      <h2>Bereiding</h2><ol><li>Mengen</li><li>Bakken</li></ol>
      <h2>Lees ook</h2><p>Een ander artikel</p>
    `),
  );
  const body = new JSDOM(recipe!.html).window.document.body;
  expect(Array.from(body.querySelectorAll('ol li')).map((li) => li.textContent)).toEqual(['Mengen', 'Bakken']);
  expect(body.textContent).not.toContain('Lees ook');
});

test('recipeFromArticle ignores articles without both an ingredients and a method heading', () => {
  expect(recipeFromArticle(articleDocument('<h2>Ingrediënten</h2><ul><li>a</li><li>b</li></ul><p>Tekst</p>'))).toBeNull();
  expect(recipeFromArticle(articleDocument('<h2>Bereiding</h2><p>Mengen</p>'))).toBeNull();
  expect(recipeFromArticle(articleDocument('<h2>Het nieuws</h2><p>Tekst</p><h2>Bereiding</h2><p>x</p>'))).toBeNull();
});
