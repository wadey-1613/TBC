import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery } from '../lib/query.js';
import { rankListings } from '../lib/rank.js';
import { toListing } from '../lib/sources/ebay.js';
import { mock } from '../lib/sources/mock.js';

test('parses the girls bike example', () => {
  const q = parseQuery('girls bike purple £120 max');
  assert.equal(q.keywords, 'girls bike');
  assert.equal(q.colour, 'purple');
  assert.equal(q.maxPrice, 120);
});

test('parses "under £99.99"', () => {
  assert.equal(parseQuery('red kettle under £99.99').maxPrice, 99.99);
});

test('ranking enforces budget incl. postage, keyword match and prefers colour', async () => {
  const q = parseQuery('girls bike purple £120 max');
  const r = rankListings(await mock.search(), q);
  assert.ok(r.every((x) => x.total <= 120));
  assert.ok(!r.some((x) => /boys/i.test(x.title)), 'boys bike excluded');
  assert.ok(r[0].title.toLowerCase().includes('purple'));
  assert.ok(r[0].score >= r.at(-1).score);
});

test('price history boosts a cheap listing', () => {
  const q = parseQuery('girls bike');
  const l = [{ id: 1, title: 'girls bike', price: 50, shipping: 0, condition: 'used', sellerRating: 95 }];
  const plain = rankListings(l, q)[0].score;
  const withHist = rankListings(l, q, { history: [100, 110, 90] })[0].score;
  assert.ok(withHist > plain);
});

test('maps an eBay item summary', () => {
  const l = toListing({ itemId: 'v1|1|0', title: 'x', price: { value: '40.00', currency: 'GBP' }, condition: 'Used',
    itemWebUrl: 'u', seller: { feedbackPercentage: '99.1' }, shippingOptions: [{ shippingCost: { value: '5.00' } }] });
  assert.deepEqual([l.price, l.shipping, l.condition, l.sellerRating], [40, 5, 'used', 99.1]);
});
