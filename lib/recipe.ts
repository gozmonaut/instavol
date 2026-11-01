const WORDS_PER_MINUTE = 230;

// Saved recipe html starts with this, so the reader knows to show only the recipe.
export const RECIPE_MARKER = '<div data-recipe="">';

export function isRecipeHtml(html: string): boolean {
  return html.startsWith(RECIPE_MARKER);
}

const NUMBER = String.raw`(?:\d+(?:[.,]\d+)?\s*[½¼¾⅓⅔⅛]?|[½¼¾⅓⅔⅛]|\d+\s*\/\s*\d+)`;
const UNIT = [
  'kg', 'gr', 'gram', 'g', 'mg', 'ml', 'cl', 'dl', 'liter', 'l',
  'eetlepels?', 'el', 'theelepels?', 'tl', 'kopjes?', 'cups?', 'tbsp', 'tsp', 'oz', 'lbs?',
  'stuks?', 'teentjes?', 'tenen', 'teen', 'snufjes?', 'snuf', 'blikjes?', 'blikken', 'blik',
  'pakjes?', 'pakken', 'pak', 'zakjes?', 'bosjes?', 'bos', 'takjes?', 'plakjes?', 'plakken',
  'handjes?', 'handvol', 'scheutjes?', 'scheut', 'mespunt(?:je)?', 'potjes?', 'pot', 'blaadjes?', 'stengels?',
].join('|');
// "200 g", "1½ el", "2-3 teentjes", "1/2 tl": a leading amount, optionally with a unit.
const AMOUNT = new RegExp(String.raw`^(${NUMBER}(?:\s*[-–]\s*${NUMBER})?(?:\s*(?:${UNIT})\.?(?=\s|$))?)\s+(.+)$`, 'i');

// An ingredient line split into its amount and the rest, for the reader's ingredient table.
export function splitIngredient(text: string): { amount: string; name: string } {
  const match = AMOUNT.exec(text.trim());
  return match ? { amount: match[1], name: match[2] } : { amount: '', name: text.trim() };
}

type RecipeSection = { name: string | null; steps: string[] };
type IngredientGroup = { name: string | null; items: string[] };

export type Recipe = {
  html: string;
  readingMinutes: number;
};

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasType(node: JsonObject, type: string): boolean {
  const value = node['@type'];
  return Array.isArray(value) ? value.includes(type) : value === type;
}

// JSON-LD can nest the recipe in arrays and @graph lists.
function findRecipeNode(value: unknown): JsonObject | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
    return null;
  }
  if (!isObject(value)) return null;
  if (hasType(value, 'Recipe')) return value;
  return findRecipeNode(value['@graph']);
}

// Sites put html and entities in these strings; only the plain text is kept.
function plainText(document: Document, value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const template = document.createElement('template');
  template.innerHTML = String(value);
  return template.content.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function asList(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function stepsFrom(document: Document, value: unknown): string[] {
  return asList(value).flatMap((item) => {
    if (typeof item === 'string') {
      // A single string often has one step per line.
      return item
        .split(/\n+/)
        .map((line) => plainText(document, line))
        .filter(Boolean);
    }
    if (isObject(item)) {
      const text = plainText(document, item.text ?? item.name);
      return text ? [text] : [];
    }
    return [];
  });
}

// recipeInstructions: a string, a list of steps, or HowToSections that each have their own steps.
function instructionSections(document: Document, value: unknown): RecipeSection[] {
  const sections: RecipeSection[] = [];
  let loose: RecipeSection | null = null;
  for (const item of asList(value)) {
    if (isObject(item) && (hasType(item, 'HowToSection') || (item.itemListElement && !item.text))) {
      loose = null;
      sections.push({ name: plainText(document, item.name) || null, steps: stepsFrom(document, item.itemListElement) });
    } else {
      if (!loose) {
        loose = { name: null, steps: [] };
        sections.push(loose);
      }
      loose.steps.push(...stepsFrom(document, item));
    }
  }
  return sections.filter((section) => section.steps.length > 0);
}

// ISO 8601 duration ("PT1H15M") in minutes.
function durationMinutes(value: unknown): number {
  if (typeof value !== 'string') return 0;
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/i.exec(value.trim());
  if (!match) return 0;
  const [, days, hours, minutes] = match.map((part) => Number(part) || 0);
  return days * 24 * 60 + hours * 60 + minutes;
}

function formatMinutes(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (!hours) return `${minutes} min`;
  return minutes ? `${hours} uur ${minutes} min` : `${hours} uur`;
}

function servings(document: Document, value: unknown): string {
  const text = asList(value)
    .map((item) => plainText(document, item))
    .find(Boolean);
  if (!text) return '';
  return /^\d+$/.test(text) ? `${text} ${text === '1' ? 'persoon' : 'personen'}` : text;
}

// Reader html for a recipe: servings, time, ingredients (optionally in groups) and steps, nothing else.
function buildRecipe(
  document: Document,
  recipe: { servings: string; minutes: number; ingredients: IngredientGroup[]; sections: RecipeSection[] },
): Recipe {
  // Built with textContent, so nothing from the page ends up as markup.
  const root = document.createElement('div');
  root.setAttribute('data-recipe', '');
  const add = (parent: Element, tag: string, text?: string) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    parent.append(element);
    return element;
  };
  const addFact = (label: string, value: string) => {
    const p = add(root, 'p');
    add(p, 'strong', `${label}: `);
    p.append(value);
  };

  if (recipe.servings) addFact('Voor', recipe.servings);
  if (recipe.minutes) addFact('Bereidingstijd', formatMinutes(recipe.minutes));
  add(root, 'h2', 'Ingrediënten');
  for (const group of recipe.ingredients) {
    if (group.name) add(root, 'h3', group.name);
    const list = add(root, 'ul');
    group.items.forEach((ingredient) => add(list, 'li', ingredient));
  }
  add(root, 'h2', 'Bereiding');
  for (const section of recipe.sections) {
    if (section.name) add(root, 'h3', section.name);
    const steps = add(root, 'ol');
    section.steps.forEach((step) => add(steps, 'li', step));
  }

  const words = [...recipe.ingredients.flatMap((group) => group.items), ...recipe.sections.flatMap((section) => section.steps)]
    .join(' ')
    .split(/\s+/).length;
  return { html: root.outerHTML, readingMinutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)) };
}

// The page's schema.org Recipe as reader html: servings, time, ingredients and steps, nothing else.
// Returns null when the page has no recipe with both ingredients and steps.
export function extractRecipe(document: Document): Recipe | null {
  let node: JsonObject | null = null;
  for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      node = findRecipeNode(JSON.parse(script.textContent ?? ''));
    } catch {
      continue;
    }
    if (node) break;
  }
  if (!node) return null;

  const ingredients = asList(node.recipeIngredient ?? node.ingredients)
    .map((item) => plainText(document, item))
    .filter(Boolean);
  const sections = instructionSections(document, node.recipeInstructions);
  if (!ingredients.length || !sections.length) return null;

  const minutes = durationMinutes(node.totalTime) || durationMinutes(node.prepTime) + durationMinutes(node.cookTime);
  const forPeople = servings(document, node.recipeYield);

  return buildRecipe(document, { servings: forPeople, minutes, ingredients: [{ name: null, items: ingredients }], sections });
}

const INGREDIENTS_HEADING = /^(ingredi[eë]nt(en)?|benodigdheden|wat heb je nodig|boodschappen(lijst)?|ingredients)\b/i;
const METHOD_HEADING = /^(bereiding(swijze)?|werkwijze|instructies|zo maak je|aan de slag|methode|preparation|method|directions|instructions)\b/i;
const MAX_LABEL_LENGTH = 60;

function headingLevel(element: Element): number {
  const match = /^H([1-6])$/.exec(element.tagName);
  return match ? Number(match[1]) : 0;
}

function textOf(element: Element): string {
  return element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

// Where the recipe ends: a closing line that is all bold or italic ("Kijk voor meer recepten...",
// "Foto: ...") or one with links.
function isClosingParagraph(element: Element): boolean {
  if (element.tagName !== 'P') return false;
  if (element.querySelector('a')) return true;
  const children = Array.from(element.children);
  const emphasized = children.filter((child) => /^(STRONG|B|EM|I)$/.test(child.tagName)).map(textOf).join(' ');
  return children.length > 0 && emphasized.replace(/\s+/g, '') === textOf(element).replace(/\s+/g, '');
}

// A recipe written as a normal article, with an ingredients heading followed by a method heading,
// turned into the same reader html as extractRecipe. `document` holds the cleaned article.
// Returns null when it doesn't read as a recipe.
export function recipeFromArticle(document: Document): Recipe | null {
  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  const ingredientsHeading = headings.find((heading) => INGREDIENTS_HEADING.test(textOf(heading)));
  if (!ingredientsHeading) return null;
  const following = headings.slice(headings.indexOf(ingredientsHeading) + 1);
  const methodHeading = following.find(
    (heading) => heading.parentElement === ingredientsHeading.parentElement && METHOD_HEADING.test(textOf(heading)),
  );
  if (!methodHeading) return null;

  // Ingredients: lists, each after an optional short label ("Voor de saus").
  const ingredients: IngredientGroup[] = [];
  let label: string | null = null;
  for (let element = ingredientsHeading.nextElementSibling; element && element !== methodHeading; element = element.nextElementSibling) {
    if (element.tagName === 'UL' || element.tagName === 'OL') {
      const items = Array.from(element.children).map(textOf).filter(Boolean);
      if (items.length) ingredients.push({ name: label, items });
      label = null;
    } else {
      const text = textOf(element);
      label = text && text.length <= MAX_LABEL_LENGTH ? text.replace(/[:\s]+$/, '') : null;
    }
  }

  // Steps: paragraphs and list items, in sections under lower headings, up to the next heading
  // at the method heading's level or the closing lines.
  const sections: RecipeSection[] = [];
  let section: RecipeSection = { name: null, steps: [] };
  const methodLevel = headingLevel(methodHeading);
  for (let element = methodHeading.nextElementSibling; element; element = element.nextElementSibling) {
    const level = headingLevel(element);
    if ((level && level <= methodLevel) || isClosingParagraph(element)) break;
    if (level) {
      sections.push(section);
      section = { name: textOf(element) || null, steps: [] };
    } else if (element.tagName === 'UL' || element.tagName === 'OL') {
      section.steps.push(...Array.from(element.children).map(textOf).filter(Boolean));
    } else {
      const text = textOf(element);
      if (text) section.steps.push(text);
    }
  }
  sections.push(section);

  const steps = sections.filter((part) => part.steps.length > 0);
  if (ingredients.flatMap((group) => group.items).length < 2 || !steps.length) return null;

  // "Ingrediënten, voor 4 personen"
  const servings = /voor\s+(\d+(?:\s*[-–]\s*\d+)?\s*(?:personen|persoon|stuks)?)/i.exec(textOf(ingredientsHeading))?.[1] ?? '';
  return buildRecipe(document, { servings, minutes: 0, ingredients, sections: steps });
}
