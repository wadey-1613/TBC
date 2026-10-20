// Scores listings 0-100 on how good a match and a deal they are.
const STOP = new Set(['a', 'an', 'the', 'for', 'and', 'of', 'with']);

export function tokens(s) {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t && !STOP.has(t));
}

export function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Treat "girls" and "girl's" the same, and "bike"/"bicycle".
const ALIASES = { bicycle: 'bike', bicycles: 'bike', bikes: 'bike', girl: 'girls' };
const norm = (t) => ALIASES[t] ?? t;

export function rankListings(listings, query, { history = [] } = {}) {
  const want = tokens(query.keywords).map(norm);
  const total = (l) => l.price + (l.shipping ?? 0);

  const eligible = listings.filter((l) => query.maxPrice == null || total(l) <= query.maxPrice);
  const med = median(eligible.map(total));
  const histMed = median(history);

  const scored = eligible.map((l) => {
    const title = new Set(tokens(l.title).map(norm));
    const kw = want.length ? want.filter((w) => title.has(w)).length / want.length : 1;
    const colourHit = !query.colour || title.has(query.colour);

    // Hard requirement: most keywords must appear.
    if (kw < 0.6) return null;

    const price = total(l);
    const vsBudget = query.maxPrice ? 1 - price / query.maxPrice : 0.5; // cheaper than budget
    const vsMedian = med ? Math.max(-1, Math.min(1, 1 - price / med)) : 0; // cheaper than peers
    const vsHistory = histMed ? Math.max(-1, Math.min(1, 1 - price / histMed)) : 0;
    const trust = l.sellerRating == null ? 0.5 : l.sellerRating / 100;
    const cond = l.condition === 'new' ? 1 : l.condition === 'used' ? 0.6 : 0.5;

    // Match 35 + deal quality 45 + trust 10 + condition 5 (+5 headroom for history).
    const score =
      21 * kw + (colourHit ? 14 : 0) +
      25 * Math.max(0, vsMedian) + 10 * Math.max(0, vsBudget) + 10 * Math.max(0, vsHistory) +
      10 * trust + 5 * cond;

    const reasons = [];
    if (colourHit && query.colour) reasons.push(`${query.colour}`);
    if (med && price < med * 0.85) reasons.push(`${Math.round((1 - price / med) * 100)}% below typical`);
    if (histMed && price < histMed * 0.9) reasons.push(`${Math.round((1 - price / histMed) * 100)}% below price history`);
    if (l.sellerRating != null && l.sellerRating >= 98) reasons.push('top-rated seller');
    if (!colourHit) reasons.push(`colour not in title`);

    return { ...l, total: round(price), score: Math.round(Math.min(100, score)), reasons };
  }).filter(Boolean);

  return scored.sort((a, b) => b.score - a.score || a.total - b.total);
}

const round = (n) => Math.round(n * 100) / 100;
