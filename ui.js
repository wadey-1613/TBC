(function () {
  'use strict';
  const E = window.TBC;
  const { CARDS, SYM, SUIT_ROLE, CLS_SYM, TRAPS, OUTPOSTS, LEGEND_LEVELS, ROWS, COLS, HAND_MAX, newGame, legalActions, applyAction, sameRef, locEq, isKing, AI } = E;
  const ME = 0;
  const $ = (id) => document.getElementById(id);
  let state = null, pending = null, legal = [], aiRunning = false, notice = '';
  let prevUnits = new Map(), changes = new Map(), deaths = new Map(), reachSet = new Set();

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
    if (pd.summon !== undefined && a.t !== 'summon') return false;
    return (pd.deploy === undefined || (a.t === 'deploy' && a.pick === pd.deploy)) &&
      (pd.hand === undefined || (a.t === 'play' && a.hand === pd.hand)) &&
      (pd.from === undefined || (locEq(a.from, pd.from) && (pd.mode ? a.t === pd.mode : a.t !== 'trap' && a.t !== 'bomb'))) &&
      (pd.cell === undefined || locEq(a.cell, pd.cell)) &&
      (pd.target === undefined || sameRef(a.target, pd.target));
  }
  const CHOICE = ['deploy', 'play', 'move', 'attack', 'trap', 'bomb', 'summon'];
  const remaining = () => legal.filter((a) => CHOICE.includes(a.t) && (!pending || fieldsMatch(a, pending)));
  const complete = (a, pd) => (a.cell === undefined || pd.cell !== undefined) && (a.target === undefined || pd.target !== undefined);
  const myTurn = () => state.active === ME && !aiRunning && state.winner == null;

  function run(a) {
    pending = null; notice = '';
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
    notice = '';
    const pl = state.players[ME], c = CARDS[pl.hand[i]];
    if (!legal.some((a) => a.t === 'play' && a.hand === i)) {
      pending = null;
      notice = c.cost > pl.mana ? `${c.name} costs ${c.cost} mana and you have ${pl.mana}.` : `${c.name} can't be played right now (nothing in reach, or nowhere to put it).`;
      return render();
    }
    pending = pending && pending.hand === i ? null : { hand: i };
    tryExecute(); // boosts with no choices fire immediately
  }

  function onInfantry(pick) {
    if (!myTurn()) return;
    notice = '';
    if (!legal.some((a) => a.t === 'deploy' && a.pick === pick)) { pending = null; return render(); }
    pending = pending && pending.deploy === pick ? null : { deploy: pick };
    render();
  }

  function onTile(ref) {
    if (!myTurn()) return;
    notice = '';
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

  // The opponent's turn is replayed action by action so you can follow it. Before it moves it "thinks" for a random
  // 1-10 seconds (once per turn by default, or before every action). Small actions are quick, fights and card plays
  // linger a little. Speed and thinking can be changed, and Skip finishes the turn at once.
  const AI_PACE = { attack: 360, play: 480, summon: 600, build: 500, trap: 340, bomb: 420, move: 200, deploy: 260, swapInf: 80, end: 120 };
  const AI_SPEED = { normal: 1, fast: 0.3, instant: 0 };
  const THINK_MODES = ['turn', 'action', 'off'];
  let aiSpeed = 'normal', aiThinkMode = 'turn', aiSkip = false, aiThinking = false, thoughtThisTurn = false, thinkTimer = null, thinkResume = null;
  try {
    const sp = localStorage.getItem('tbc-ai-speed'), th = localStorage.getItem('tbc-ai-think');
    if (sp && sp in AI_SPEED) aiSpeed = sp;
    if (th && THINK_MODES.includes(th)) aiThinkMode = th;
  } catch (e) { /* storage unavailable */ }
  const aiDelay = (a) => (aiSkip ? 0 : (AI_PACE[a.t] || 200) * AI_SPEED[aiSpeed]);
  const thinkMs = () => 1000 + Math.random() * 9000;

  // pause for a random 1-10 s before acting, if the settings call for it, then continue
  function think(then) {
    const wanted = !aiSkip && AI_SPEED[aiSpeed] > 0 && (aiThinkMode === 'action' || (aiThinkMode === 'turn' && !thoughtThisTurn));
    thoughtThisTurn = true;
    if (!wanted) return then();
    aiThinking = true;
    render();
    thinkResume = () => { clearTimeout(thinkTimer); thinkTimer = null; thinkResume = null; aiThinking = false; then(); };
    thinkTimer = setTimeout(thinkResume, thinkMs());
  }

  function aiLoop() {
    aiRunning = true; aiSkip = false; aiThinking = false; thoughtThisTurn = false;
    $('skipBtn').hidden = false;
    const finish = () => { aiRunning = false; aiSkip = false; aiThinking = false; $('skipBtn').hidden = true; saveGame(); render(); };
    const step = () => {
      if (state.winner != null || state.active === ME) return finish();
      think(() => {
        const a = AI.chooseAction(state);
        doAction(a);
        if (state.winner != null) { aiRunning = false; aiThinking = false; $('skipBtn').hidden = true; render(); return showEnd(); }
        if (state.active === ME) return finish();         // the opponent ended its turn: hand control back immediately
        render();
        setTimeout(step, aiDelay(a));
      });
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
      <p>March up the table and take the enemy castle, or own more of the land when the rounds run out.<br>Draw a card, spend your mana, place your free infantry, then move and fight.</p><button id="go">Start game</button>`;
    $('overlay').classList.add('show');
    $('go').onclick = start;
  }

  function start() {
    const seed = (Math.random() * 2 ** 31) | 0;
    state = newGame(seed);
    rec = { id: 'g' + Date.now().toString(36) + '-' + seed, seed, startedAt: Date.now(), actions: [] };
    setStatus('Starting the game record…'); saveGame();   // saving at the start means any permission prompt appears now, not mid-turn
    if ($('noteBox')) $('noteBox').value = '';
    pending = null; aiRunning = false; prevUnits = new Map(); notice = '';
    $('overlay').classList.remove('show');
    render();
  }

  // ------------------------------------------------------------ rendering helpers
  const red = (suit) => suit === 'H' || suit === 'D';
  const REACH = { melee: 'melee · 8 around', range: 'range · 2nd & 3rd row ahead', defence: 'defence · front arc', none: 'cannot attack' };
  const reachLabel = (c) => (c.atk === 0 ? 'cannot attack' : REACH[c.reach]);
  const kwText = (c) => (c.kind === 'spell' ? c.kw : [reachLabel(c)].concat(c.kw)).join(' · ');

  // attack / armour plates / health pills. `now` is the live unit (or null for a card)
  function statsHtml(id, now) {
    const c = CARDS[id];
    const atk = now ? now.atk : c.atk, arm = now ? now.armor : c.armor, hp = now ? now.hp : c.hp, max = now ? now.maxHp : c.hp, maxA = now ? now.maxArmor : c.armor;
    return `<div class="stats"><span class="pill a${atk > c.atk ? ' buffed' : ''}${atk === 0 ? ' zero' : ''}" title="Attack">⚔${atk}</span>`
      + `<span class="pill ar${arm > c.armor ? ' buffed' : ''}${arm === 0 ? ' zero' : ''}${arm < maxA ? ' worn' : ''}" title="Armour plates: a normal hit removes half its strength (rounded up) from the plates before health is touched">🛡${arm}${now && maxA ? '/' + maxA : ''}</span>`
      + `<span class="pill h${hp < max ? ' hurt' : ''}" title="Health">♥${hp}${now ? '/' + max : ''}</span></div>`;
  }

  function barHtml(p) {
    const pl = state.players[p], k = E.kingOf(state, p);
    const mana = `<span class="mana">${'●'.repeat(pl.mana)}<span class="off">${'●'.repeat(pl.maxMana - pl.mana)}</span></span> <b>${pl.mana}/${pl.maxMana}</b>`;
    const lg = E.legendOf(state, p), lv = E.legendLevel(state, p);
    const legend = lg ? `<span title="Your king's Legend is on the board">Legend <b>★${state.board[lg.r][lg.c].level} alive</b></span>`
      : pl.legendCd > 0 ? `<span title="A fallen Legend takes as many turns to come back as it cost">Legend back in <b>${pl.legendCd}</b></span>`
      : `<span title="Land owned sets the level: more land, a stronger Legend that costs more mana (and takes that many turns to return if it falls)">Legend ready <b>★${lv} · ${LEGEND_LEVELS[lv].cost} mana</b></span>`;
    const clock = p === ME ? `<span title="When the rounds run out, whoever owns more tiles wins">Round <b>${Math.min(E.MAX_TURNS / 2, Math.ceil(state.turn / 2))}/${E.MAX_TURNS / 2}</b></span>` : '';
    return `<b>${p === ME ? 'You' : 'Opponent'}</b><span title="Tiles owned. Land you step on is yours until the enemy steps on it">Land <b>${E.tileCount(state, p)}</b></span>${legend}<span>Castle <b>♥${k.hp}/${k.maxHp}</b>${k.armor ? ' 🛡' + k.armor : ''}</span><span title="Mana: spend it to play cards">Mana ${mana}</span><span>Moves <b>${pl.moves}</b></span>`
      + `<span>Hand <b>${pl.hand.length}</b></span><span title="Traps this player has on the board">Traps <b>${state.traps.filter((t) => t.p === p).length}</b></span><span>Deck <b>${pl.deck.length}</b></span><span>Infantry <b>${pl.infDeck.length}</b></span>${clock}`
      + `<span class="grow"></span>${p !== ME && aiThinking ? '<span class="think">💭 thinking<span class="dots"><i>.</i><i>.</i><i>.</i></span></span>' : state.active === p ? '<span class="active-badge">● Active</span>' : ''}`;
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
    const ow = state.owner[r][c], home = ow === 0 ? ' own0' : ow === 1 ? ' own1' : '';
    const op = E.outpostAt(state, r, c);
    const opHtml = op ? `<div class="op" title="${op.kind ? OUTPOSTS[op.kind].name + ': ' + OUTPOSTS[op.kind].text + ' Works for whoever stands on it.' : 'Outpost site: hold it with a unit for a full turn, then build a Lookout, Bunker or Gold Mine here.'}">${op.kind ? OUTPOSTS[op.kind].sym : '⚑'}</div>` : '';
    const ko = deaths.has(r * COLS + c);
    const isGrab = pending !== null && pending.target === undefined && rem.some((a) => a.target && sameRef(a.target, ref));
    const attrs = `class="cell${home}${op ? ' outpost' : ''}${isGrab && !u ? ' grab' : ''}${isDest ? ' dest' : ''}${reachSet.has(r * COLS + c) ? ' reach' : ''}${ko ? ' ko' : ''}" data-r="${r}" data-c="${c}"`;
    if (!u) {
      const t = E.trapAt(state, r, c);
      const trap = t ? `<div class="trap p${t.p}" title="${t.p === ME ? 'Your' : 'Enemy'} ${TRAPS[t.type].name}: ${TRAPS[t.type].text}">${TRAPS[t.type].sym}</div>` : '';
      return `<div ${attrs}>${opHtml}${trap}${ko ? '<div class="float dead">✖</div>' : ''}</div>`;
    }
    const k = CARDS[u.id], ch = changes.get(u.uid) || { hp: 0, ar: 0 }, delta = ch.hp;
    const isTarget = pending !== null && pending.target === undefined && rem.some((a) => a.target && sameRef(a.target, ref));
    const ready = u.p === ME && !pending && myTurn() && legal.some((a) => a.from && locEq(a.from, ref));
    const sel = pending && pending.from && locEq(pending.from, ref);
    const cls = ['unit', 'p' + u.p, k.inf ? 'I' : (k.suit || ''), isKing(u) ? 'king' : '', u.legend ? 'legend' : '', ready ? 'ready' : '', isTarget ? 'target' : '', sel ? 'selected' : '', u.attacked && !isKing(u) ? 'spent' : '', u.fresh ? 'fresh' : '', delta < 0 || ch.ar < 0 ? 'hit' : delta > 0 || ch.ar > 0 ? 'healed' : '', u.stealth ? 'hidden' : '', (u.fresh || u.stealth || u.ammo > 0 || statusText(u) || (u.legend && u.p === state.active)) ? 'hastl' : ''].join(' ');
    const rk = isKing(u) ? '♔' : u.legend ? '★' + u.level : k.inf ? CLS_SYM[k.cls] : `${k.rank}${SYM[k.suit]}`;
    const title = `${k.name}${k.inf ? ' — ' + k.cls + ' infantry' : k.suit ? ' — ' + SUIT_ROLE[k.suit] : ''} [${isKing(u) ? 'castle' : reachLabel(k)}${k.kw.length ? ', ' + k.kw.join(', ') : ''}]${k.text ? ': ' + k.text : ''}`;
    const ratio = Math.max(0, u.hp / u.maxHp), barCls = ratio <= 0.34 ? 'low' : ratio <= 0.67 ? 'mid' : '';
    const stats = isKing(u)
      ? `<div class="stats"><span class="pill h${u.hp < u.maxHp ? ' hurt' : ''}">♥${u.hp}/${u.maxHp}</span><span class="pill ar${u.armor ? '' : ' zero'}${u.armor < u.maxArmor ? ' worn' : ''}">🛡${u.armor}${u.maxArmor ? '/' + u.maxArmor : ''}</span></div>`
      : statsHtml(u.id, u);
    const ammo = u.ammo > 0 ? (k.rogue === 'bomb' ? '💣' : TRAPS[k.trap].sym) : '';
    const tl = [u.fresh ? 'NEW' : '', u.legend && !u.fresh && u.p === state.active ? '⇢' + u.steps : '', u.stealth ? 'HIDDEN' : '', ammo, statusText(u)].filter(Boolean).join(' ');
    const gar = u.garrison ? `<div class="gar" title="${CARDS[u.garrison.id].name} is inside: it shoots from here and can't be targeted. It drops out if the tower falls.">🏹 ${CARDS[u.garrison.id].name} ⚔${u.garrison.atk} ♥${u.garrison.hp}/${u.garrison.maxHp}</div>` : '';
    const num = (delta ? `<div class="float ${delta < 0 ? 'dmg' : 'heal'}">${delta > 0 ? '+' : ''}${delta}</div>` : '')
      + (ch.ar ? `<div class="float arm" ${delta ? 'style="top:36px"' : ''}>🛡${ch.ar > 0 ? '+' : ''}${ch.ar}</div>` : '');
    return `<div ${attrs}><div class="${cls}" title="${title}"><span class="rk">${rk}</span>${tl ? `<span class="tl">${tl}</span>` : ''}<div class="nm">${k.name}</div>${gar}`
      + `<div class="hpbar"><i class="${barCls}" style="width:${Math.round(ratio * 100)}%"></i></div>${stats}</div>${num}${opHtml}</div>`;
  }

  // compare with the previous render so hits, armour loss, heals and kills can be flashed
  function trackChanges() {
    changes = new Map(); deaths = new Map();
    const cur = new Map();
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const u = state.board[r][c]; if (u) cur.set(u.uid, { hp: u.hp, ar: u.armor, r, c, king: isKing(u) }); }
    prevUnits.forEach((old, uid) => {
      const now = cur.get(uid);
      if (now) { if (now.hp !== old.hp || now.ar !== old.ar) changes.set(uid, { hp: now.hp - old.hp, ar: now.ar - old.ar }); }
      else if (!old.king) deaths.set(old.r * COLS + old.c, true);
    });
    prevUnits = cur;
  }

  function boardHtml() {
    const rem = pending ? remaining() : [];
    reachSet = new Set();
    if (pending && pending.from && !pending.mode) E.reachTiles(state, pending.from.r, pending.from.c).forEach((t) => reachSet.add(t.r * COLS + t.c));
    let html = '';
    for (let r = ROWS - 1; r >= 0; r--) for (let c = 0; c < COLS; c++) html += tileHtml(r, c, rem);
    return html;
  }

  function cardHtml(id, opts) {
    const c = CARDS[id];
    const cls = ['card', c.inf ? 'inf free' : c.suit, opts.playable ? 'playable' : 'dim', opts.selected ? 'selected' : ''].join(' ');
    const top = c.inf ? CLS_SYM[c.cls] : `${c.rank}${SYM[c.suit]}`;
    const type = c.inf ? `${c.cls} infantry` : `${c.kind === 'spell' ? 'Boost' : 'Unit'} · ${SUIT_ROLE[c.suit]}`;
    const cost = c.inf ? '<div class="cost">FREE</div>' : `<div class="cost" title="Costs ${c.cost} mana">${c.cost}</div>`;
    return `<div class="${cls}" ${opts.attr || ''} title="${c.name}${c.text ? ': ' + c.text.replace(/"/g, '&quot;') : ''}">${cost}<div class="top ${red(c.suit) ? 'red' : ''}">${top}</div><div class="nm">${c.name}</div>
      <div class="ty">${type}</div><div class="tags">${kwText(c)}</div><div class="tx">${c.text}</div>${c.kind === 'unit' ? statsHtml(id, null) : '<div class="stats"></div>'}</div>`;
  }

  function handHtml() {
    const pl = state.players[ME];
    let html = pl.hand.map((id, i) => cardHtml(id, { playable: myTurn() && legal.some((a) => a.t === 'play' && a.hand === i), selected: pending && pending.hand === i, attr: `data-hand="${i}"` })).join('');
    for (let i = pl.hand.length; i < HAND_MAX; i++) html += '<div class="card empty"></div>';
    return html;
  }

  function infantryHtml() {
    const pl = state.players[ME];
    if (!pl.infHand.length) return '<div class="card empty">placed</div>';
    return pl.infHand.map((id, i) => cardHtml(id, { playable: myTurn() && legal.some((a) => a.t === 'deploy' && a.pick === i), selected: pending && pending.deploy === i, attr: `data-inf="${i}"` })).join('');
  }

  function hint() {
    const pl = state.players[ME];
    if (state.winner != null) return state.reason;
    if (state.active !== ME) return aiThinking ? 'Opponent is thinking about what to do next… (Skip opponent to hurry it up)' : 'Opponent is playing… (Skip opponent to finish its turn)';
    if (notice) return notice;
    if (!pending) {
      const bits = [];
      if (pl.infHand.length) bits.push('place your free infantry');
      bits.push(`spend your ${pl.mana} mana on cards from your hand${legal.some((a) => a.t === 'summon') ? ' or on your king\'s Legend' : ''}`);
      if (legal.some((a) => a.t === 'build')) bits.push('build on the outpost you are holding');
      return 'Your turn: ' + bits.join(', ') + '. Select a green unit to move or attack (' + pl.moves + ' move' + (pl.moves === 1 ? '' : 's') + ' left).';
    }
    if (pending.summon) return 'Choose a tile next to your king for the Legend. It moves up to 3 tiles a turn and claims every tile it lands on.';
    if (pending.deploy !== undefined) return 'Choose a tile for the infantry (free). Defence units can go within 2 tiles of your king; archers can go into a Siege Tower.';
    if (pending.hand !== undefined) {
      const needCell = remaining().some((a) => a.cell !== undefined);
      if (!needCell && remaining().some((a) => a.target && !CARDS[state.players[ME].hand[pending.hand]].inf && CARDS[state.players[ME].hand[pending.hand]].target === 'tile')) return 'Choose the centre of the 3x3 area to claim (it must touch your land; tiles with enemy units are not taken).';
      return needCell && pending.cell === undefined ? 'Choose a tile for it. Defence units can go within 2 tiles of your king; archers can go into a Siege Tower.' : 'Choose a target.';
    }
    if (pending.mode === 'trap') return 'Choose an empty tile next to the rogue for the trap.';
    if (pending.mode === 'bomb') return 'Choose a landing tile exactly 2 away. The blast hits that tile and every tile around it, friends too.';
    return 'The shaded tiles are this unit\'s reach. Click an enemy in reach (gold) to attack, or an empty tile to move.';
  }

  function render() {
    legal = state.active === ME && state.winner == null ? legalActions(state) : [];
    trackChanges();
    $('board').innerHTML = boardHtml();
    $('foeBar').innerHTML = barHtml(1 - ME);
    $('myBar').innerHTML = barHtml(ME);
    $('infantry').innerHTML = infantryHtml();
    $('hand').innerHTML = handHtml();
    $('handInfo').textContent = `${state.players[ME].hand.length}/${HAND_MAX}`;
    $('hint').textContent = hint();
    $('endBtn').disabled = !myTurn();
    $('swapBtn').disabled = !(myTurn() && legal.some((a) => a.t === 'swapInf'));
    const sel = pending && pending.from && state.board[pending.from.r][pending.from.c];
    const has = (t) => !!(myTurn() && sel && legal.some((a) => a.t === t && locEq(a.from, pending.from)));
    const canSummon = myTurn() && legal.some((a) => a.t === 'summon'), lv = E.legendLevel(state, ME);
    $('summonBtn').hidden = !canSummon;
    $('summonBtn').textContent = pending && pending.summon ? 'Cancel summon' : `Summon Legend ★${lv} (${LEGEND_LEVELS[lv].cost})`;
    const builds = myTurn() ? legal.filter((a) => a.t === 'build') : [];
    $('buildRow').innerHTML = builds.map((a) => `<button class="alt small" data-build="${a.at.r},${a.at.c},${a.kind}" title="${OUTPOSTS[a.kind].text}">${OUTPOSTS[a.kind].sym} Build ${OUTPOSTS[a.kind].name}</button>`).join('');
    $('trapBtn').hidden = !has('trap'); $('bombBtn').hidden = !has('bomb');
    $('trapBtn').textContent = pending && pending.mode === 'trap' ? 'Cancel trap' : 'Lay trap';
    $('bombBtn').textContent = pending && pending.mode === 'bomb' ? 'Cancel bomb' : 'Throw bomb';
    const logEl = $('log');
    logEl.innerHTML = state.log.map((l) => `<div>${l}</div>`).join('');
    logEl.scrollTop = logEl.scrollHeight;
  }

  // ------------------------------------------------------------ events
  document.addEventListener('click', (e) => {
    const t = e.target;
    const bld = t.closest('[data-build]');
    if (bld && myTurn()) { const [r, c, kind] = bld.dataset.build.split(','); return run({ t: 'build', at: { r: +r, c: +c }, kind }); }
    const hand = t.closest('[data-hand]');
    if (hand) return onHand(+hand.dataset.hand);
    const inf = t.closest('[data-inf]');
    if (inf) return onInfantry(+inf.dataset.inf);
    const cell = t.closest('.cell');
    if (cell) return onTile({ r: +cell.dataset.r, c: +cell.dataset.c });
  });
  $('aiSpeed').value = aiSpeed;
  $('aiSpeed').onchange = () => { aiSpeed = $('aiSpeed').value; try { localStorage.setItem('tbc-ai-speed', aiSpeed); } catch (e) { /* ignore */ } };
  $('aiThink').value = aiThinkMode;
  $('aiThink').onchange = () => { aiThinkMode = $('aiThink').value; try { localStorage.setItem('tbc-ai-think', aiThinkMode); } catch (e) { /* ignore */ } };
  $('skipBtn').onclick = () => { aiSkip = true; if (thinkResume) thinkResume(); };
  $('noteBtn').onclick = () => { if (rec) saveGame(); };
  $('swapBtn').onclick = () => { if (myTurn()) run({ t: 'swapInf', pick: 0 }); };
  $('endBtn').onclick = () => { if (myTurn()) run({ t: 'end' }); };
  const toggleMode = (mode) => { if (pending && pending.from) { pending = { from: pending.from, mode: pending.mode === mode ? undefined : mode }; render(); } };
  $('summonBtn').onclick = () => { if (myTurn()) { pending = pending && pending.summon ? null : { summon: true }; render(); } };
  $('trapBtn').onclick = () => toggleMode('trap');
  $('bombBtn').onclick = () => toggleMode('bomb');
  const cancel = () => { pending = null; notice = ''; if (state) render(); };
  document.addEventListener('contextmenu', (e) => { e.preventDefault(); cancel(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cancel(); });

  showMenu();
  window.__tbc = { get state() { return state; }, render };
})();
