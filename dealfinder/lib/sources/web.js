// Claude with web search: reaches places with no API (Gumtree, Vinted, Preloved, Facebook-indexed pages, niche shops).
// Slower and costs per search, so it only runs when ANTHROPIC_API_KEY is set. Needs ANTHROPIC_API_KEY.
export function parseListings(text) {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return [];
  let arr;
  try { arr = JSON.parse(m[0]); } catch { return []; }
  return arr
    .filter((x) => x && x.url && typeof x.title === 'string' && Number.isFinite(Number(x.price)))
    .map((x, i) => ({
      id: `web-${i}-${x.url}`,
      source: x.site || new URL(x.url).hostname.replace(/^www\./, ''),
      title: x.title,
      condition: x.condition === 'new' ? 'new' : 'used',
      price: Number(x.price),
      shipping: Number(x.shipping) || 0,
      currency: 'GBP',
      url: x.url,
      image: null,
      sellerRating: null,
      location: x.location ?? null,
    }));
}

export const web = {
  name: 'web-search',
  enabled: () => Boolean(process.env.ANTHROPIC_API_KEY),
  async search(q) {
    const want = [q.keywords, q.colour].filter(Boolean).join(' ');
    const prompt = `Find real, currently-available UK listings for: "${want}"${q.maxPrice ? ` costing at most £${q.maxPrice} including postage` : ''}.
Search second-hand marketplaces (Gumtree, Vinted, Preloved, Facebook Marketplace, Depop, Shpock) and UK retailers. Only include listings you actually saw a price for on a page.
Reply with ONLY a JSON array, up to 15 items: [{"title":"","price":0,"shipping":0,"condition":"new|used","url":"","site":"","location":""}]`;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.WEB_SEARCH_MODEL ?? 'claude-sonnet-5-5',
        max_tokens: 4000,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6, user_location: { type: 'approximate', country: 'GB' } }],
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}`);
    const j = await res.json();
    return parseListings(j.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n'));
  },
};
