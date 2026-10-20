// Re-runs saved searches and notifies about new listings scoring above a threshold.
import { runSearch } from './search.js';
import { listAlerts, markSeen } from './store.js';

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
  return found;
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
