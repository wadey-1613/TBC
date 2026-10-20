import { ebay } from './sources/ebay.js';
import { mock } from './sources/mock.js';
import { rankListings } from './rank.js';
import { recordPrices, historyFor } from './store.js';

// Add more sources here (each exposes name, enabled(), search(query)).
const SOURCES = [ebay, mock];

export function activeSources() {
  const real = SOURCES.filter((s) => s !== mock && s.enabled());
  return real.length ? real : [mock];
}

export async function runSearch(query) {
  const sources = activeSources();
  const settled = await Promise.allSettled(sources.map((s) => s.search(query)));
  const errors = [];
  const listings = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') listings.push(...r.value);
    else errors.push(`${sources[i].name}: ${r.reason.message}`);
  });

  const history = await historyFor(query);
  const results = rankListings(listings, query, { history });
  await recordPrices(query, listings);
  return { results, sources: sources.map((s) => s.name), errors, demo: sources[0] === mock };
}
