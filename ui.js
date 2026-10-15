(function () {
  'use strict';
  const E = window.TBC;
  const { CARDS, SYM, SUIT_ROLE, CLS_SYM, TRAPS, ROWS, COLS, HAND_MAX, newGame, legalActions, applyAction, sameRef, locEq, isKing, AI } = E;
  const ME = 0;
  const $ = (id) => document.getElementById(id);
  let state = null, pending = null, legal = [], aiRunning = false;
  let prevUnits = new Map(), changes = new Map(), deaths = new Map(), reachSet = new Set();
  // pop-up progress for the current turn
  let flagTurn = -1, infDone = false, squadDone = false, squadForce = false, infRoles = [], infSeen = -1, sqSel = null;

  // ------------------------------------------------------------ game recorder
  // Every action (yours and the AI's) is logged with the seed, so a finished game can be replayed exactly.
  // Records are saved to the page's database (when the viewer allows it) for later review.
  let rec = null, saving = false, dirty = false, dbPromise = null;
  function doAction(a) {
    if (rec) rec.actions.push(JSON.parse(JSON.stringify(a)));
    return applyAction(state, a);
  }
  const getDb = () => dbPromise || (dbPromise = (async () => {
    try { return window.claude && window.claude.use ? await window.claude.use('db') : null; } catch (e) { return null; }
  })());
  function setStatus(msg) { const el = $('recStatus'); if (el) el.textContent = msg; }
  function recordDoc() {
    return {
      rules: E.VERSION, seed: rec.seed, human: ME, startedAt: rec.startedAt, updatedAt: Date.now(),
      turns: state.turn, finished: state.winner != null, winner: state.winner == null ? -1 : state.winner,
      reason: state.reason || '', note: $('noteBox') ? $('noteBox').value : '', actionCount: rec.actions.length,
      actions: JSON.stringify(rec.actions),
    };
  }
  async function saveGame() {
    if (!rec) return;
    if (saving) { dirty = true; return; }
    saving = true;
    try {
      const db = await getDb();
      if (!db) { setStatus('Not recording: storage is not available in this view.'); return; }
      setStatus('Saving game…');
      await db.doc('games/' + rec.id).set(recordDoc());
      setStatus('Game saved at ' + new Date().toLocaleTimeString() + ' (' + rec.actions.length + ' actions)');
    } catch (e) {
      setStatus('Could not save the game (' + ((e && e.code) || 'error') + ').');
    } finally {
      saving = false;
      if (dirty) { dirty = false; saveGame(); }
    }
  }

  // ------------------------------------------------------------ selection logic
  // pending = partial action: { hand?, deploy?, from?, mode?, cell?, target? }. Legal actions are filtered by it.
  function fieldsMatch(a, pd) {
    return (pd.deploy === undefined || (a.t === 'deploy' && a.pick === pd.deploy)) &&
      (pd.hand === undefined || (a.t === 'play' && a.hand === pd.hand)) &&
      (pd.from === undefined || (locEq(a.from, pd.from) && ((pd.mode === 'trap') === (a.t === 'trap')))) &&
      (pd.cell === undefined || locEq(a.cell, pd.cell)) &&
      (pd.target === undefined || sameRef(a.target, pd.target));
  }
  const CHOICE = ['deploy', 'play', 'move', 'attack', 'trap'];
  const remaining = () => legal.filter((a) => CHOICE.includes(a.t) && (!pending || fieldsMatch(a, pending)));
  const complete = (a, pd) => (a.cell === undefined || pd.cell !== undefined) && (a.target === undefined || pd.target !== undefined);
  const myTurn = () => state.active === ME && !aiRunning && state.winner == null;

  function run(a) {
    pending = null;
    doAction(a);
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

  // The opponent's turn is replayed action by action so you can follow it. Small bookkeeping actions are quick,
  // fights and card plays linger a little. Speed can be changed, and Skip finishes the turn at once.
  const AI_PACE = { attack: 360, play: 480, trap: 340, move: 200, deploy: 260, hold: 120, holdInf: 80, recycle: 80, discardInf: 40, discardSquad: 40, end: 120 };
  const AI_SPEED = { normal: 1, fast: 0.3, instant: 0 };
  let aiSpeed = 'normal', aiSkip = false;
  try { const saved = localStorage.getItem('tbc-ai-speed'); if (saved && saved in AI_SPEED) aiSpeed = saved; } catch (e) { /* storage unavailable */ }
  const aiDelay = (a) => (aiSkip ? 0 : (AI_PACE[a.t] || 200) * AI_SPEED[aiSpeed]);

  function aiLoop() {
    aiRunning = true; aiSkip = false;
    $('skipBtn').hidden = false;
    const finish = () => { aiRunning = false; aiSkip = false; $('skipBtn').hidden = true; saveGame(); render(); };
    const step = () => {
      if (state.winner != null || state.active === ME) return finish();
      const a = AI.chooseAction(state);
      doAction(a);
      if (state.winner != null) { aiRunning = false; $('skipBtn').hidden = true; render(); return showEnd(); }
      if (state.active === ME) return finish();           // the opponent ended its turn: hand control back immediately
      render();
      setTimeout(step, aiDelay(a));
    };
    setTimeout(step, 150 * AI_SPEED[aiSpeed]);
  }

  function showEnd() {
    const w = state.winner;
    $('overlayBox').innerHTML = `<h1>${w === ME ? 'Victory!' : w === 2 ? 'Draw' : 'Defeat'}</h1><p>${state.reason} (turn ${state.turn})</p><button id="again">Play again</button>`;
    $('overlay').classList.add('show');
    $('again').onclick = start;
    saveGame();
  }

  function showMenu() {
    $('overlayBox').innerHTML = `<h1>King's Table</h1>
      <p>March up the table and take the enemy castle.<br>Each turn a pop-up offers 3 infantry and 2 squad cards. Pick, then move and fight.</p><button id="go">Start game</button>`;
    $('overlay').classList.add('show');
    $('go').onclick = start;
  }

  function start() {
    const seed = (Math.random() * 2 ** 31) | 0;
    state = newGame(seed);
    rec = { id: 'g' + Date.now().toString(36) + '-' + seed, seed, startedAt: Date.now(), actions: [] };
    setStatus('Starting the game record…'); saveGame();   // saving at the start means any permission prompt appears now, not mid-turn
    if ($('noteBox')) $('noteBox').value = '';
    pending = null; aiRunning = false; prevUnits = new Map(); flagTurn = -1; infSeen = -1; infRoles = [];
    $('overlay').classList.remove('show');
    render();
  }

  // ------------------------------------------------------------ rendering helpers
  const red = (suit) => suit === 'H' || suit === 'D';
  const REACH = { melee: 'melee · 8 around', range: 'range · 2nd & 3rd row ahead', defence: 'defence · front arc', none: 'cannot attack · moves 2' };
  const kwText = (c) => (c.kind === 'spell' ? c.kw : [REACH[c.reach]].concat(c.kw)).join(' · ');

  // attack / armour / health pills. `now` is the live unit (or null for a card)
  function statsHtml(id, now) {
    const c = CARDS[id];
    const atk = now ? now.atk : c.atk, arm = now ? now.armor : c.armor, hp = now ? now.hp : c.hp, max = now ? now.maxHp : c.hp;
    return `<div class="stats"><span class="pill a${atk > c.atk ? ' buffed' : ''}${atk === 0 ? ' zero' : ''}" title="Attack">⚔${atk}</span>`
      + `<span class="pill ar${arm > c.armor ? ' buffed' : ''}${arm === 0 ? ' zero' : ''}" title="Armour: cuts every hit">🛡${arm}</span>`
      + `<span class="pill h${hp < max ? ' hurt' : ''}" title="Health">♥${hp}${now ? '/' + max : ''}</span></div>`;
  }

  function barHtml(p) {
    const pl = state.players[p], k = E.kingOf(state, p);
    return `<b>${p === ME ? 'You' : 'Opponent'}</b><span>Castle <b>♥${k.hp}/${k.maxHp}</b>${k.armor ? ' 🛡' + k.armor : ''}</span><span>Moves <b>${pl.moves}</b></span>`
      + `<span title="Traps on the board (max ${E.MAX_TRAPS} each)">Traps <b>${state.traps.filter((t) => t.p === p).length}</b>/${E.MAX_TRAPS}</span><span>Squad deck <b>${pl.deck.length}</b>/${pl.squadDiscard.length}</span><span>Infantry <b>${pl.infDeck.length}</b>/${pl.infDiscard.length}</span>`
      + `<span class="grow"></span>${state.active === p ? '<span class="active-badge">● Active</span>' : ''}`;
  }

  function statusText(u) {
    const s = [];
    if (u.poison > 0) s.push('☠' + u.poison);
    if (u.stuck > 0 || u.immobile) s.push('🕸');
    if (u.blind > 0 || u.disarmed) s.push('✦');
    return s.join(' ');
  }

  function tileHtml(r, c, rem) {
    const u = state.board[r][c], ref = { r, c };
    const isDest = pending !== null && pending.cell === undefined && rem.some((a) => locEq(a.cell, ref));
    const home = r === 0 ? ' home0' : r === ROWS - 1 ? ' home1' : '';
    const ko = deaths.has(r * COLS + c);
    const attrs = `class="cell${home}${isDest ? ' dest' : ''}${reachSet.has(r * COLS + c) ? ' reach' : ''}${ko ? ' ko' : ''}" data-r="${r}" data-c="${c}"`;
    if (!u) {
      const t = E.trapAt(state, r, c);
      const trap = t ? `<div class="trap p${t.p}" title="${t.p === ME ? 'Your' : 'Enemy'} ${TRAPS[t.type].name}: ${TRAPS[t.type].text}">${TRAPS[t.type].sym}</div>` : '';
      return `<div ${attrs}>${trap}${ko ? '<div class="float dead">✖</div>' : ''}</div>`;
    }
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
    const tl = [u.fresh ? 'NEW' : '', statusText(u)].filter(Boolean).join(' ');
    const num = delta ? `<div class="float ${delta < 0 ? 'dmg' : 'heal'}">${delta > 0 ? '+' : ''}${delta}</div>` : '';
    return `<div ${attrs}><div class="${cls}" title="${title}"><span class="rk">${rk}</span>${tl ? `<span class="tl">${tl}</span>` : ''}<div class="nm">${k.name}</div>`
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
    if (pending && pending.from && pending.mode !== 'trap') E.reachTiles(state, pending.from.r, pending.from.c).forEach((t) => reachSet.add(t.r * COLS + t.c));
    let html = '';
    for (let r = ROWS - 1; r >= 0; r--) for (let c = 0; c < COLS; c++) html += tileHtml(r, c, rem);
    return html;
  }

  function cardHtml(id, opts) {
    const c = CARDS[id];
    const cls = ['card', opts.big ? 'big' : '', c.inf ? 'inf' : c.suit, opts.playable ? 'playable' : 'dim', opts.selected ? 'selected' : ''].join(' ');
    const top = c.inf ? CLS_SYM[c.cls] : `${c.rank}${SYM[c.suit]}`;
    const type = c.inf ? `${c.cls} infantry` : `${c.kind === 'spell' ? 'Boost' : 'Unit'} · ${SUIT_ROLE[c.suit]}`;
    const ribbon = opts.role ? `<div class="ribbon ${opts.role}">${opts.role.toUpperCase()}</div>` : '';
    return `<div class="${cls}" ${opts.attr || ''}>${ribbon}<div class="top ${red(c.suit) ? 'red' : ''}">${top}</div><div class="nm">${c.name}</div>
      <div class="ty">${type}</div><div class="tags">${kwText(c)}</div><div class="tx">${c.text}</div>${c.kind === 'unit' ? statsHtml(id, null) : '<div class="stats"></div>'}</div>`;
  }

  function handHtml() {
    const pl = state.players[ME];
    let html = pl.hand.map((id, i) => cardHtml(id, { playable: myTurn() && legal.some((a) => a.t === 'play' && a.hand === i), selected: pending && pending.hand === i, attr: `data-hand="${i}"` })).join('');
    for (let i = pl.hand.length; i < HAND_MAX; i++) html += '<div class="card empty">empty hand slot</div>';
    return html;
  }

  // ------------------------------------------------------------ pop-ups (infantry, then squad)
  const canDeploy = () => legal.some((a) => a.t === 'deploy');

  const roleCount = (role) => infRoles.filter((r) => r === role).length;
  function roleAllowed(role, i) {
    if (infRoles[i] === role) return true;                                   // toggling off is always fine
    const pl = state.players[ME];
    if (role === 'deploy') return canDeploy() && roleCount('deploy') < pl.deploys;
    if (role === 'recycle') return roleCount('recycle') < pl.recycles;
    return roleCount('hold') < HAND_MAX - pl.hand.length;                    // hold
  }

  function infantryPicker() {
    const pl = state.players[ME];
    while (infRoles.length < pl.infOffer.length) infRoles.push(null);
    const nDep = roleCount('deploy');
    let step = 'Choose what to do with each card. Anything you leave is discarded.';
    if (!canDeploy()) step = 'There is no room to deploy. You can still recycle or hold. Anything you leave is discarded.';
    else if (nDep === 0) step = 'Deploy one onto the board, recycle one to the bottom of your deck, or hold one in your hand. The rest are discarded.';
    const labels = { deploy: 'Deploy', recycle: 'Recycle', hold: 'Hold in hand' };
    const cards = pl.infOffer.map((id, i) => {
      const role = infRoles[i];
      const btns = ['deploy', 'recycle', 'hold'].map((r) => `<button class="${role === r ? '' : 'alt'}" data-irole="${r}" data-i="${i}" ${roleAllowed(r, i) ? '' : 'disabled'}>${labels[r]}</button>`).join('');
      return `<div class="pickcol">${cardHtml(id, { big: true, playable: true, selected: !!role, role: role || 'discard' })}${btns}</div>`;
    }).join('');
    $('pickerBox').innerHTML = `<h2>Choose your infantry</h2><p>${step}</p><div class="pickrow">${cards}</div>`
      + `<div class="btnrow"><button id="infRedo" class="alt" ${infRoles.some(Boolean) ? '' : 'disabled'}>Start again</button><button id="infOk">Confirm</button></div>`;
  }

  function squadPicker() {
    const pl = state.players[ME];
    const cards = pl.squadOffer.map((id, k) => {
      const canPlay = legal.some((a) => a.t === 'play' && a.hand === -1 - k), canHold = legal.some((a) => a.t === 'hold' && a.pick === k);
      const sel = sqSel === k;
      return `<div class="pickcol">${cardHtml(id, { big: true, playable: true, selected: sel, attr: `data-sq="${k}"` })}`
        + (sel ? `<button data-sqplay="${k}" ${canPlay ? '' : 'disabled'}>Play now</button><button class="alt" data-sqhold="${k}" ${canHold ? '' : 'disabled'}>${canHold ? 'Hold in hand' : 'Hand is full'}</button>` : '') + '</div>';
    }).join('');
    $('pickerBox').innerHTML = `<h2>Choose a squad card</h2><p>Play one now or hold it in your hand (max 3). The other is discarded.</p><div class="pickrow">${cards}</div>`
      + `<div class="btnrow"><button class="alt small" id="sqLater">Decide later</button><button class="alt small" id="sqDiscard">Discard both</button></div>`;
  }

  function renderPicker() {
    const pl = state.players[ME];
    let mode = null;
    if (myTurn()) {
      const infResolved = pl.infOffer.length === 0 || !canDeploy();
      if (!infDone && pl.infOffer.length > 0) mode = 'inf';
      else if (pl.squadOffer.length > 0 && !squadDone && (infResolved || squadForce) && !pending) mode = 'squad';
    }
    $('picker').classList.toggle('show', mode !== null);
    if (mode === 'inf') infantryPicker();
    else if (mode === 'squad') squadPicker();
  }

  function confirmInfantry() {
    const pl = state.players[ME];
    const moves = [];
    pl.infOffer.forEach((id, i) => {
      const role = infRoles[i];
      if (role !== 'deploy') moves.push({ i, t: role === 'recycle' ? 'recycle' : role === 'hold' ? 'holdInf' : 'discardInf' });
    });
    moves.sort((a, b) => b.i - a.i).forEach((m) => doAction({ t: m.t, pick: m.i }));
    infDone = true; infRoles = [];
    pending = pl.infOffer.length > 0 && canDeployNow() ? { deploy: 0 } : null;
    render();
  }
  const canDeployNow = () => state.players[ME].deploys > 0 && legalActions(state).some((a) => a.t === 'deploy');

  function hint() {
    const pl = state.players[ME];
    if (state.winner != null) return state.reason;
    if (state.active !== ME) return 'Opponent is playing… (use Skip, or set the opponent speed, to go faster)';
    if (!pending) {
      const bits = [];
      if (pl.infOffer.length && infDone && canDeploy()) bits.push('place your infantry');
      return 'Your turn: ' + (bits.length ? bits.join(', ') + '. ' : '') + 'Select a green unit to move or attack (' + pl.moves + ' move' + (pl.moves === 1 ? '' : 's') + ' left), or play one card from your hand (1 a turn).';
    }
    if (pending.deploy !== undefined) return 'Choose a tile for the infantry. Defence units can go within 2 tiles of your king.';
    if (pending.hand !== undefined) {
      const needCell = remaining().some((a) => a.cell !== undefined);
      return needCell && pending.cell === undefined ? 'Choose a tile for it. Defence units can go within 2 tiles of your king.' : 'Choose a target.';
    }
    if (pending.mode === 'trap') return 'Choose an empty tile next to the rogue for the trap.';
    return 'The shaded tiles are this unit\'s reach. Click an enemy in reach (gold) to attack, or an empty tile to move.';
  }

  function render() {
    if (state.turn !== flagTurn) { flagTurn = state.turn; squadDone = false; squadForce = false; sqSel = null; }
    legal = state.active === ME && state.winner == null ? legalActions(state) : [];
    const pl = state.players[ME];
    if (pl.infOfferId !== infSeen) { infSeen = pl.infOfferId; infDone = false; infRoles = []; }          // a new turn, or Reinforcements: a fresh infantry offer
    trackChanges();
    $('board').innerHTML = boardHtml();
    $('foeBar').innerHTML = barHtml(1 - ME);
    $('myBar').innerHTML = barHtml(ME);
    $('hand').innerHTML = handHtml();
    $('hint').textContent = hint();
    $('endBtn').disabled = !myTurn();
    const sel = pending && pending.from && state.board[pending.from.r][pending.from.c];
    $('trapBtn').hidden = !(myTurn() && sel && legal.some((a) => a.t === 'trap' && locEq(a.from, pending.from)));
    $('trapBtn').textContent = pending && pending.mode === 'trap' ? 'Cancel trap' : 'Lay trap';
    const placeable = myTurn() && infDone && pl.infOffer.length > 0 && canDeploy() && !pending;
    $('placeBtn').hidden = !placeable;
    if (placeable) $('placeBtn').textContent = 'Place ' + CARDS[pl.infOffer[0]].name;
    $('offerBtn').hidden = !(myTurn() && pl.squadOffer.length > 0 && squadDone);
    renderPicker();
    const logEl = $('log');
    logEl.innerHTML = state.log.map((l) => `<div>${l}</div>`).join('');
    logEl.scrollTop = logEl.scrollHeight;
  }

  // ------------------------------------------------------------ events
  document.addEventListener('click', (e) => {
    const t = e.target;
    const ir = t.closest('[data-irole]');
    if (ir) {
      const i = +ir.dataset.i, role = ir.dataset.irole;
      infRoles[i] = infRoles[i] === role ? null : (roleAllowed(role, i) ? role : infRoles[i]);
      return render();
    }
    if (t.closest('#infRedo')) { infRoles = []; return render(); }
    if (t.closest('#infOk')) return confirmInfantry();
    const sq = t.closest('[data-sq]');
    if (sq) { sqSel = +sq.dataset.sq === sqSel ? null : +sq.dataset.sq; return render(); }
    const sp = t.closest('[data-sqplay]');
    if (sp) { const k = +sp.dataset.sqplay; squadDone = true; sqSel = null; pending = { hand: -1 - k }; return tryExecute(); }
    const sh = t.closest('[data-sqhold]');
    if (sh) { squadDone = true; const k = +sh.dataset.sqhold; sqSel = null; return run({ t: 'hold', pick: k }); }
    if (t.closest('#sqLater')) { squadDone = true; sqSel = null; return render(); }
    if (t.closest('#sqDiscard')) { squadDone = true; sqSel = null; [1, 0].forEach((i) => { if (state.players[ME].squadOffer[i] !== undefined) doAction({ t: 'discardSquad', pick: i }); }); return render(); }
    const hand = t.closest('[data-hand]');
    if (hand) return onHand(+hand.dataset.hand);
    const cell = t.closest('.cell');
    if (cell) return onTile({ r: +cell.dataset.r, c: +cell.dataset.c });
  });
  $('noteBtn').onclick = () => { if (rec) { saveGame(); } };
  $('aiSpeed').value = aiSpeed;
  $('aiSpeed').onchange = () => { aiSpeed = $('aiSpeed').value; try { localStorage.setItem('tbc-ai-speed', aiSpeed); } catch (e) { /* ignore */ } };
  $('skipBtn').onclick = () => { aiSkip = true; };
  $('endBtn').onclick = () => { if (myTurn()) run({ t: 'end' }); };
  $('trapBtn').onclick = () => { if (pending && pending.from) { pending = { from: pending.from, mode: pending.mode === 'trap' ? undefined : 'trap' }; render(); } };
  $('placeBtn').onclick = () => { pending = { deploy: 0 }; render(); };
  $('offerBtn').onclick = () => { squadDone = false; squadForce = true; pending = null; render(); };
  const cancel = () => { pending = null; if (state) render(); };
  document.addEventListener('contextmenu', (e) => { e.preventDefault(); cancel(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cancel(); });

  showMenu();
  window.__tbc = { get state() { return state; }, render };
})();
