// Runs one tiny real search per configured source and reports which keys work.
import { ebay } from '../lib/sources/ebay.js';
import { serpapi } from '../lib/sources/serpapi.js';
import { etsy } from '../lib/sources/etsy.js';
import { web } from '../lib/sources/web.js';

const query = { keywords: 'girls bike', colour: 'purple', maxPrice: 120, condition: 'any' };
let bad = 0;
for (const s of [ebay, serpapi, etsy, web]) {
  if (!s.enabled()) { console.log(`–  ${s.name.padEnd(16)} no key set`); continue; }
  const t = Date.now();
  try {
    const r = await s.search(query);
    console.log(`✔  ${s.name.padEnd(16)} ${r.length} listings in ${((Date.now() - t) / 1000).toFixed(1)}s${r[0] ? `  e.g. £${r[0].price} ${r[0].title}` : ''}`);
  } catch (e) { bad++; console.log(`✘  ${s.name.padEnd(16)} ${e.message}`); }
}
process.exit(bad ? 1 : 0);
