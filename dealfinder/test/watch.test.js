import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DEALFINDER_DATA = join(tmpdir(), `df-${process.pid}.json`);
const store = await import('../lib/store.js');
const { checkWatchlist } = await import('../lib/alerts.js');
const { parseQuery } = await import('../lib/query.js');

test('watched listing that got cheaper raises a price-drop notification once', async () => {
  const query = parseQuery('girls bike purple £120 max');
  // demo listing demo-7 costs £37 all-in; pretend we saved it at £60
  await store.addWatch({ id: 'demo-7', title: 'Girls bicycle purple 14 inch + basket', total: 60 }, query);
  await checkWatchlist();
  const notes = await store.listNotifications();
  assert.equal(notes.length, 1);
  assert.equal(notes[0].type, 'drop');
  assert.equal(notes[0].to, 37);
  await checkWatchlist(); // unchanged since last check -> no repeat
  assert.equal((await store.listNotifications()).length, 1);
});
