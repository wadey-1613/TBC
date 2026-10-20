# Deal Finder

Describe what you want ("girls bike, purple, £120 max") and get listings ranked by how good a match and a deal they are.

```
npm start            # http://localhost:3000, demo data if no keys
npm test
```

Live results: set `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` (free eBay developer keys; eBay UK is queried).

- **Ranking** (`lib/rank.js`): keyword/colour match, price vs budget, vs other results, vs past prices; seller rating; condition. Postage counts towards price.
- **Alerts**: saved searches re-run every 30 min; new listings scoring ≥ `ALERT_MIN_SCORE` (60) are logged (`lib/alerts.js` — plug in email/push).
- **Price history**: every search records prices in `data/db.json`.
- **More sources**: add a module in `lib/sources/` with `name`, `enabled()`, `search(query)` and register it in `lib/search.js`.
