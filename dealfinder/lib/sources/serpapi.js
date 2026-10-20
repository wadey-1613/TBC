// Google Shopping via SerpAPI: one call fans out to Argos, Halfords, Amazon, Decathlon, John Lewis, etc.
// Needs SERPAPI_KEY.
const num = (v) => (v == null ? NaN : Number(String(v).replace(/[^\d.]/g, '')));

export function toListing(it, i = 0) {
  const price = it.extracted_price ?? num(it.price);
  const delivery = String(it.delivery ?? '').toLowerCase();
  const shipping = delivery.includes('free') ? 0 : delivery.match(/£\s*(\d+(?:\.\d+)?)/)?.[1];
  return {
    id: `gshop-${it.product_id ?? it.position ?? i}-${(it.source ?? '').toLowerCase()}`,
    source: it.source ?? 'Google Shopping',
    title: it.title,
    condition: /used|refurb|pre-owned|second.?hand/i.test(`${it.second_hand_condition ?? ''} ${it.title}`) ? 'used' : 'new',
    price,
    shipping: shipping == null ? 0 : Number(shipping),
    currency: 'GBP',
    url: it.product_link ?? it.link,
    image: it.thumbnail ?? null,
    sellerRating: it.rating ? Math.round(Number(it.rating) * 20) : null, // 5-star -> %
    location: 'UK',
  };
}

export const serpapi = {
  name: 'google-shopping',
  enabled: () => Boolean(process.env.SERPAPI_KEY),
  async search(q) {
    const params = new URLSearchParams({
      engine: 'google_shopping',
      q: [q.keywords, q.colour].filter(Boolean).join(' '),
      google_domain: 'google.co.uk', gl: 'uk', hl: 'en', num: '40',
      api_key: process.env.SERPAPI_KEY,
    });
    if (q.maxPrice) params.set('max_price', String(q.maxPrice));
    const res = await fetch(`https://serpapi.com/search.json?${params}`);
    if (!res.ok) throw new Error(`SerpAPI ${res.status}`);
    const j = await res.json();
    return (j.shopping_results ?? []).map(toListing).filter((l) => Number.isFinite(l.price) && l.url);
  },
};
