// Etsy Open API v3 (handmade, vintage). Needs ETSY_API_KEY (keystring, or "keystring:secret").
export function toListing(it) {
  const p = it.price ?? {};
  return {
    id: `etsy-${it.listing_id}`,
    source: 'Etsy',
    title: it.title,
    condition: it.who_made === 'someone_else' && it.when_made?.includes('before') ? 'used' : 'new',
    price: p.amount / (p.divisor || 100),
    shipping: 0,
    currency: p.currency_code ?? 'GBP',
    url: it.url,
    image: it.images?.[0]?.url_570xN ?? null,
    sellerRating: null,
    location: null,
  };
}

export const etsy = {
  name: 'etsy',
  enabled: () => Boolean(process.env.ETSY_API_KEY),
  async search(q) {
    const params = new URLSearchParams({
      keywords: [q.keywords, q.colour].filter(Boolean).join(' '),
      limit: '50', sort_on: 'score', includes: 'Images',
    });
    if (q.maxPrice) params.set('max_price', String(q.maxPrice));
    const res = await fetch(`https://openapi.etsy.com/v3/application/listings/active?${params}`, {
      headers: { 'x-api-key': process.env.ETSY_API_KEY },
    });
    if (!res.ok) throw new Error(`Etsy ${res.status}`);
    const j = await res.json();
    return (j.results ?? []).map(toListing).filter((l) => l.currency === 'GBP' && Number.isFinite(l.price));
  },
};
