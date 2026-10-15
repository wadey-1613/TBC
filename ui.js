(function () {
  'use strict';
  const E = window.TBC;
  const { CARDS, SYM, SUIT_ROLE, CLS_SYM, ROWS, COLS, HAND_MAX, newGame, legalActions, applyAction, sameRef, locEq, isKing, AI } = E;
  const ME = 0;
  const $ = (id) => document.getElementById(id);
  let state = null, pending = null, legal = [], aiRunning = false;

  // ------------------------------------------------------------ selection logic
  // pending = partial action: { hand?, deploy?, from?, cell?, target? }. Legal actions are filtered by it.
  function fieldsMatch(a, pd) {
    return (!pd.deploy || a.t === 'deploy') &&
      (pd.hand === undefined || (a.t === 'play' && a.hand === pd.hand)) &&
      (pd.from === undefined || locEq(a.from, pd.from)) &&
      (pd.cell === undefined || locEq(a.cell, pd.cell)) &&
      (pd.target === undefined || sameRef(a.target, pd.target));
  }
  const remaining = () => legal.filter((a) => a.t !== 'end' && a.t !== 'hold' && (!pending || fieldsMatch(a, pending)));
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

  function onInfantry() {
    if (!myTurn()) return;
    if (!legal.some((a) => a.t === 'deploy')) { pending = null; return render(); }
    pending = pending && pending.deploy ? null : { deploy: true };
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
      setTimeout(step, 550);
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
      <p>March up the table and take the enemy castle.<br>Deploy infantry, flip squad cards, move one unit a turn.</p><button id="go">Start game</button>`;
    $('overlay').classList.add('show');
    $('go').onclick = start;
  }

  function start() {
    state = newGame((Math.random() * 2 ** 31) | 0);
    pending = null; aiRunning = false;
    $('overlay').classList.remove('show');
    render();
  }

  // ------------------------------------------------------------ rendering
  const red = (suit) => suit === 'H' || suit === 'D';
  const REACH = { melee: 'melee · 8 around', range: 'range · 2nd & 3rd row ahead', defence: 'defence · front arc' };
  const kwText = (c) => (c.kind === 'spell' ? c.kw : [REACH[c.reach]].concat(c.kw)).join(' · ');

  function barHtml(p) {
    const pl = state.players[p], k = E.kingOf(state, p);
    return `<b>${p === ME ? 'You' : 'Opponent'}</b><span>Castle <b>♥${k.hp}</b>${k.armor ? ' 🛡' + k.armor : ''}</span><span>Squad deck <b>${pl.deck.length}</b></span><span>Infantry <b>${pl.infDeck.length}</b></span><span class="grow"></span>${state.active === p ? '<span class="active-badge">● Active</span>' : ''}`;
  }

  let reachSet = new Set();
  function tileHtml(r, c, rem) {
    const u = state.board[r][c], ref = { r, c };
    const isDest = pending !== null && pending.cell === undefined && rem.some((a) => locEq(a.cell, ref));
    const home = r === 0 ? ' home0' : r === ROWS - 1 ? ' home1' : '';
    const attrs = `class="cell${home}${isDest ? ' dest' : ''}${reachSet.has(r * COLS + c) ? ' reach' : ''}" data-r="${r}" data-c="${c}"`;
    if (!u) return `<div ${attrs}></div>`;
    const k = CARDS[u.id];
    const isTarget = pending !== null && pending.target === undefined && rem.some((a) => a.target && sameRef(a.target, ref));
    const ready = u.p === ME && !pending && myTurn() && legal.some((a) => a.from && locEq(a.from, ref));
    const sel = pending && pending.from && locEq(pending.from, ref);
    const cls = ['unit', 'p' + u.p, k.inf ? 'I' : (k.suit || ''), isKing(u) ? 'king' : '', ready ? 'ready' : '', isTarget ? 'target' : '', sel ? 'selected' : '', u.attacked && !isKing(u) ? 'spent' : ''].join(' ');
    const rk = isKing(u) ? '♔' : k.inf ? CLS_SYM[k.cls] : `${k.rank}${SYM[k.suit]}`;
    const title = `${k.name}${k.inf ? ' — ' + k.cls + ' infantry' : k.suit ? ' — ' + SUIT_ROLE[k.suit] : ''} [${isKing(u) ? 'castle' : REACH[k.reach]}${k.kw.length ? ', ' + k.kw.join(', ') : ''}]${k.text ? ': ' + k.text : ''}`;
    const stats = isKing(u)
      ? `<span class="h ${u.hp < u.maxHp ? 'hurt' : ''}">♥${u.hp}</span>${u.armor ? `<span class="ar">🛡${u.armor}</span>` : ''}`
      : `<span class="a">⚔${u.atk}</span>${u.armor ? `<span class="ar">🛡${u.armor}</span>` : ''}<span class="h ${u.hp < u.maxHp ? 'hurt' : ''}">♥${u.hp}</span>`;
    return `<div ${attrs}><div class="${cls}" title="${title}"><span class="rk">${rk}</span><div class="nm">${k.name}</div><div class="st">${stats}</div></div></div>`;
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
    const stats = c.kind === 'unit' ? `<span class="a">⚔${c.atk}</span>${c.armor ? `<span class="ar">🛡${c.armor}</span>` : ''}<span class="h">♥${c.hp}</span>` : '';
    return `<div class="${cls}" ${opts.attr}><div class="top ${red(c.suit) ? 'red' : ''}">${top}</div><div class="nm">${c.name}</div>
      <div class="ty">${type}</div><div class="tags">${kwText(c)}</div><div class="tx">${c.text}</div><div class="st">${stats}</div></div>`;
  }

  function infantryHtml() {
    const pl = state.players[ME], top = pl.infDeck[pl.infDeck.length - 1];
    if (!top) return '<div class="card empty">No infantry left</div>';
    const can = myTurn() && legal.some((a) => a.t === 'deploy');
    return cardHtml(top, { playable: can, selected: pending && pending.deploy, attr: 'data-inf="1"' });
  }

  function revealHtml() {
    const pl = state.players[ME];
    if (!pl.revealed) return '<div class="card empty">' + (state.active === ME ? 'Used' : '—') + '</div>';
    const can = myTurn() && legal.some((a) => a.t === 'play' && a.hand === -1);
    return cardHtml(pl.revealed, { playable: can, selected: pending && pending.hand === -1, attr: 'data-hand="-1"' });
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
      if (pl.deploys > 0 && pl.infDeck.length) bits.push('deploy infantry');
      if (pl.revealed) bits.push('play or hold the squad card');
      return 'Your turn: ' + (bits.length ? bits.join(', ') + ', ' : '') + 'select a green unit to move or attack.' + (pl.revealed ? ' An unused squad card is discarded when you end the turn.' : '');
    }
    if (pending.deploy) return 'Choose a tile on your back row.';
    if (pending.hand !== undefined) {
      const needCell = remaining().some((a) => a.cell !== undefined);
      return needCell && pending.cell === undefined ? 'Choose a tile on your back row.' : 'Choose a target.';
    }
    return 'The shaded tiles are this unit\'s reach. Click an enemy in reach (gold) to attack, or an empty tile to move (forward or sideways).';
  }

  function render() {
    legal = state.active === ME && state.winner == null ? legalActions(state) : [];
    $('board').innerHTML = boardHtml();
    $('foeBar').innerHTML = barHtml(1 - ME);
    $('myBar').innerHTML = barHtml(ME);
    $('infantry').innerHTML = infantryHtml();
    $('reveal').innerHTML = revealHtml();
    $('hand').innerHTML = handHtml();
    $('holdBtn').disabled = !(myTurn() && legal.some((a) => a.t === 'hold'));
    $('hint').textContent = hint();
    $('endBtn').disabled = !myTurn();
    const logEl = $('log');
    logEl.innerHTML = state.log.map((l) => `<div>${l}</div>`).join('');
    logEl.scrollTop = logEl.scrollHeight;
  }

  // ------------------------------------------------------------ events
  document.addEventListener('click', (e) => {
    const hand = e.target.closest('[data-hand]');
    if (hand) return onHand(+hand.dataset.hand);
    if (e.target.closest('[data-inf]')) return onInfantry();
    const cell = e.target.closest('.cell');
    if (cell) return onTile({ r: +cell.dataset.r, c: +cell.dataset.c });
  });
  $('holdBtn').onclick = () => { if (myTurn()) run({ t: 'hold' }); };
  $('endBtn').onclick = () => { if (myTurn()) run({ t: 'end' }); };
  const cancel = () => { pending = null; if (state) render(); };
  document.addEventListener('contextmenu', (e) => { e.preventDefault(); cancel(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cancel(); });

  showMenu();
  window.__tbc = { get state() { return state; }, render };
})();
