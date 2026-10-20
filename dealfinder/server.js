import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { parseQuery } from './lib/query.js';
import { runSearch, activeSources, allSources } from './lib/search.js';
import { listAlerts, addAlert, removeAlert, priceSeries, listWatch, addWatch, removeWatch, listNotifications, markAllRead } from './lib/store.js';
import { startAlertLoop } from './lib/alerts.js';

const TYPES = { html: 'text/html', css: 'text/css', js: 'text/javascript', svg: 'image/svg+xml', json: 'application/json' };
const PORT = process.env.PORT ?? 3000;
const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const readBody = async (req) => { let s = ''; for await (const c of req) s += c; return s ? JSON.parse(s) : {}; };

const routes = {
  'POST /api/search': async (req, res) => {
    const b = await readBody(req);
    const query = parseQuery(b.text ?? '', { maxPrice: b.maxPrice ? Number(b.maxPrice) : undefined, colour: b.colour?.toLowerCase(), condition: b.condition });
    if (!query.keywords) return json(res, 400, { error: 'Tell me what you are looking for' });
    json(res, 200, { query, ...(await runSearch(query)), series: await priceSeries(query) });
  },
  'GET /api/alerts': async (req, res) => json(res, 200, await listAlerts()),
  'POST /api/alerts': async (req, res) => {
    const { query, email } = await readBody(req);
    json(res, 201, await addAlert(query, email));
  },
  'POST /api/series': async (req, res) => { const { query, id } = await readBody(req); json(res, 200, await priceSeries(query, id)); },
  'GET /api/watch': async (req, res) => json(res, 200, await listWatch()),
  'POST /api/watch': async (req, res) => { const { listing, query } = await readBody(req); json(res, 201, await addWatch(listing, query)); },
  'GET /api/notifications': async (req, res) => json(res, 200, await listNotifications()),
  'POST /api/notifications/read': async (req, res) => { await markAllRead(); json(res, 200, { ok: true }); },
  'GET /api/sources': async (req, res) => json(res, 200, allSources()),
};

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  try {
    const del = pathname.match(/^\/api\/alerts\/([\w-]+)$/);
    if (req.method === 'DELETE' && del) { await removeAlert(del[1]); return json(res, 200, { ok: true }); }
    const wdel = pathname.match(/^\/api\/watch\/([^/]+)$/);
    if (req.method === 'DELETE' && wdel) { await removeWatch(decodeURIComponent(wdel[1])); return json(res, 200, { ok: true }); }
    const route = routes[`${req.method} ${pathname}`];
    if (route) return await route(req, res);
    const file = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (!/^[\w.-]+$/.test(file) || !TYPES[file.split('.').pop()]) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[file.split('.').pop()] });
    res.end(await readFile(new URL(`./public/${file}`, import.meta.url)));
  } catch (e) {
    console.error(e);
    json(res, 500, { error: 'Something went wrong' });
  }
}).listen(PORT, () => {
  console.log(`Deal finder on http://localhost:${PORT} (sources: ${activeSources().map((s) => s.name).join(', ')})`);
  startAlertLoop();
});
