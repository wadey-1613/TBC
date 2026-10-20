import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { parseQuery } from './lib/query.js';
import { runSearch, activeSources } from './lib/search.js';
import { listAlerts, addAlert, removeAlert, priceSeries } from './lib/store.js';
import { startAlertLoop } from './lib/alerts.js';

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
  'GET /api/sources': async (req, res) => json(res, 200, activeSources().map((s) => s.name)),
};

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  try {
    const del = pathname.match(/^\/api\/alerts\/([\w-]+)$/);
    if (req.method === 'DELETE' && del) { await removeAlert(del[1]); return json(res, 200, { ok: true }); }
    const route = routes[`${req.method} ${pathname}`];
    if (route) return await route(req, res);
    const html = await readFile(new URL('./public/index.html', import.meta.url));
    res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(html);
  } catch (e) {
    console.error(e);
    json(res, 500, { error: 'Something went wrong' });
  }
}).listen(PORT, () => {
  console.log(`Deal finder on http://localhost:${PORT} (sources: ${activeSources().map((s) => s.name).join(', ')})`);
  startAlertLoop();
});
