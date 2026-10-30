const WORDS_PER_MINUTE = 230;

// Saved recipe html starts with this, so the reader knows to show only the recipe.
export const RECIPE_MARKER = '<div data-recipe="">';

export function isRecipeHtml(html: string): boolean {
  return html.startsWith(RECIPE_MARKER);
}

type RecipeSection = { name: string | null; steps: string[] };

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

  if (forPeople) addFact('Voor', forPeople);
  if (minutes) addFact('Bereidingstijd', formatMinutes(minutes));
  add(root, 'h2', 'Ingrediënten');
  const list = add(root, 'ul');
  ingredients.forEach((ingredient) => add(list, 'li', ingredient));
  add(root, 'h2', 'Bereiding');
  for (const section of sections) {
    if (section.name) add(root, 'h3', section.name);
    const steps = add(root, 'ol');
    section.steps.forEach((step) => add(steps, 'li', step));
  }

  const words = [...ingredients, ...sections.flatMap((section) => section.steps)].join(' ').split(/\s+/).length;
  return { html: root.outerHTML, readingMinutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)) };
}
