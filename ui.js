(function () {
  'use strict';
  const E = window.TBC;
  const { CARDS, SYM, SUIT_ROLE, CLS_SYM, ROWS, COLS, HAND_MAX, newGame, legalActions, applyAction, sameRef, locEq, isKing, AI } = E;
  const ME = 0;
  const $ = (id) => document.getElementById(id);
  let state = null, pending = null, legal = [], aiRunning = false;
  let prevUnits = new Map(), changes = new Map(), deaths = new Map(), reachSet = new Set();

  // ------------------------------------------------------------ selection logic
  // pending = partial action: { hand?, deploy?, from?, cell?, target? }. Legal actions are filtered by it.
  function fieldsMatch(a, pd) {
    return (pd.deploy === undefined || (a.t === 'deploy' && a.pick === pd.deploy)) &&
      (pd.hand === undefined || (a.t === 'play' && a.hand === pd.hand)) &&
      (pd.from === undefined || locEq(a.from, pd.from)) &&
      (pd.cell === undefined || locEq(a.cell, pd.cell)) &&
      (pd.target === undefined || sameRef(a.target, pd.target));
  }
  const remaining = () => legal.filter((a) => a.t !== 'end' && a.t !== 'hold' && a.t !== 'recycle' && (!pending || fieldsMatch(a, pending)));
  const complete = (a, pd) => (a.cell === undefined || pd.cell !== undefined) && (a.target === undefined || pd.target !== undefined);
  const myTurn = () => state.active === ME && !aiRunning && state.winner == null;

  function run(a) {
    pending = null;
    applyAction(state, a);
    afterAction();
  }

  function tryExecute() {
    const rem = remaining();
    if (pending && rem.length === 1 && complete(rem[0], pending)) run(rem[0]);
    else render();
  }

  function onHand(i) {
    if (!myTurn()) return;
    if (!legal.some((a) => a.t === 'play' && a.hand === i)) { pending = null; return render(); }
    pending = pending && pending.hand === i ? null : { hand: i };
    tryExecute(); // boosts with no choices fire immediately
  }

  function onInfantry(pick) {
    if (!myTurn()) return;
    if (!legal.some((a) => a.t === 'deploy' && a.pick === pick)) { pending = null; return render(); }
    pending = pending && pending.deploy === pick ? null : { deploy: pick };
    render();
  }

  function onTile(ref) {
    if (!myTurn()) return;
    if (pending) {
      const rem = remaining();
      if (pending.cell === undefined && rem.some((a) => locEq(a.cell, ref))) { pending.cell = ref; return tryExecute(); }
      if (pending.target === undefined && rem.some((a) => a.target && sameRef(a.target, ref))) { pending.target = ref; return tryExecute(); }
    }
    if (legal.some((a) => a.from && locEq(a.from, ref))) {
      pending = pending && pending.from && locEq(pending.from, ref) ? null : { from: ref };
    } else pending = null;
    render();
  }

  // ------------------------------------------------------------ flow
  function afterAction() {
    render();
    if (state.winner != null) return showEnd();
    if (state.active !== ME) aiLoop();
  }

  function aiLoop() {
    aiRunning = true;
    const step = () => {
      if (state.winner != null || state.active === ME) { aiRunning = false; return render(); }
      applyAction(state, AI.chooseAction(state));
      render();
      if (state.winner != null) { aiRunning = false; return showEnd(); }
      setTimeout(step, 650);
    };
    setTimeout(step, 500);
  }

  function showEnd() {
    const w = state.winner;
    $('overlayBox').innerHTML = `<h1>${w === ME ? 'Victory!' : w === 2 ? 'Draw' : 'Defeat'}</h1><p>${state.reason} (turn ${state.turn})</p><button id="again">Play again</button>`;
    $('overlay').classList.add('show');
    $('again').onclick = start;
  }

  function showMenu() {
    $('overlayBox').innerHTML = `<h1>King's Table</h1>
      <p>March up the table and take the enemy castle.<br>Each turn: pick from 3 infantry and 2 squad cards, then move and fight.</p><button id="go">Start game</button>`;
    $('overlay').classList.add('show');
    $('go').onclick = start;
  }

  function start() {
    state = newGame((Math.random() * 2 ** 31) | 0);
    pending = null; aiRunning = false; prevUnits = new Map();
    $('overlay').classList.remove('show');
    render();
  }

  // ------------------------------------------------------------ rendering
  const red = (suit) => suit === 'H' || suit === 'D';
  const REACH = { melee: 'melee · 8 around', range: 'range · 2nd & 3rd row ahead', defence: 'defence · front arc' };
  const kwText = (c) => (c.kind === 'spell' ? c.kw : [REACH[c.reach]].concat(c.kw)).join(' · ');

  // attack / armour / health pills. `now` is the live unit (or null for a card in hand)
  function statsHtml(id, now) {
    const c = CARDS[id];
    const atk = now ? now.atk : c.atk, arm = now ? now.armor : c.armor, hp = now ? now.hp : c.hp, max = now ? now.maxHp : c.hp;
    return `<div class="stats"><span class="pill a${atk > c.atk ? ' buffed' : ''}${atk === 0 ? ' zero' : ''}" title="Attack">⚔${atk}</span>`
      + `<span class="pill ar${arm > c.armor ? ' buffed' : ''}${arm === 0 ? ' zero' : ''}" title="Armour: cuts every hit">🛡${arm}</span>`
      + `<span class="pill h${hp < max ? ' hurt' : ''}" title="Health">♥${hp}${now ? '/' + max : ''}</span></div>`;
  }

  function barHtml(p) {
    const pl = state.players[p], k = E.kingOf(state, p);
    return `<b>${p === ME ? 'You' : 'Opponent'}</b><span>Castle <b>♥${k.hp}/${k.maxHp}</b>${k.armor ? ' 🛡' + k.armor : ''}</span><span>Moves <b>${pl.moves}</b></span><span>Squad deck <b>${pl.deck.length}</b></span><span>Infantry <b>${pl.infDeck.length}</b></span><span class="grow"></span>${state.active === p ? '<span class="active-badge">● Active</span>' : ''}`;
  }

  function tileHtml(r, c, rem) {
    const u = state.board[r][c], ref = { r, c };
    const isDest = pending !== null && pending.cell === undefined && rem.some((a) => locEq(a.cell, ref));
    const home = r === 0 ? ' home0' : r === ROWS - 1 ? ' home1' : '';
    const ko = deaths.has(r * COLS + c);
    const attrs = `class="cell${home}${isDest ? ' dest' : ''}${reachSet.has(r * COLS + c) ? ' reach' : ''}${ko ? ' ko' : ''}" data-r="${r}" data-c="${c}"`;
    const ghost = ko && !u ? '<div class="float dead">✖</div>' : '';
    if (!u) return `<div ${attrs}>${ghost}</div>`;
    const k = CARDS[u.id], delta = changes.get(u.uid) || 0;
    const isTarget = pending !== null && pending.target === undefined && rem.some((a) => a.target && sameRef(a.target, ref));
    const ready = u.p === ME && !pending && myTurn() && legal.some((a) => a.from && locEq(a.from, ref));
    const sel = pending && pending.from && locEq(pending.from, ref);
    const cls = ['unit', 'p' + u.p, k.inf ? 'I' : (k.suit || ''), isKing(u) ? 'king' : '', ready ? 'ready' : '', isTarget ? 'target' : '', sel ? 'selected' : '', u.attacked && !isKing(u) ? 'spent' : '', u.fresh ? 'fresh' : '', delta < 0 ? 'hit' : delta > 0 ? 'healed' : ''].join(' ');
    const rk = isKing(u) ? '♔' : k.inf ? CLS_SYM[k.cls] : `${k.rank}${SYM[k.suit]}`;
    const title = `${k.name}${k.inf ? ' — ' + k.cls + ' infantry' : k.suit ? ' — ' + SUIT_ROLE[k.suit] : ''} [${isKing(u) ? 'castle' : REACH[k.reach]}${k.kw.length ? ', ' + k.kw.join(', ') : ''}]${k.text ? ': ' + k.text : ''}`;
    const ratio = Math.max(0, u.hp / u.maxHp), barCls = ratio <= 0.34 ? 'low' : ratio <= 0.67 ? 'mid' : '';
    const stats = isKing(u)
      ? `<div class="stats"><span class="pill h${u.hp < u.maxHp ? ' hurt' : ''}">♥${u.hp}/${u.maxHp}</span><span class="pill ar${u.armor ? '' : ' zero'}">🛡${u.armor}</span></div>`
      : statsHtml(u.id, u);
    const num = delta ? `<div class="float ${delta < 0 ? 'dmg' : 'heal'}">${delta > 0 ? '+' : ''}${delta}</div>` : '';
    return `<div ${attrs}><div class="${cls}" title="${title}"><span class="rk">${rk}</span>${u.fresh ? '<span class="new">new</span>' : ''}<div class="nm">${k.name}</div>`
      + `<div class="hpbar"><i class="${barCls}" style="width:${Math.round(ratio * 100)}%"></i></div>${stats}</div>${num}</div>`;
  }

  // compare with the previous render so hits, heals and kills can be flashed
  function trackChanges() {
    changes = new Map(); deaths = new Map();
    const cur = new Map();
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const u = state.board[r][c]; if (u) cur.set(u.uid, { hp: u.hp, r, c, king: isKing(u) }); }
    prevUnits.forEach((old, uid) => {
      const now = cur.get(uid);
      if (now) { if (now.hp !== old.hp) changes.set(uid, now.hp - old.hp); }
      else if (!old.king) deaths.set(old.r * COLS + old.c, true);
    });
    prevUnits = cur;
  }

  function boardHtml() {
    const rem = pending ? remaining() : [];
    reachSet = new Set();
    if (pending && pending.from) E.reachTiles(state, pending.from.r, pending.from.c).forEach((t) => reachSet.add(t.r * COLS + t.c));
    let html = '';
    for (let r = ROWS - 1; r >= 0; r--) for (let c = 0; c < COLS; c++) html += tileHtml(r, c, rem);
    return html;
  }

  function cardHtml(id, opts) {
    const c = CARDS[id];
    const cls = ['card', c.inf ? 'inf' : c.suit, opts.playable ? 'playable' : 'dim', opts.selected ? 'selected' : ''].join(' ');
    const top = c.inf ? CLS_SYM[c.cls] : `${c.rank}${SYM[c.suit]}`;
    const type = c.inf ? `${c.cls} infantry` : `${c.kind === 'spell' ? 'Boost' : 'Unit'} · ${SUIT_ROLE[c.suit]}`;
    return `<div class="${cls}" ${opts.attr}><div class="top ${red(c.suit) ? 'red' : ''}">${top}</div><div class="nm">${c.name}</div>
      <div class="ty">${type}</div><div class="tags">${kwText(c)}</div><div class="tx">${c.text}</div>${c.kind === 'unit' ? statsHtml(id, null) : '<div class="stats"></div>'}</div>`;
  }

  function offersHtml() {
    const pl = state.players[ME], can = myTurn();
    let inf = pl.infOffer.map((id, i) => `<div class="cwrap">${cardHtml(id, { playable: can && legal.some((a) => a.t === 'deploy' && a.pick === i), selected: pending && pending.deploy === i, attr: `data-inf="${i}"` })}`
      + `<button class="small alt" data-recycle="${i}" ${can && legal.some((a) => a.t === 'recycle' && a.pick === i) ? '' : 'disabled'}>↺ Recycle</button></div>`).join('');
    if (!pl.infOffer.length) inf = `<div class="card empty" style="grid-column:span 3;height:60px">${pl.infDeck.length || pl.infDiscard.length ? 'Infantry offer used' : 'No infantry left'}</div>`;
    let squad = pl.squadOffer.map((id, k) => `<div class="cwrap">${cardHtml(id, { playable: can && legal.some((a) => a.t === 'play' && a.hand === -1 - k), selected: pending && pending.hand === -1 - k, attr: `data-hand="${-1 - k}"` })}`
      + `<button class="small alt" data-hold="${k}" ${can && legal.some((a) => a.t === 'hold' && a.pick === k) ? '' : 'disabled'}>Hold in hand</button></div>`).join('');
    if (!pl.squadOffer.length) squad = '<div class="card empty" style="grid-column:span 3;height:60px">Squad offer used</div>';
    return { inf, squad };
  }

  function handHtml() {
    const pl = state.players[ME];
    let html = pl.hand.map((id, i) => cardHtml(id, { playable: myTurn() && legal.some((a) => a.t === 'play' && a.hand === i), selected: pending && pending.hand === i, attr: `data-hand="${i}"` })).join('');
    for (let i = pl.hand.length; i < HAND_MAX; i++) html += '<div class="card empty">empty</div>';
    return html;
  }

  function hint() {
    const pl = state.players[ME];
    if (state.winner != null) return state.reason;
    if (state.active !== ME) return 'Opponent is thinking…';
    if (!pending) {
      const bits = [];
      if (pl.deploys > 0 && pl.infOffer.length) bits.push('pick an infantry to deploy');
      if (pl.recycles > 0 && pl.infOffer.length) bits.push('recycle one');
      if (pl.squadOffer.length) bits.push('play or hold a squad card');
      return 'Your turn: ' + (bits.length ? bits.join(', ') + '. ' : '') + 'Select a green unit to move or attack (' + pl.moves + ' move' + (pl.moves === 1 ? '' : 's') + ' left). Unused offers are discarded when you end the turn.';
    }
    if (pending.deploy !== undefined) return 'Choose a tile on your back row.';
    if (pending.hand !== undefined) {
      const needCell = remaining().some((a) => a.cell !== undefined);
      return needCell && pending.cell === undefined ? 'Choose a tile on your back row.' : 'Choose a target.';
    }
    return 'The shaded tiles are this unit\'s reach. Click an enemy in reach (gold) to attack, or an empty tile to move (forward or sideways).';
  }

  function render() {
    legal = state.active === ME && state.winner == null ? legalActions(state) : [];
    trackChanges();
    $('board').innerHTML = boardHtml();
    $('foeBar').innerHTML = barHtml(1 - ME);
    $('myBar').innerHTML = barHtml(ME);
    const o = offersHtml();
    $('infantry').innerHTML = o.inf;
    $('squad').innerHTML = o.squad;
    $('hand').innerHTML = handHtml();
    const pl = state.players[ME];
    $('infInfo').textContent = `deck ${pl.infDeck.length} · discarded ${pl.infDiscard.length}`;
    $('squadInfo').textContent = `deck ${pl.deck.length} · discarded ${pl.squadDiscard.length}`;
    $('hint').textContent = hint();
    $('endBtn').disabled = !myTurn();
    const logEl = $('log');
    logEl.innerHTML = state.log.map((l) => `<div>${l}</div>`).join('');
    logEl.scrollTop = logEl.scrollHeight;
  }

  // ------------------------------------------------------------ events
  document.addEventListener('click', (e) => {
    const rec = e.target.closest('[data-recycle]');
    if (rec) { if (myTurn() && !rec.disabled) run({ t: 'recycle', pick: +rec.dataset.recycle }); return; }
    const hold = e.target.closest('[data-hold]');
    if (hold) { if (myTurn() && !hold.disabled) run({ t: 'hold', pick: +hold.dataset.hold }); return; }
    const hand = e.target.closest('[data-hand]');
    if (hand) return onHand(+hand.dataset.hand);
    const inf = e.target.closest('[data-inf]');
    if (inf) return onInfantry(+inf.dataset.inf);
    const cell = e.target.closest('.cell');
    if (cell) return onTile({ r: +cell.dataset.r, c: +cell.dataset.c });
  });
  $('endBtn').onclick = () => { if (myTurn()) run({ t: 'end' }); };
  const cancel = () => { pending = null; if (state) render(); };
  document.addEventListener('contextmenu', (e) => { e.preventDefault(); cancel(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cancel(); });

  showMenu();
  window.__tbc = { get state() { return state; }, render };
})();
