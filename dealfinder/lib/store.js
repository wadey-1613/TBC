// Tiny JSON-file store: saved searches (alerts) and price history per search.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

const FILE = process.env.DEALFINDER_DATA ?? new URL('../data/db.json', import.meta.url).pathname;
let chain = Promise.resolve(); // serialise writes

async function load() {
  try { return JSON.parse(await readFile(FILE, 'utf8')); }
  catch { return { alerts: [], history: {} }; }
}
async function save(db) {
  await mkdir(dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(db, null, 2));
}
const update = (fn) => (chain = chain.then(async () => { const db = await load(); const r = await fn(db); await save(db); return r; }));

export const searchKey = (q) =>
  [q.keywords, q.colour, q.condition].map((s) => String(s ?? '').toLowerCase().trim()).join('|');

export async function recordPrices(q, listings) {
  const day = new Date().toISOString().slice(0, 10);
  await update((db) => {
    const h = (db.history[searchKey(q)] ??= []);
    for (const l of listings) h.push({ day, id: l.id, total: l.price + (l.shipping ?? 0) });
    db.history[searchKey(q)] = h.slice(-5000);
  });
}

// Prices seen on earlier days (excludes today so a fresh search isn't compared with itself).
export async function historyFor(q) {
  const db = await load();
  const today = new Date().toISOString().slice(0, 10);
  return (db.history[searchKey(q)] ?? []).filter((p) => p.day < today).map((p) => p.total);
}

export async function priceSeries(q) {
  const db = await load();
  const byDay = {};
  for (const p of db.history[searchKey(q)] ?? []) (byDay[p.day] ??= []).push(p.total);
  return Object.entries(byDay).map(([day, v]) => ({ day, min: Math.min(...v), count: v.length }));
}

export async function listAlerts() { return (await load()).alerts; }
export const addAlert = (query, email) =>
  update((db) => { const a = { id: randomUUID(), query, email: email || null, seen: [], created: Date.now() }; db.alerts.push(a); return a; });
export const removeAlert = (id) => update((db) => { db.alerts = db.alerts.filter((a) => a.id !== id); });
export const markSeen = (id, ids) =>
  update((db) => { const a = db.alerts.find((x) => x.id === id); if (a) a.seen = [...new Set([...a.seen, ...ids])].slice(-500); });
