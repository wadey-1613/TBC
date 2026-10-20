// eBay Browse API (UK marketplace). Needs EBAY_CLIENT_ID and EBAY_CLIENT_SECRET.
let token = { value: null, expires: 0 };

async function getToken() {
  if (token.value && Date.now() < token.expires) return token.value;
  const auth = Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
  });
  if (!res.ok) throw new Error(`eBay auth ${res.status}`);
  const j = await res.json();
  token = { value: j.access_token, expires: Date.now() + (j.expires_in - 60) * 1000 };
  return token.value;
}

export function toListing(it) {
  const cond = (it.condition ?? '').toLowerCase();
  return {
    id: `ebay-${it.itemId}`,
    source: 'eBay',
    title: it.title,
    condition: cond.includes('new') ? 'new' : 'used',
    price: Number(it.price?.value),
    shipping: Number(it.shippingOptions?.[0]?.shippingCost?.value ?? 0),
    currency: it.price?.currency ?? 'GBP',
    url: it.itemWebUrl,
    image: it.image?.imageUrl ?? null,
    sellerRating: it.seller?.feedbackPercentage ? Number(it.seller.feedbackPercentage) : null,
    location: it.itemLocation?.country ?? null,
  };
}

export const ebay = {
  name: 'ebay',
  enabled: () => Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET),
  async search(q) {
    const params = new URLSearchParams({
      q: [q.keywords, q.colour].filter(Boolean).join(' '),
      limit: '100',
      sort: 'price',
    });
    const filters = ['priceCurrency:GBP', 'buyingOptions:{FIXED_PRICE}'];
    if (q.maxPrice) filters.push(`price:[..${q.maxPrice}]`);
    if (q.condition === 'new') filters.push('conditions:{NEW}');
    if (q.condition === 'used') filters.push('conditions:{USED}');
    params.set('filter', filters.join(','));

    const res = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`, {
      headers: { Authorization: `Bearer ${await getToken()}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_GB' },
    });
    if (!res.ok) throw new Error(`eBay search ${res.status}`);
    const j = await res.json();
    return (j.itemSummaries ?? []).map(toListing).filter((l) => Number.isFinite(l.price));
  },
};
