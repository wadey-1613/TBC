'use strict';
const $app = document.getElementById('app');
const DEFAULT_QUERY = 'girls bike purple £120 max';
const CATS = [
  { n: 'Electronics', e: '💻', sub: 'Phones, TVs, Laptops & more', pop: ['iPhone 15', 'Laptop', 'Headphones', '55 inch TV'] },
  { n: 'Gaming', e: '🎮', sub: 'Consoles, Games, Accessories', pop: ['PS5', 'Nintendo Switch', 'Xbox controller', 'Gaming PC'] },
  { n: 'Home & Living', e: '🏠', sub: 'Furniture, Appliances, Decor', pop: ['Air fryer', 'Dyson vacuum', 'Sofa', 'Coffee machine'] },
  { n: 'Fashion', e: '👗', sub: 'Clothing, Shoes, Accessories', pop: ['Nike trainers', 'Winter coat', 'Handbag'] },
  { n: 'Health & Beauty', e: '💖', sub: 'Skincare, Haircare, Wellness', pop: ['Hair dryer', 'Electric toothbrush', 'Perfume'] },
  { n: 'Sports & Outdoors', e: '🚴', sub: 'Fitness, Sports, Outdoor Gear', pop: ['girls bike purple £120 max', 'Tent', 'Football boots', 'Treadmill'] },
  { n: 'Toys & Games', e: '🧸', sub: 'Toys, Board Games, Kids', pop: ['Lego', 'Scooter', 'Board game', 'Trampoline'] },
  { n: 'Deals by Store', e: '🏬', sub: 'Amazon, Argos, eBay & more', pop: ['Argos', 'Halfords', 'Currys', 'eBay'] },
];
const POPULAR = ['PS5', 'iPhone 15', 'Air fryer', 'Nike trainers', 'TV deals', 'Gaming PC', DEFAULT_QUERY];

const store = {
  get: (k, d) => { try { const v = localStorage.getItem('df.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem('df.' + k, JSON.stringify(v)); } catch {} },
};
const S = { results: [], query: null, bySource: {}, demo: false, errors: [], loading: false, text: '', watch: [], notes: [], alerts: [], sources: [],
  filters: { price: 'any', free: false, top: false, cond: 'any' }, showFilters: false, catPop: null, modalShown: false, series: null };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : null);
const api = async (path, method = 'GET', body) => {
  const r = await fetch('/api/' + path, { method, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Request failed');
  return j;
};
const go = (h) => { location.hash = h; };
const toast = (m) => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.append(t); setTimeout(() => t.remove(), 2200); };
const tagSvg = `<svg class="tagic big" viewBox="0 0 64 64"><path d="M32 4 12 10v22c0 12 9 22 20 28 11-6 20-16 20-28V10z" fill="none"/><path d="M8 30 30 8h22v22L30 52z" fill="#18c04f" stroke="#7dffa8" stroke-width="2"/><circle cx="43" cy="17" r="4" fill="#090c0a"/><text x="28" y="38" font-size="20" font-weight="800" fill="#fff" transform="rotate(-45 28 33)" text-anchor="middle">%</text></svg>`;
const logo = `<div class="logo">${tagSvg.replace('tagic big', 'tagic')}<span>Deal<b>Finder</b></span></div>`;

// ---------- data ----------
async function refresh() {
  try {
    [S.watch, S.notes, S.alerts, S.sources] = await Promise.all([api('watch'), api('notifications'), api('alerts'), api('sources')]);
  } catch { /* offline: render with what we have */ }
}
async function doSearch(text, overrides = {}) {
  S.text = text; S.loading = true; S.catPop = null; render();
  try {
    const d = await api('search', 'POST', { text, condition: S.filters.cond, ...overrides });
    Object.assign(S, { results: d.results, query: d.query, bySource: d.bySource, demo: d.demo, errors: d.errors });
    store.set('last', text);
    store.set('found', store.get('found', 0) + d.results.length);
    store.set('cache', { results: d.results.slice(0, 20), query: d.query, bySource: d.bySource, demo: d.demo, text });
  } catch (e) { S.results = []; S.errors = [e.message]; }
  S.loading = false; render();
}
function visible() {
  const f = S.filters;
  return S.results.filter((r) => (f.price === 'any' || (f.price === '0-50' ? r.total <= 50 : f.price === '50-100' ? r.total > 50 && r.total <= 100 : r.total > 100))
    && (!f.free || !r.shipping) && (!f.top || (r.sellerRating ?? 0) >= 95));
}
const findDeal = (id) => S.results.find((r) => r.id === id) || S.watch.map((w) => w.listing).find((l) => l.id === id);
const watched = (id) => S.watch.find((w) => w.listing.id === id);

// ---------- views ----------
const tabs = (cur) => `<nav class="tabs">${[['home', '🏠', 'Home'], ['watch', '♡', 'Watchlist'], ['alerts', '🔔', 'Alerts'], ['cats', '▦', 'Categories'], ['profile', '👤', 'Profile']]
  .map(([k, i, l]) => `<button data-go="#/${k}" class="${cur === k ? 'on' : ''}"><span class="i">${i}</span>${l}${k === 'alerts' && S.notes.some((n) => !n.read) ? '<span class="badge" style="top:-2px;right:30%">•</span>' : ''}</button>`).join('')}</nav>`;

const thumb = (d, cls = 'thumb') => (safeUrl(d.image) ? `<div class="${cls}" style="background-image:url('${esc(encodeURI(d.image))}')"></div>` : `<div class="${cls} ph">🛍️</div>`);
const dealRow = (d, extra = '') => `<div class="deal" data-go="#/deal/${encodeURIComponent(d.id)}">${thumb(d)}
  <div><div class="t">${esc(d.title)}</div><div class="mute sm">${esc(d.source)} · ${d.condition}${d.shipping ? ` · +£${d.shipping} postage` : ' · free postage'}</div>
  <div>${(d.reasons || []).slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div></div>
  <div style="text-align:right"><div class="price">£${d.total}</div>${d.saving >= 5 ? `<span class="pill">-${d.saving}%</span>` : d.score != null ? `<span class="pill score">${d.score}</span>` : ''}</div>${extra}</div>`;

function splash() {
  return `<div class="screen full"><div class="hero">${tagSvg.replace('tagic big', 'big')}<h1>Deal<b>Finder</b></h1><p><b>Find. Compare. Save.</b></p>
  <p class="mute">The ultimate deal finder app for everything you need.</p></div>
  <div class="stack"><button class="btn" data-go="#/onboard/0">Get Started</button><button class="link" data-act="skipIntro">Continue as Guest</button></div></div>`;
}
const ONBOARD = [
  ['🛒', 'Find the Best Deals', 'We search shops, marketplaces and second-hand sites to bring you the lowest prices.'],
  ['🔔', 'Get Instant Alerts', 'Be notified when prices drop on the items you love.'],
  ['🐷', 'Save More, Spend Less', 'Track, compare and save on anything.'],
];
function onboard(i) {
  const [e, h, p] = ONBOARD[i];
  return `<div class="screen full"><div class="hero"><div class="emoji-big">${e}</div><h1 style="font-size:1.6rem">${h}</h1><p class="mute">${p}</p></div>
  <div class="dots">${ONBOARD.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
  <div class="stack"><button class="btn" data-go="${i === 2 ? '#/home' : '#/onboard/' + (i + 1)}" data-act="${i === 2 ? 'skipIntro' : ''}">${i === 2 ? 'Get Started' : 'Next'}</button>
  ${i < 2 ? '<button class="link" data-act="skipIntro">Skip</button>' : ''}</div></div>`;
}
function home() {
  const unread = S.notes.filter((n) => !n.read).length;
  const top = S.results.length ? S.results.slice(0, 5) : [];
  return `<div class="screen"><div class="top">${logo}<button class="ic" data-go="#/alerts">🔔${unread ? `<span class="badge">${unread}</span>` : ''}</button></div>
  <div class="search" data-go="#/search"><span>🔍</span><input placeholder="Search for anything…" readonly></div>
  <div class="grid4">${CATS.slice(0, 7).map((c) => `<button class="cat" data-cat="${esc(c.n)}"><span>${c.e}</span>${esc(c.n.replace(' & ', ' &\n'))}</button>`).join('')}<button class="cat" data-go="#/cats"><span>⋯</span>More</button></div>
  <div class="banner" data-act="trySearch" data-q="${esc(store.get('last', DEFAULT_QUERY))}"><div class="e">🚀</div><div><b>Big Savings This Week!</b><span class="mute sm">Tap to re-run your last search</span></div></div>
  <div class="sec"><h2>Top Deals For You</h2><a data-go="#/search">See all ›</a></div>
  ${S.loading ? '<div class="spin">Searching…</div>' : top.length ? top.map((d) => dealRow(d)).join('') : '<div class="empty">Search for something to see ranked deals here.</div>'}
  </div>${tabs('home')}`;
}
function searchView() {
  const f = S.filters, list = visible();
  const pop = S.catPop ?? POPULAR;
  const chip = (k, v, l) => `<button class="chip ${f[k] === v ? 'on' : ''}" data-filter="${k}" data-v="${v}">${l}</button>`;
  const q = S.query;
  return `<div class="screen"><div class="top"><button class="ic" data-go="#/home">‹</button><h2>Search & Filters</h2><button class="ic" data-act="toggleFilters">⚙️</button></div>
  <form class="search" id="sf"><span>🔍</span><input id="q" value="${esc(S.text)}" placeholder="e.g. girls bike purple £120 max" autocomplete="off" ${S.text ? '' : 'autofocus'}><button class="ic" style="color:var(--g)">➜</button></form>
  ${!S.results.length && !S.loading ? `<h3 class="sm">${S.catPop ? 'Popular in this category' : 'Popular Searches'}</h3><div class="chips" style="margin-top:8px">${pop.map((p) => `<button class="chip" data-act="trySearch" data-q="${esc(p)}">${esc(p)}</button>`).join('')}</div>` : ''}
  ${S.showFilters ? `<div class="list" style="padding:6px 14px;margin:8px 0"><div class="frow"><b>Condition</b><div class="chips">${chip('cond', 'any', 'Any')}${chip('cond', 'new', 'New')}${chip('cond', 'used', 'Used')}</div></div>
    <div class="frow"><b>Price</b><div class="chips">${chip('price', 'any', 'Any')}${chip('price', '0-50', '£0-50')}${chip('price', '50-100', '£50-100')}${chip('price', '100+', '£100+')}</div></div>
    <div class="frow"><span>Free postage only</span><button class="switch ${f.free ? 'on' : ''}" data-filter="free" data-v="${!f.free}"></button></div>
    <div class="frow"><span>Top-rated sellers</span><button class="switch ${f.top ? 'on' : ''}" data-filter="top" data-v="${!f.top}"></button></div></div>` : ''}
  ${S.loading ? '<div class="spin">Searching every source…</div>' : S.query ? `<div class="sec"><span class="mute sm">${list.length} deals · “${esc(q.keywords)}${q.colour ? ' · ' + esc(q.colour) : ''}${q.maxPrice ? ' · ≤£' + q.maxPrice : ''}”</span><a data-act="saveAlert">🔔 Alert me</a></div>
  <div class="mute sm">${S.demo ? '<b style="color:var(--warn)">Demo data</b> — add API keys for live results. ' : ''}${Object.entries(S.bySource).map(([k, v]) => `${esc(k)} (${v})`).join(' · ')}${S.errors.length ? '<br>⚠ ' + esc(S.errors.join('; ')) : ''}</div>
  ${list.map((d) => dealRow(d)).join('') || '<div class="empty">Nothing matches those filters.</div>'}` : ''}</div>${tabs('')}`;
}
function details(id) {
  const d = findDeal(id);
  if (!d) return `<div class="screen"><div class="top"><button class="ic" data-go="#/home">‹</button></div><div class="empty">That deal is no longer in your results.</div></div>${tabs('')}`;
  const w = watched(d.id), url = safeUrl(d.url);
  const s = S.series;
  const was = s && s.length ? Math.max(...s.map((p) => p.min)) : 0;
  return `<div class="screen"><div class="top"><button class="ic" data-go="#/search">‹</button><span></span><button class="ic" data-act="toggleWatch" data-id="${esc(d.id)}">${w ? '❤️' : '♡'}</button></div>
  ${safeUrl(d.image) ? `<div class="hdr-img" style="background-image:url('${esc(encodeURI(d.image))}')">` : '<div class="hdr-img ph">🛍️'}${d.saving >= 5 ? `<span class="pill">-${d.saving}%</span>` : ''}</div>
  <h2>${esc(d.title)}</h2>
  <div style="margin:6px 0"><span class="price" style="font-size:1.6rem">£${d.total}</span>${was > d.total ? `<span class="was">£${was}</span>` : ''}</div>
  <div class="sm" style="color:var(--g)">✔ ${esc(d.source)} · ${d.condition}${d.shipping ? ` · £${d.shipping} postage included` : ' · Free postage'}</div>
  ${url ? `<a class="btn" style="margin:14px 0" href="${esc(url)}" target="_blank" rel="noopener">Go to Store</a>` : '<div class="btn ghost" style="margin:14px 0;opacity:.6">Demo listing — no store link</div>'}
  ${d.reasons?.length ? `<h3>Why it ranks well</h3><div style="margin:6px 0 14px">${d.reasons.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
  <h3 style="margin-bottom:8px">Price History</h3>${chart(s)}</div>${tabs('')}`;
}
function chart(s) {
  if (!s) return '<div class="chart empty sm">Loading…</div>';
  if (s.length < 2) return '<div class="chart empty sm" style="padding:36px 10px">Tracking starts today — check back tomorrow for a price trend.</div>';
  const v = s.map((p) => p.min), lo = Math.min(...v), hi = Math.max(...v), W = 300, H = 100;
  const pts = v.map((y, i) => `${(i / (v.length - 1)) * (W - 20) + 10},${H - 14 - ((y - lo) / (hi - lo || 1)) * (H - 28)}`);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline points="${pts.join(' ')}" fill="none" stroke="#2ee566" stroke-width="2.5"/><circle cx="${pts.at(-1).split(',')[0]}" cy="${pts.at(-1).split(',')[1]}" r="4" fill="#2ee566"/></svg>`;
}
function watchView() {
  return `<div class="screen"><div class="top"><span></span><h2>My Watchlist</h2><span></span></div><div class="mute sm" style="text-align:center">${S.watch.length} item${S.watch.length === 1 ? '' : 's'}</div>
  ${S.watch.map((w) => { const l = w.listing; const drop = w.listing.total < w.savedTotal; return dealRow(l, `<button class="rm" data-act="unwatch" data-id="${esc(w.id)}">✕</button>`); }).join('') || '<div class="empty">Tap ♡ on a deal to watch it. We’ll tell you when the price drops.</div>'}</div>${tabs('watch')}`;
}
function alertsView() {
  return `<div class="screen"><div class="top"><span></span><h2>Alerts</h2><span></span></div>
  <h3 class="sec">Price drops</h3>${S.notes.length ? S.notes.map((n) => `<div class="deal" style="grid-template-columns:1fr auto" data-go="#/deal/${encodeURIComponent(n.listingId)}"><div><div class="t">${esc(n.text)}</div><div class="mute sm">${new Date(n.ts).toLocaleString()}</div></div><span class="pill">-£${(n.from - n.to).toFixed(2)}</span></div>`).join('') : '<div class="empty">No price drops yet. Watch a deal and we’ll check every 30 minutes.</div>'}
  <h3 class="sec">Saved searches</h3>${S.alerts.length ? S.alerts.map((a) => `<div class="deal" style="grid-template-columns:1fr auto"><div><div class="t">${esc(a.query.keywords)}${a.query.colour ? ' · ' + esc(a.query.colour) : ''}</div><div class="mute sm">${a.query.maxPrice ? 'up to £' + a.query.maxPrice : 'any price'} · ${a.seen.length} found so far</div></div><button class="ic" data-act="delAlert" data-id="${esc(a.id)}">🗑</button></div>`).join('') : '<div class="empty">Run a search and tap “Alert me”.</div>'}</div>${tabs('alerts')}`;
}
function catsView() {
  return `<div class="screen"><div class="top"><button class="ic" data-go="#/home">‹</button><h2>Categories</h2><button class="ic" data-go="#/search">🔍</button></div>
  <div class="stack">${CATS.map((c) => `<button class="item list" data-cat="${esc(c.n)}"><span class="ico">${c.e}</span><span class="grow"><b>${esc(c.n)}</b><br><span class="mute sm">${esc(c.sub)}</span></span><span class="chev">›</span></button>`).join('')}</div></div>${tabs('cats')}`;
}
function profileView() {
  const name = store.get('name', 'Guest');
  const ini = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const row = (i, l, go) => `<button class="item" data-go="${go}"><span class="ico">${i}</span><span class="grow">${l}</span><span class="chev">›</span></button>`;
  return `<div class="screen"><div class="top"><span></span><h2>Profile</h2><button class="ic" data-go="#/settings">⚙️</button></div>
  <div style="display:flex;gap:14px;align-items:center;margin:10px 0"><div class="avatar">${esc(ini)}</div><div><h2>${esc(name)}</h2><button class="chip sm" data-act="editName">Edit Profile</button></div></div>
  <div class="stats"><div><b>${store.get('found', 0)}</b><span class="mute sm">Deals Found</span></div><div><b>${S.watch.length}</b><span class="mute sm">Saved</span></div><div><b>${S.alerts.length}</b><span class="mute sm">Alerts</span></div></div>
  <div class="list">${row('♡', 'My Watchlist', '#/watch')}${row('🔔', 'Alerts', '#/alerts')}${row('⚙️', 'Settings', '#/settings')}</div></div>${tabs('profile')}`;
}
function settingsView() {
  const notif = store.get('notif', true);
  return `<div class="screen"><div class="top"><button class="ic" data-go="#/profile">‹</button><h2>Settings</h2><span></span></div>
  <div class="list"><button class="item" data-act="editName"><span class="ico">👤</span><span class="grow">Account & Profile</span><span class="chev">›</span></button>
  <div class="item"><span class="ico">🔔</span><span class="grow">Price drop notifications</span><button class="switch ${notif ? 'on' : ''}" data-act="toggleNotif"></button></div>
  <div class="item"><span class="ico">🌙</span><span class="grow">App Appearance</span><span class="mute sm">Dark Mode</span></div></div>
  <h3 class="sec">Search sources</h3><div class="list">${S.sources.map((s) => `<div class="item"><span class="grow">${esc(s.name)}</span><span class="pill ${s.enabled ? '' : 'score'}" ${s.enabled ? '' : 'style="color:var(--mute)"'}>${s.enabled ? 'On' : 'Add API key'}</span></div>`).join('')}</div>
  <p class="mute sm" style="margin-top:14px">DealFinder v0.2 · prices include postage where the seller lists it.</p>
  <button class="btn ghost" style="margin-top:12px;color:var(--red);border-color:#4a2a2d" data-act="clearLocal">Clear local data</button></div>${tabs('profile')}`;
}
function dropModal() {
  const n = S.notes.find((x) => !x.read && x.type === 'drop');
  if (!n || S.modalShown) return '';
  return `<div class="modal"><div class="box"><div style="font-size:64px">🔔</div><h2 style="font-size:1.4rem;color:var(--g)">Price Drop Alert!</h2><p class="mute">${esc(n.text)}</p>
  <button class="btn" data-act="viewDrop" data-id="${esc(n.listingId)}">View Deal</button><button class="btn ghost" data-act="closeDrop" data-go="#/alerts">Manage Alerts</button><button class="link" data-act="closeDrop">Dismiss</button></div></div>`;
}

// ---------- router ----------
function render() {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const route = parts[0], arg = decodeURIComponent(parts.slice(1).join('/'));
  const r = route || (store.get('seen', false) ? 'home' : 'splash');
  const views = { splash, onboard: () => onboard(Number(arg) || 0), home, search: searchView, deal: () => details(arg), watch: watchView, alerts: alertsView, cats: catsView, profile: profileView, settings: settingsView };
  $app.innerHTML = (views[r] || home)() + (r === 'home' ? dropModal() : '');
  window.scrollTo(0, 0);
  if (r === 'search' && S.text === '' && !S.results.length) document.getElementById('q')?.focus();
}
let lastRoute = '';
addEventListener('hashchange', async () => {
  const h = location.hash;
  if (h.startsWith('#/deal/')) { S.series = null; render(); loadSeries(decodeURIComponent(h.slice(7))); } else { render(); }
  if (/^#\/(home|watch|alerts|profile|settings)/.test(h) && h !== lastRoute) { lastRoute = h; await refresh(); render(); }
});
async function loadSeries(id) {
  const d = findDeal(id);
  const query = watched(id)?.query || S.query;
  if (!d || !query) return;
  try { S.series = await api('series', 'POST', { query, id }); } catch { S.series = []; }
  if (location.hash.startsWith('#/deal/')) render();
}

// ---------- events ----------
$app.addEventListener('submit', (e) => {
  if (e.target.id === 'sf') { e.preventDefault(); const v = document.getElementById('q').value.trim(); if (v) doSearch(v); }
});
$app.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act],[data-go],[data-cat],[data-filter]');
  if (!el) return;
  const { act, go: to, cat, filter, v, q, id } = el.dataset;
  if (filter) {
    S.filters[filter] = v === 'true' ? true : v === 'false' ? false : v;
    if (filter === 'cond' && S.text) return doSearch(S.text);
    return render();
  }
  if (cat) { S.catPop = CATS.find((c) => c.n === cat)?.pop; S.results = []; S.query = null; S.text = ''; return go('#/search'); }
  if (act === 'skipIntro') { store.set('seen', true); if (!to) go('#/home'); }
  if (act === 'trySearch') { go('#/search'); return doSearch(q); }
  if (act === 'toggleFilters') { S.showFilters = !S.showFilters; return render(); }
  if (act === 'saveAlert') { await api('alerts', 'POST', { query: S.query }); await refresh(); toast('Alert saved — checked every 30 min'); return; }
  if (act === 'delAlert') { await api('alerts/' + id, 'DELETE'); await refresh(); return render(); }
  if (act === 'toggleWatch') {
    const d = findDeal(id);
    if (watched(id)) { await api('watch/' + encodeURIComponent(id), 'DELETE'); toast('Removed from watchlist'); }
    else { await api('watch', 'POST', { listing: d, query: S.query }); toast('Added — we’ll alert you on price drops'); }
    await refresh(); return render();
  }
  if (act === 'unwatch') { e.stopPropagation(); await api('watch/' + encodeURIComponent(id), 'DELETE'); await refresh(); return render(); }
  if (act === 'editName') { const n = prompt('Your name', store.get('name', '')); if (n != null) store.set('name', n.trim() || 'Guest'); return render(); }
  if (act === 'toggleNotif') { store.set('notif', !store.get('notif', true)); return render(); }
  if (act === 'clearLocal') { localStorage.clear(); S.results = []; S.query = null; toast('Local data cleared'); return go('#/splash'); }
  if (act === 'closeDrop' || act === 'viewDrop') {
    S.modalShown = true; await api('notifications/read', 'POST'); await refresh();
    if (act === 'viewDrop') return go('#/deal/' + encodeURIComponent(id));
  }
  if (to) go(to);
});

(async () => {
  const c = store.get('cache');
  if (c) Object.assign(S, c);
  await refresh();
  if (!location.hash && store.get('seen', false)) go('#/home'); else render();

})();
