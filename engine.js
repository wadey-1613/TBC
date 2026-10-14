/* TBC rules engine — pure state + actions, no DOM. Browser: window.TBC. Node: require().
 *
 * Each player has TWO piles:
 *   infDeck — 36 infantry (melee / ranged / defence). Free. You deploy the top card once per turn.
 *   deck    — the 52-card hand deck: big units, boosts and tactics. Drawn to hand, cost mana.
 * Board (per player): rows[0] = front row (7 slots), rows[1] = back row (5 slots, king in slot 2).
 * Column of front slot i = i; column of back slot i = i + 1.
 *
 * Hand-deck suits:  ♦ Siege (big breach units + siege tactics)   ♠ Defence (fortresses + defensive boosts)
 *                   ♣ Offence (offensive boosts + commanders)     ♥ Long range (artillery + tactics)
 */
(function (root) {
  'use strict';

  const FRONT = 7, BACK = 5, KING_I = 2, KING_HP = 30, HAND_MAX = 8, MAX_MANA = 10;
  const SYM = { S: '♠', C: '♣', D: '♦', H: '♥' };
  const SUIT_ROLE = { S: 'Defence', C: 'Offence', D: 'Siege', H: 'Long range' };
  const CLS_SYM = { melee: '⚔', ranged: '➶', defence: '▣' };
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  // ---------------------------------------------------------------- cards
  // Keywords: ranged (hits any column, no retaliation, never the king) · breach (ignores armour, x2 vs ♠) · swift (acts when played)
  // Targets: enemyUnit | enemyInf | enemyFront | allyUnit | allyInf
  // Effect 'to': target | allyInf | allyUnits | allySuit(suit) | enemyInf | enemyUnits
  const CARDS = {};
  const reg = (c) => { CARDS[c.id] = Object.assign({ kw: [], text: '', armor: 0, atk: 0, hp: 0, cost: 0 }, c); return CARDS[c.id]; };

  // ---- infantry (free, small stats)
  const INF = [
    ['iSword', 'Swordsman', 'melee', 2, 2, 0, 6], ['iBrute', 'Brute', 'melee', 3, 1, 0, 3], ['iSpear', 'Spearman', 'melee', 1, 3, 0, 3],
    ['iArcher', 'Archer', 'ranged', 2, 1, 0, 6], ['iSlinger', 'Slinger', 'ranged', 1, 2, 0, 6],
    ['iShield', 'Shieldman', 'defence', 1, 3, 1, 6], ['iGuard', 'Guard', 'defence', 0, 4, 1, 3], ['iPike', 'Pikeman', 'defence', 2, 2, 1, 3],
  ];
  const INF_DECK = [];
  for (const [id, name, cls, atk, hp, armor, n] of INF) {
    reg({ id, name, kind: 'unit', inf: true, cls, atk, hp, armor, kw: cls === 'ranged' ? ['ranged'] : [], text: '' });
    for (let k = 0; k < n; k++) INF_DECK.push(id);
  }

  // ---- hand deck
  const unit = (suit, rank, name, cost, atk, hp, armor, extra) => reg(Object.assign({ id: suit + rank, suit, rank, name, kind: 'unit', cost, atk, hp, armor }, extra));
  const spell = (suit, rank, name, cost, text, effects, extra) => reg(Object.assign({ id: suit + rank, suit, rank, name, kind: 'spell', cost, text, effects }, extra));
  const B = ['breach'], R = ['ranged'];

  // ♦ Siege — big units that break defences
  unit('D', 'A', 'Ram', 2, 4, 3, 0, { kw: B });
  unit('D', '2', 'Ladder Crew', 3, 3, 5, 0, { kw: B });
  unit('D', '3', 'Mangonel', 3, 5, 3, 0, { kw: B });
  unit('D', '4', 'Ballista Cart', 4, 5, 5, 0, { kw: B });
  unit('D', '5', 'Catapult', 4, 6, 4, 0, { kw: B });
  unit('D', '6', 'Siege Engine', 5, 6, 6, 0, { kw: B });
  unit('D', '7', 'Trebuchet', 5, 8, 4, 0, { kw: B });
  unit('D', '8', 'Juggernaut', 6, 8, 7, 0, { kw: B });
  unit('D', '9', 'Behemoth', 7, 10, 8, 0, { kw: B });
  unit('D', '10', 'Colossus', 8, 12, 10, 0, { kw: B });
  spell('D', 'J', 'Sapper Charge', 3, 'Deal 6 damage to an enemy front-row unit.', [{ op: 'damage', n: 6, to: 'target' }], { target: 'enemyFront' });
  spell('D', 'Q', 'Battering Charge', 3, 'Your Siege units may act again and get +2 attack.', [{ op: 'ready', to: 'allySuit', suit: 'D' }, { op: 'buff', atk: 2, hp: 0, to: 'allySuit', suit: 'D' }]);
  unit('D', 'K', 'Siege Master', 4, 3, 6, 0, { kw: B, text: 'Play: your Siege units get +1/+1.', effects: [{ op: 'buff', atk: 1, hp: 1, to: 'allySuit', suit: 'D' }] });

  // ♠ Defence — fortresses and defensive boosts
  unit('S', 'A', 'Palisade', 1, 0, 5, 1);
  unit('S', '2', 'Stone Wall', 2, 0, 7, 2);
  unit('S', '3', 'Bulwark', 3, 1, 9, 2);
  unit('S', '4', 'Fortress', 4, 2, 12, 3);
  unit('S', '5', 'Citadel', 6, 3, 16, 4);
  spell('S', '6', 'Field Hospital', 2, 'Your king heals 6.', [{ op: 'healKing', n: 6 }]);
  spell('S', '7', 'Fortify', 1, 'A unit gets +3 health and +1 armour.', [{ op: 'buff', atk: 0, hp: 3, armor: 1, to: 'target' }], { target: 'allyUnit' });
  spell('S', '8', 'Shield Wall', 4, 'All your units get +1 armour.', [{ op: 'buff', atk: 0, hp: 0, armor: 1, to: 'allyUnits' }]);
  spell('S', '9', 'Reinforce', 3, 'Restore all your units to full health.', [{ op: 'healAll' }]);
  spell('S', '10', 'Royal Guard', 3, 'Your king gets +2 armour.', [{ op: 'kingArmor', n: 2 }]);
  unit('S', 'J', 'Bodyguard', 3, 2, 6, 2, { text: 'Play: your king heals 4.', effects: [{ op: 'healKing', n: 4 }] });
  spell('S', 'Q', 'Engineers', 3, 'Your Defence units get +3 health.', [{ op: 'buff', atk: 0, hp: 3, to: 'allySuit', suit: 'S' }]);
  unit('S', 'K', 'Warlord', 5, 3, 10, 3, { text: 'Play: your king gets +1 armour.', effects: [{ op: 'kingArmor', n: 1 }] });

  // ♣ Offence — boosts for your infantry and commanders
  spell('C', 'A', 'Rally', 1, 'Your infantry get +1 attack.', [{ op: 'buff', atk: 1, hp: 0, to: 'allyInf' }]);
  spell('C', '2', 'Sharpen Blades', 1, 'A unit gets +2 attack.', [{ op: 'buff', atk: 2, hp: 0, to: 'target' }], { target: 'allyUnit' });
  spell('C', '3', 'Forced March', 2, 'Deploy 1 extra infantry this turn.', [{ op: 'deploy', n: 1 }]);
  spell('C', '4', 'Charge', 2, 'A unit may act again and gets +1 attack.', [{ op: 'ready', to: 'target' }, { op: 'buff', atk: 1, hp: 0, to: 'target' }], { target: 'allyUnit' });
  spell('C', '5', 'Warhorn', 3, 'All your units get +1/+1.', [{ op: 'buff', atk: 1, hp: 1, to: 'allyUnits' }]);
  spell('C', '6', 'Berserk', 2, 'An infantry gets +3 attack.', [{ op: 'buff', atk: 3, hp: 0, to: 'target' }], { target: 'allyInf' });
  spell('C', '7', 'Reinforcements', 3, 'Deploy 2 extra infantry this turn.', [{ op: 'deploy', n: 2 }]);
  spell('C', '8', 'Conscription', 4, 'Immediately deploy 3 infantry.', [{ op: 'summonInf', n: 3 }]);
  spell('C', '9', 'Battle Cry', 4, 'All your units may act again.', [{ op: 'ready', to: 'allyUnits' }]);
  spell('C', '10', 'Drums of War', 4, 'Your infantry get +2 attack.', [{ op: 'buff', atk: 2, hp: 0, to: 'allyInf' }]);
  unit('C', 'J', 'Champion', 4, 5, 4, 0, { kw: ['swift'] });
  unit('C', 'Q', 'Captain', 3, 3, 4, 0, { text: 'Play: your infantry get +1 attack.', effects: [{ op: 'buff', atk: 1, hp: 0, to: 'allyInf' }] });
  unit('C', 'K', 'General', 5, 4, 6, 0, { text: 'Play: all your units get +1/+1.', effects: [{ op: 'buff', atk: 1, hp: 1, to: 'allyUnits' }] });

  // ♥ Long range — artillery that safely thins infantry, plus tactics
  unit('H', 'A', 'Watchtower', 2, 2, 4, 0, { kw: R });
  unit('H', '2', 'Longbowmen', 3, 3, 3, 0, { kw: R });
  unit('H', '3', 'Crossbow Battery', 3, 4, 3, 0, { kw: R });
  unit('H', '4', 'Heavy Crossbow', 4, 5, 4, 0, { kw: R });
  unit('H', '5', 'Siege Archers', 5, 6, 4, 0, { kw: R });
  spell('H', '6', 'Eagle Eye', 3, 'Deal 3 damage to any enemy unit.', [{ op: 'damage', n: 3, to: 'target' }], { target: 'enemyUnit' });
  spell('H', '7', 'Volley', 3, 'Deal 2 damage to all enemy infantry.', [{ op: 'damage', n: 2, to: 'enemyInf' }]);
  spell('H', '8', 'Arrow Storm', 5, 'Deal 3 damage to all enemy units.', [{ op: 'damage', n: 3, to: 'enemyUnits' }]);
  spell('H', '9', 'Fire Arrows', 2, 'Deal 4 damage to an enemy infantry.', [{ op: 'damage', n: 4, to: 'target' }], { target: 'enemyInf' });
  spell('H', '10', 'Spyglass', 2, 'Draw 2 cards.', [{ op: 'draw', n: 2 }]);
  unit('H', 'J', 'Marksman', 4, 4, 2, 0, { kw: R, target: 'enemyFront', text: 'Play: deal 2 damage to an enemy front-row unit.', effects: [{ op: 'damage', n: 2, to: 'target' }] });
  spell('H', 'Q', 'Scout Report', 1, 'Draw a card.', [{ op: 'draw', n: 1 }]);
  unit('H', 'K', 'Master Archer', 6, 6, 5, 0, { kw: R });

  const DECK = Object.keys(CARDS).filter((id) => !CARDS[id].inf);

  // ---------------------------------------------------------------- helpers
  function rand(state) { // mulberry32
    state.rng = (state.rng + 0x6D2B79F5) | 0;
    let t = state.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffle(state, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand(state) * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  const sameRef = (a, b) => !!a && !!b && a.p === b.p && a.r === b.r && a.i === b.i;
  const locEq = (a, b) => !!a && !!b && a.r === b.r && a.i === b.i;
  const clone = (state) => { const l = state.log; state.log = null; const c = JSON.parse(JSON.stringify(state)); state.log = l; return c; };
  function log(state, msg) { if (state.log) { state.log.push(msg); if (state.log.length > 100) state.log.shift(); } }
  const cardLabel = (c) => (c.suit ? `${SYM[c.suit]}${c.rank} ` : '') + c.name;

  const rowLen = (r) => (r === 0 ? FRONT : BACK);
  const colOf = (r, i) => (r === 0 ? i : i + 1);
  const unitAt = (state, p, r, i) => (i >= 0 && i < rowLen(r) ? state.players[p].rows[r][i] : null);
  const unitOf = (state, ref) => unitAt(state, ref.p, ref.r, ref.i);
  const isKing = (u) => !!u && u.id === 'KING';
  const hasKw = (u, kw) => CARDS[u.id].kw.includes(kw);
  const suitOf = (u) => CARDS[u.id].suit;
  const isInf = (u) => !!CARDS[u.id].inf;
  const atkOf = (state, p, r, i) => { const u = unitAt(state, p, r, i); return u ? u.atk : 0; };

  CARDS.KING = { id: 'KING', kind: 'king', name: 'King', cost: 0, atk: 0, hp: KING_HP, armor: 0, kw: [], text: 'Lose your king and you lose the game.' };

  function attackDamage(att, atkVal, def) {
    if (hasKw(att, 'breach')) return suitOf(def) === 'S' ? atkVal * 2 : atkVal;
    return Math.max(0, atkVal - def.armor);
  }
  const makeUnit = (state, id) => { const c = CARDS[id]; return { uid: ++state.uid, id, atk: c.atk, hp: c.hp, maxHp: c.hp, armor: c.armor, ready: false }; };

  function firstInColumn(state, p, col) {
    if (col < 0 || col >= FRONT) return null;
    if (state.players[p].rows[0][col]) return { p, r: 0, i: col };
    const bi = col - 1;
    if (bi >= 0 && bi < BACK && state.players[p].rows[1][bi]) return { p, r: 1, i: bi };
    return null;
  }

  // ---------------------------------------------------------------- setup / flow
  function newGame(seed) {
    const state = { rng: seed | 0, turn: 1, active: 0, winner: null, reason: '', uid: 0, log: [], players: [] };
    for (let p = 0; p < 2; p++) {
      const rows = [new Array(FRONT).fill(null), new Array(BACK).fill(null)];
      rows[1][KING_I] = { uid: ++state.uid, id: 'KING', atk: 0, hp: KING_HP, maxHp: KING_HP, armor: 0, ready: false };
      state.players.push({ mana: 0, maxMana: 0, deploys: 0, deck: shuffle(state, DECK.slice()), infDeck: shuffle(state, INF_DECK.slice()), hand: [], rows });
    }
    for (let i = 0; i < 3; i++) draw(state, 0);
    for (let i = 0; i < 4; i++) draw(state, 1);
    startTurn(state);
    return state;
  }

  function draw(state, p) {
    if (state.winner != null) return;
    const pl = state.players[p];
    if (!pl.deck.length) {
      state.winner = 1 - p;
      state.reason = `Player ${p + 1} ran out of cards.`;
      log(state, state.reason);
      return;
    }
    const id = pl.deck.pop();
    if (pl.hand.length >= HAND_MAX) log(state, `Player ${p + 1}'s hand is full; ${CARDS[id].name} is discarded.`);
    else pl.hand.push(id);
  }

  function startTurn(state) {
    const pl = state.players[state.active];
    pl.maxMana = Math.min(MAX_MANA, pl.maxMana + 1);
    pl.mana = pl.maxMana;
    pl.deploys = state.active === 1 && pl.maxMana === 1 ? 2 : 1; // the second player's first turn gets a bonus deploy
    pl.rows.forEach((row) => row.forEach((u) => { if (u) u.ready = true; }));
    log(state, `— Turn ${state.turn}: Player ${state.active + 1} —`);
    draw(state, state.active);
    cleanup(state);
  }

  function cleanup(state) {
    for (let p = 0; p < 2; p++) {
      for (let r = 0; r < 2; r++) {
        state.players[p].rows[r].forEach((u, i) => {
          if (u && u.hp <= 0 && !isKing(u)) { state.players[p].rows[r][i] = null; log(state, `${CARDS[u.id].name} is destroyed.`); }
        });
      }
    }
    if (state.winner == null) {
      const k0 = state.players[0].rows[1][KING_I].hp <= 0, k1 = state.players[1].rows[1][KING_I].hp <= 0;
      if (k0 && k1) { state.winner = 2; state.reason = 'Both kings have fallen.'; }
      else if (k0) { state.winner = 1; state.reason = "Player 1's king has fallen."; }
      else if (k1) { state.winner = 0; state.reason = "Player 2's king has fallen."; }
      if (state.winner != null) log(state, state.reason);
    }
  }

  // ---------------------------------------------------------------- effects
  function allUnits(state, p) {
    const out = [];
    state.players[p].rows.forEach((row, r) => row.forEach((u, i) => { if (u && !isKing(u)) out.push({ p, r, i }); }));
    return out;
  }

  function validTargets(state, p, kind) {
    const ally = kind.startsWith('ally'), side = ally ? p : 1 - p;
    let refs = allUnits(state, side);
    if (kind.endsWith('Inf')) refs = refs.filter((x) => isInf(unitOf(state, x)));
    if (kind === 'enemyFront') refs = refs.filter((x) => x.r === 0);
    return refs;
  }

  function resolveTargets(state, e, ctx) {
    const p = ctx.p;
    switch (e.to) {
      case 'target': return ctx.target && unitOf(state, ctx.target) ? [ctx.target] : [];
      case 'allyUnits': return allUnits(state, p);
      case 'allyInf': return allUnits(state, p).filter((x) => isInf(unitOf(state, x)));
      case 'allySuit': return allUnits(state, p).filter((x) => suitOf(unitOf(state, x)) === e.suit);
      case 'enemyInf': return allUnits(state, 1 - p).filter((x) => isInf(unitOf(state, x)));
      case 'enemyUnits': return allUnits(state, 1 - p);
      default: return [];
    }
  }

  function deployInfantry(state, p, cell) {
    const pl = state.players[p];
    const id = pl.infDeck.pop();
    pl.rows[cell.r][cell.i] = makeUnit(state, id);
    return CARDS[id];
  }

  function runEffects(state, effects, ctx) {
    for (const e of effects) {
      const pl = state.players[ctx.p], king = pl.rows[1][KING_I];
      switch (e.op) {
        case 'draw': for (let k = 0; k < e.n; k++) draw(state, ctx.p); break;
        case 'healKing': king.hp = Math.min(king.maxHp, king.hp + e.n); break;
        case 'kingArmor': king.armor += e.n; break;
        case 'deploy': pl.deploys += e.n; break;
        case 'healAll': for (const ref of allUnits(state, ctx.p)) { const u = unitOf(state, ref); u.hp = u.maxHp; } break;
        case 'summonInf': {
          const free = [];
          pl.rows[0].forEach((u, i) => { if (!u) free.push(i); });
          free.sort((a, b) => Math.abs(a - 3) - Math.abs(b - 3) || a - b);
          for (const i of free.slice(0, Math.min(e.n, pl.infDeck.length))) { const c = deployInfantry(state, ctx.p, { r: 0, i }); log(state, `${c.name} is conscripted.`); }
          break;
        }
        case 'damage': for (const ref of resolveTargets(state, e, ctx)) unitOf(state, ref).hp -= e.n; break;
        case 'heal': for (const ref of resolveTargets(state, e, ctx)) { const u = unitOf(state, ref); u.hp = Math.min(u.maxHp, u.hp + e.n); } break;
        case 'ready': for (const ref of resolveTargets(state, e, ctx)) unitOf(state, ref).ready = true; break;
        case 'buff':
          for (const ref of resolveTargets(state, e, ctx)) {
            const u = unitOf(state, ref);
            u.atk += e.atk || 0; u.hp += e.hp || 0; u.maxHp += e.hp || 0; u.armor += e.armor || 0;
          }
          break;
        default: break;
      }
    }
  }

  // ---------------------------------------------------------------- legal actions
  function attackTargets(state, p, r, i) {
    const u = unitAt(state, p, r, i), foe = 1 - p, out = [];
    const ranged = hasKw(u, 'ranged');
    if (!ranged && r === 1) return out; // melee units in the back row are boxed in
    const c = colOf(r, i);
    const cols = ranged ? [0, 1, 2, 3, 4, 5, 6] : [c - 1, c, c + 1];
    for (const col of cols) {
      const t = firstInColumn(state, foe, col);
      if (t && !(ranged && isKing(unitOf(state, t)))) out.push(t);
    }
    return out;
  }

  function legalActions(state) {
    if (state.winner != null) return [];
    const p = state.active, me = state.players[p], acts = [];
    const empty = [];
    me.rows.forEach((row, r) => row.forEach((u, i) => { if (!u) empty.push({ r, i }); }));

    if (me.deploys > 0 && me.infDeck.length) for (const cell of empty) acts.push({ t: 'deploy', cell });

    me.hand.forEach((id, h) => {
      const c = CARDS[id];
      if (c.cost > me.mana) return;
      const targets = c.target ? validTargets(state, p, c.target) : [];
      if (c.kind === 'spell') {
        if (c.target) targets.forEach((target) => acts.push({ t: 'play', hand: h, target }));
        else acts.push({ t: 'play', hand: h });
        return;
      }
      for (const cell of empty) {
        if (targets.length) targets.forEach((target) => acts.push({ t: 'play', hand: h, cell, target }));
        else acts.push({ t: 'play', hand: h, cell });
      }
    });

    me.rows.forEach((row, r) => row.forEach((u, i) => {
      if (!u || isKing(u) || !u.ready) return;
      if (atkOf(state, p, r, i) > 0) attackTargets(state, p, r, i).forEach((target) => acts.push({ t: 'attack', from: { r, i }, target }));
      const dests = [{ r, i: i - 1 }, { r, i: i + 1 }, r === 0 ? { r: 1, i: i - 1 } : { r: 0, i: i + 1 }];
      for (const d of dests) if (d.i >= 0 && d.i < rowLen(d.r) && !me.rows[d.r][d.i]) acts.push({ t: 'move', from: { r, i }, cell: d });
    }));

    acts.push({ t: 'end' });
    return acts;
  }

  const slotName = (c) => `${c.r === 0 ? 'front' : 'back'} ${c.i + 1}`;

  function applyAction(state, a) {
    const key = JSON.stringify(a);
    if (!legalActions(state).some((x) => JSON.stringify(x) === key)) throw new Error('Illegal action ' + key);
    const p = state.active, me = state.players[p];

    if (a.t === 'end') {
      state.active = 1 - p;
      state.turn++;
      startTurn(state);
      return state;
    }

    if (a.t === 'deploy') {
      me.deploys--;
      const c = deployInfantry(state, p, a.cell);
      log(state, `Player ${p + 1} deploys ${c.name} (${slotName(a.cell)}).`);
    } else if (a.t === 'play') {
      const id = me.hand[a.hand], c = CARDS[id];
      me.hand.splice(a.hand, 1);
      me.mana -= c.cost;
      if (c.kind === 'unit') {
        const u = makeUnit(state, id);
        u.ready = c.kw.includes('swift');
        me.rows[a.cell.r][a.cell.i] = u;
        log(state, `Player ${p + 1} plays ${cardLabel(c)} (${slotName(a.cell)}).`);
      } else {
        log(state, `Player ${p + 1} casts ${cardLabel(c)}.`);
      }
      if (c.effects) runEffects(state, c.effects, { p, target: a.target });
    } else if (a.t === 'move') {
      const u = me.rows[a.from.r][a.from.i];
      me.rows[a.from.r][a.from.i] = null;
      me.rows[a.cell.r][a.cell.i] = u;
      u.ready = false;
      log(state, `${CARDS[u.id].name} moves to ${slotName(a.cell)}.`);
    } else if (a.t === 'attack') {
      const att = me.rows[a.from.r][a.from.i], def = unitOf(state, a.target);
      const atkVal = atkOf(state, p, a.from.r, a.from.i);
      const defVal = atkOf(state, a.target.p, a.target.r, a.target.i);
      att.ready = false;
      const dmg = attackDamage(att, atkVal, def);
      def.hp -= dmg;
      log(state, `${CARDS[att.id].name} hits ${CARDS[def.id].name} for ${dmg}${dmg === 0 ? ' (blocked by armour)' : ''}.`);
      if (!hasKw(att, 'ranged') && defVal > 0) {
        const back = attackDamage(def, defVal, att);
        att.hp -= back;
        if (back) log(state, `${CARDS[def.id].name} strikes back for ${back}.`);
      }
    }
    cleanup(state);
    return state;
  }

  const api = { FRONT, BACK, KING_I, KING_HP, HAND_MAX, MAX_MANA, SYM, SUIT_ROLE, CLS_SYM, CARDS, DECK, INF_DECK, newGame, legalActions, applyAction, clone, atkOf, hasKw, suitOf, isKing, isInf, sameRef, locEq, unitAt, unitOf, colOf, firstInColumn };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TBC = api;
})(typeof window !== 'undefined' ? window : globalThis);
