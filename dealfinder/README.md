# Deal Finder

Describe what you want ("girls bike, purple, £120 max") and get listings ranked by how good a match and a deal they are.

```
npm start            # http://localhost:3000, demo data if no keys
npm test
```

Live results: every source with its key set runs in parallel; results are merged, de-duplicated (cheapest copy wins) and ranked together. With no keys it shows demo data.

| Source | Env vars | Covers |
|---|---|---|
| eBay UK | `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` | new + used, auctions excluded |
| Google Shopping (SerpAPI) | `SERPAPI_KEY` | Argos, Halfords, Amazon, Decathlon, John Lewis and most UK retailers |
| Etsy | `ETSY_API_KEY` | handmade, vintage |
| Web search (Claude) | `ANTHROPIC_API_KEY` | Gumtree, Vinted, Preloved, Facebook Marketplace pages and niche shops; slower, costs per search |

`GET /api/sources` shows which are enabled. Facebook Marketplace, Gumtree, Vinted and Depop have no public search APIs and scraping them breaks their terms, so they are only reached via the web-search source.

- **Ranking** (`lib/rank.js`): keyword/colour match, price vs budget, vs other results, vs past prices; seller rating; condition. Postage counts towards price.
- **Alerts**: saved searches re-run every 30 min; new listings scoring ≥ `ALERT_MIN_SCORE` (60) are logged (`lib/alerts.js` — plug in email/push).
- **Price history**: every search records prices in `data/db.json`.
- **More sources**: add a module in `lib/sources/` with `name`, `enabled()`, `search(query)` and register it in `lib/search.js`.
