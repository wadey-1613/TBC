import { ebay } from './sources/ebay.js';
import { serpapi } from './sources/serpapi.js';
import { etsy } from './sources/etsy.js';
import { web } from './sources/web.js';
import { mock } from './sources/mock.js';
import { rankListings, tokens } from './rank.js';
import { recordPrices, historyFor } from './store.js';

// Add more sources here (each exposes name, enabled(), search(query)).
const SOURCES = [ebay, serpapi, etsy, web, mock];
const TIMEOUT_MS = Number(process.env.SOURCE_TIMEOUT_MS ?? 25000);

export function activeSources() {
  const real = SOURCES.filter((s) => s !== mock && s.enabled());
  return real.length ? real : [mock];
}

export function allSources() {
  return SOURCES.filter((s) => s !== mock).map((s) => ({ name: s.name, enabled: s.enabled() }));
}

const withTimeout = (p, ms, name) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${name} timed out`)), ms))]);

// Same item surfaced by several sources (or twice by one): keep the cheapest.
export function dedupe(listings) {
  const seen = new Map();
  for (const l of listings) {
    const key = l.url && l.url !== '#' ? l.url.split('?')[0] : `${tokens(l.title).sort().join(' ')}|${l.price}|${l.source}`;
    const prev = seen.get(key);
    if (!prev || l.price + (l.shipping ?? 0) < prev.price + (prev.shipping ?? 0)) seen.set(key, l);
  }
  return [...seen.values()];
}

export async function runSearch(query) {
  const sources = activeSources();
  const settled = await Promise.allSettled(sources.map((s) => withTimeout(s.search(query), TIMEOUT_MS, s.name)));
  const errors = [];
  const bySource = {};
  let listings = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      bySource[sources[i].name] = r.value.length;
      listings.push(...r.value);
    } else errors.push(`${sources[i].name}: ${r.reason.message}`);
  });
  listings = dedupe(listings);

  const history = await historyFor(query);
  const results = rankListings(listings, query, { history });
  await recordPrices(query, listings);
  return { results, sources: sources.map((s) => s.name), bySource, errors, demo: sources[0] === mock };
}
