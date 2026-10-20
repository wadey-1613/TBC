// Re-runs saved searches and notifies about new listings scoring above a threshold.
import { runSearch } from './search.js';
import { listAlerts, markSeen, listWatch, setWatchTotal, addNotification, searchKey } from './store.js';

const MIN_SCORE = Number(process.env.ALERT_MIN_SCORE ?? 60);

export async function checkAlerts(notify = defaultNotify) {
  const found = [];
  for (const alert of await listAlerts()) {
    const { results } = await runSearch(alert.query);
    const fresh = results.filter((r) => r.score >= MIN_SCORE && !alert.seen.includes(r.id));
    if (!fresh.length) continue;
    await notify(alert, fresh);
    await markSeen(alert.id, fresh.map((r) => r.id));
    found.push({ alert: alert.id, count: fresh.length });
  }
  await checkWatchlist();
  return found;
}

// A watched listing that now costs less than when saved raises a notification.
export async function checkWatchlist() {
  const cache = new Map();
  for (const w of await listWatch()) {
    const k = searchKey(w.query);
    if (!cache.has(k)) cache.set(k, (await runSearch(w.query)).results);
    const now = cache.get(k).find((r) => r.id === w.listing.id);
    if (!now || now.total >= w.savedTotal - 0.5) continue;
    await addNotification({ type: 'drop', listingId: w.listing.id, title: w.listing.title, from: w.savedTotal, to: now.total, url: now.url, text: `The price of ${w.listing.title} has dropped to £${now.total}!` });
    await setWatchTotal(w.id, now.total, now);
  }
}

// Swap for email/push (e.g. Resend, ntfy.sh) — logging only for now.
async function defaultNotify(alert, fresh) {
  const q = alert.query;
  console.log(`[alert] "${q.keywords}${q.colour ? ' ' + q.colour : ''}" ≤£${q.maxPrice ?? '∞'}: ${fresh.length} new deal(s)`);
  for (const r of fresh.slice(0, 3)) console.log(`  £${r.total} ${r.title} (${r.score}) ${r.url}`);
}

export function startAlertLoop(everyMs = 30 * 60 * 1000) {
  const t = setInterval(() => checkAlerts().catch((e) => console.error('alert check failed', e)), everyMs);
  t.unref();
}
