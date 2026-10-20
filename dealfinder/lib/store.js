// Tiny JSON-file store: saved searches (alerts) and price history per search.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

const FILE = process.env.DEALFINDER_DATA ?? new URL('../data/db.json', import.meta.url).pathname;
let chain = Promise.resolve(); // serialise writes

async function load() {
  let db;
  try { db = JSON.parse(await readFile(FILE, 'utf8')); } catch { db = {}; }
  return { alerts: [], history: {}, watch: [], notifications: [], ...db };
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

export async function priceSeries(q, id) {
  const db = await load();
  const byDay = {};
  for (const p of db.history[searchKey(q)] ?? []) if (!id || p.id === id) (byDay[p.day] ??= []).push(p.total);
  return Object.entries(byDay).map(([day, v]) => ({ day, min: Math.min(...v), count: v.length }));
}

export async function listAlerts() { return (await load()).alerts; }
export const addAlert = (query, email) =>
  update((db) => { const a = { id: randomUUID(), query, email: email || null, seen: [], created: Date.now() }; db.alerts.push(a); return a; });
export const removeAlert = (id) => update((db) => { db.alerts = db.alerts.filter((a) => a.id !== id); });
export const markSeen = (id, ids) =>
  update((db) => { const a = db.alerts.find((x) => x.id === id); if (a) a.seen = [...new Set([...a.seen, ...ids])].slice(-500); });

// Watchlist: a listing snapshot plus the search that found it, so we can re-find it and spot price drops.
export async function listWatch() { return (await load()).watch; }
export const addWatch = (listing, query) =>
  update((db) => {
    const ex = db.watch.find((w) => w.listing.id === listing.id);
    if (ex) return ex;
    const w = { id: randomUUID(), listing, query, savedTotal: listing.total, created: Date.now() };
    db.watch.push(w);
    return w;
  });
export const removeWatch = (id) => update((db) => { db.watch = db.watch.filter((w) => w.id !== id && w.listing.id !== id); });
export const setWatchTotal = (id, total, listing) =>
  update((db) => { const w = db.watch.find((x) => x.id === id); if (w) { w.savedTotal = total; w.listing = { ...w.listing, ...listing }; } });

export async function listNotifications() { return (await load()).notifications; }
export const addNotification = (n) =>
  update((db) => { const x = { id: randomUUID(), ts: Date.now(), read: false, ...n }; db.notifications.unshift(x); db.notifications = db.notifications.slice(0, 100); return x; });
export const markAllRead = () => update((db) => { db.notifications.forEach((n) => { n.read = true; }); });
