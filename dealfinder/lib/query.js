// Turns a free-text request ("girls bike purple under £120") into a structured search.
const COLOURS = ['purple', 'pink', 'blue', 'red', 'green', 'black', 'white', 'yellow', 'orange', 'silver', 'grey', 'gray', 'gold', 'brown'];

export function parseQuery(text, overrides = {}) {
  let rest = ` ${text} `;
  let maxPrice = null;

  const priceRe = /(?:under|below|max|up to|less than|<=?)?\s*£\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:quid|gbp|pounds)/i;
  const m = rest.match(priceRe);
  if (m) {
    maxPrice = Number(m[1] ?? m[2]);
    rest = rest.replace(m[0], ' ');
  }

  const colour = COLOURS.find((c) => new RegExp(`\\b${c}\\b`, 'i').test(rest)) ?? null;
  if (colour) rest = rest.replace(new RegExp(`\\b${colour}\\b`, 'i'), ' ');

  const keywords = rest.replace(/\b(under|below|max|up to|less than)\b/gi, ' ').replace(/[-,]/g, ' ').replace(/\s+/g, ' ').trim();
  return { keywords, colour, maxPrice, condition: 'any', ...clean(overrides) };
}

function clean(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));
}
