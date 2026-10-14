/* TBC rules engine — pure state + actions, no DOM. Browser: window.TBC. Node: require().
 *
 * Board (per player): rows[0] = front row (7 slots), rows[1] = back row (5 slots, king in slot 2).
 * Column of front slot i = i; column of back slot i = i + 1 (back row sits centred behind the front row).
 * Every card in the 52-card deck is a unit. Suit decides its role:
 *   Spades  = Defence      (armour: reduces every hit by N)
 *   Clubs   = Small attack (swarm: +1 attack per adjacent club in the same row)
 *   Diamonds= Siege        (breach: ignores armour, double damage to Spades)
 *   Hearts  = Long range   (ranged: shoots any column, no retaliation, cannot target the king)
 */
(function (root) {
  'use strict';

  const FRONT = 7, BACK = 5, KING_I = 2, KING_HP = 30, HAND_MAX = 8, MAX_MANA = 10;
  const SYM = { S: '♠', C: '♣', D: '♦', H: '♥' };
  const SUIT_ROLE = { S: 'Defence', C: 'Swarm', D: 'Siege', H: 'Ranged' };
  const SUIT_KW = { S: [], C: ['swarm'], D: ['breach'], H: ['ranged'] };
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  // ---------------------------------------------------------------- card table
  // [name, cost, atk, hp, armor, extra]   (rank order A,2..10,J,Q,K)
  const T = {
    S: [
      ['Barricade', 1, 0, 4, 0], ['Shieldman', 1, 1, 3, 1], ['Pikeman', 2, 2, 3, 1], ['Wall', 2, 0, 6, 1],
      ['Bulwark', 3, 1, 7, 2], ['Phalanx', 3, 2, 6, 2], ['Stone Wall', 4, 0, 9, 2], ['Fortress', 5, 2, 10, 3],
      ['Bastion', 6, 3, 12, 3], ['Citadel', 7, 3, 14, 4],
      ['Bodyguard', 2, 1, 4, 1, { text: 'Play: your king heals 4.', effects: [{ op: 'healKing', n: 4 }] }],
      ['Engineer', 3, 0, 5, 1, { text: 'Play: your Spades get +2 health.', effects: [{ op: 'buff', atk: 0, hp: 2, to: 'allySuit', suit: 'S' }] }],
      ['Warlord', 5, 3, 8, 2, { text: 'Play: your king gains +1 armour.', effects: [{ op: 'kingArmor', n: 1 }] }],
    ],
    C: [
      ['Scout', 1, 1, 1, 0, { kw: ['swift'] }], ['Recruit', 1, 2, 1, 0], ['Militia', 1, 2, 2, 0], ['Footman', 2, 3, 2, 0],
      ['Spearman', 2, 3, 3, 0], ['Raider', 3, 4, 2, 0, { kw: ['swift'] }], ['Veteran', 3, 4, 4, 0], ['Berserker', 4, 5, 3, 0],
      ['Champion', 4, 5, 5, 0], ['Warband', 5, 6, 5, 0],
      ['Drummer', 3, 1, 3, 0, { text: 'Play: your Clubs get +1 attack.', effects: [{ op: 'buff', atk: 1, hp: 0, to: 'allySuit', suit: 'C' }] }],
      ['Recruiter', 4, 2, 3, 0, { text: 'Play: summon two 1/1 Conscripts nearby.', effects: [{ op: 'summon', n: 2 }] }],
      ['Warchief', 5, 4, 5, 0, { text: 'Play: all your Clubs may act this turn.', effects: [{ op: 'ready', to: 'allySuit', suit: 'C' }] }],
    ],
    D: [
      ['Handcart', 2, 2, 3, 0], ['Ram', 3, 4, 3, 0], ['Ladder Crew', 3, 3, 5, 0], ['Mangonel', 4, 5, 4, 0],
      ['Ballista Crew', 4, 4, 6, 0], ['Siege Engine', 5, 6, 5, 0], ['Trebuchet', 5, 7, 4, 0], ['Juggernaut', 6, 7, 7, 0],
      ['Behemoth', 7, 9, 6, 0], ['Colossus', 8, 10, 8, 0],
      ['Sapper', 4, 3, 3, 0, { target: 'enemySpade', text: 'Play: deal 4 damage to an enemy Spade.', effects: [{ op: 'damage', n: 4, to: 'target' }] }],
      ['Siege Master', 5, 3, 5, 0, { text: 'Play: your Diamonds get +1/+1.', effects: [{ op: 'buff', atk: 1, hp: 1, to: 'allySuit', suit: 'D' }] }],
      ['Siege Tower', 7, 5, 9, 0, { text: 'Play: deal 2 damage to all enemy Spades.', effects: [{ op: 'damage', n: 2, to: 'enemySuit', suit: 'S' }] }],
    ],
    H: [
      ['Slinger', 1, 1, 1, 0], ['Archer', 1, 1, 2, 0], ['Bowman', 2, 2, 2, 0], ['Longbow', 2, 2, 3, 0],
      ['Crossbow', 3, 3, 2, 0], ['Skirmisher', 3, 3, 3, 0], ['Marksman', 4, 4, 3, 0], ['Ranger', 4, 4, 4, 0],
      ['Sniper', 5, 5, 3, 0], ['Master Archer', 6, 6, 4, 0],
      ['Fletcher', 3, 1, 3, 0, { text: 'Play: draw a card.', effects: [{ op: 'draw', n: 1 }] }],
      ['Sharpshooter', 4, 3, 3, 0, { target: 'enemyFront', text: 'Play: deal 2 damage to an enemy front-row unit.', effects: [{ op: 'damage', n: 2, to: 'target' }] }],
      ['Hawkeye', 6, 5, 4, 0, { target: 'enemyUnit', text: 'Play: deal 3 damage to any enemy unit.', effects: [{ op: 'damage', n: 3, to: 'target' }] }],
    ],
  };

  const CARDS = {};
  for (const suit of Object.keys(T)) {
    T[suit].forEach((row, r) => {
      const [name, cost, atk, hp, armor, extra] = row;
      const id = suit + RANKS[r];
      CARDS[id] = Object.assign({ id, suit, rank: RANKS[r], name, cost, atk, hp, armor, text: '' }, extra);
      CARDS[id].kw = SUIT_KW[suit].concat((extra && extra.kw) || []);
    });
  }
  CARDS.TOK = { id: 'TOK', suit: 'C', rank: '', name: 'Conscript', cost: 0, atk: 1, hp: 1, armor: 0, text: '', kw: ['swarm'] };
  CARDS.KING = { id: 'KING', suit: null, rank: '♔', name: 'King', cost: 0, atk: 0, hp: KING_HP, armor: 0, text: 'Lose your king and you lose the game.', kw: [] };
  const DECK = Object.keys(CARDS).filter((id) => id !== 'TOK' && id !== 'KING');

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

  const rowLen = (r) => (r === 0 ? FRONT : BACK);
  const colOf = (r, i) => (r === 0 ? i : i + 1);
  const unitAt = (state, p, r, i) => (i >= 0 && i < rowLen(r) ? state.players[p].rows[r][i] : null);
  const unitOf = (state, ref) => unitAt(state, ref.p, ref.r, ref.i);
  const isKing = (u) => !!u && u.id === 'KING';
  const hasKw = (u, kw) => CARDS[u.id].kw.includes(kw);
  const suitOf = (u) => CARDS[u.id].suit;
  const unitName = (state, ref) => CARDS[unitOf(state, ref).id].name;

  function atkOf(state, p, r, i) {
    const u = unitAt(state, p, r, i);
    if (!u) return 0;
    let a = u.atk;
    if (hasKw(u, 'swarm')) {
      for (const d of [-1, 1]) { const n = unitAt(state, p, r, i + d); if (n && suitOf(n) === 'C') a += 1; }
    }
    return a;
  }

  function attackDamage(att, atkVal, def) {
    if (hasKw(att, 'breach')) return suitOf(def) === 'S' ? atkVal * 2 : atkVal;
    return Math.max(0, atkVal - def.armor);
  }

  function makeUnit(state, id) {
    const c = CARDS[id];
    return { uid: ++state.uid, id, atk: c.atk, hp: c.hp, maxHp: c.hp, armor: c.armor, ready: false };
  }

  // The first unit an attacker finds in a column: front row first, then the back row behind it.
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
      const pl = { mana: 0, maxMana: 0, deck: shuffle(state, DECK.slice()), hand: [], rows };
      rows[1][KING_I] = { uid: ++state.uid, id: 'KING', atk: 0, hp: KING_HP, maxHp: KING_HP, armor: 0, ready: false };
      state.players.push(pl);
    }
    for (let i = 0; i < 4; i++) draw(state, 0);
    for (let i = 0; i < 5; i++) draw(state, 1);
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
    const foe = allUnits(state, 1 - p);
    if (kind === 'enemyFront') return foe.filter((x) => x.r === 0);
    if (kind === 'enemyUnit') return foe;
    if (kind === 'enemySpade') return foe.filter((x) => suitOf(unitOf(state, x)) === 'S');
    return [];
  }

  function runEffects(state, effects, ctx) {
    for (const e of effects) {
      const king = state.players[ctx.p].rows[1][KING_I];
      if (e.op === 'draw') { for (let k = 0; k < e.n; k++) draw(state, ctx.p); }
      else if (e.op === 'healKing') king.hp = Math.min(king.maxHp, king.hp + e.n);
      else if (e.op === 'kingArmor') king.armor += e.n;
      else if (e.op === 'buff' || e.op === 'ready') {
        for (const ref of allUnits(state, ctx.p)) {
          const u = unitOf(state, ref);
          if (suitOf(u) !== e.suit) continue;
          if (e.op === 'ready') u.ready = true;
          else { u.atk += e.atk; u.hp += e.hp; u.maxHp += e.hp; }
        }
      } else if (e.op === 'damage') {
        const refs = e.to === 'target' ? (ctx.target ? [ctx.target] : [])
          : allUnits(state, 1 - ctx.p).filter((x) => suitOf(unitOf(state, x)) === e.suit);
        for (const ref of refs) { const u = unitOf(state, ref); if (u) u.hp -= e.n; }
      } else if (e.op === 'summon') {
        const free = [];
        state.players[ctx.p].rows[0].forEach((u, i) => { if (!u) free.push(i); });
        free.sort((a, b) => Math.abs(a - ctx.col) - Math.abs(b - ctx.col) || a - b);
        free.slice(0, e.n).forEach((i) => { state.players[ctx.p].rows[0][i] = makeUnit(state, 'TOK'); });
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

    me.hand.forEach((id, h) => {
      const c = CARDS[id];
      if (c.cost > me.mana) return;
      const targets = c.target ? validTargets(state, p, c.target) : [];
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

    if (a.t === 'play') {
      const id = me.hand[a.hand], c = CARDS[id];
      me.hand.splice(a.hand, 1);
      me.mana -= c.cost;
      const u = makeUnit(state, id);
      u.ready = c.kw.includes('swift');
      me.rows[a.cell.r][a.cell.i] = u;
      log(state, `Player ${p + 1} plays ${SYM[c.suit]}${c.rank} ${c.name} (${a.cell.r === 0 ? 'front' : 'back'} ${a.cell.i + 1}).`);
      if (c.effects) runEffects(state, c.effects, { p, col: colOf(a.cell.r, a.cell.i), target: a.target });
    } else if (a.t === 'move') {
      const u = me.rows[a.from.r][a.from.i];
      me.rows[a.from.r][a.from.i] = null;
      me.rows[a.cell.r][a.cell.i] = u;
      u.ready = false;
      log(state, `${CARDS[u.id].name} moves to ${a.cell.r === 0 ? 'front' : 'back'} ${a.cell.i + 1}.`);
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

  const api = { FRONT, BACK, KING_I, KING_HP, HAND_MAX, MAX_MANA, SYM, SUIT_ROLE, CARDS, DECK, newGame, legalActions, applyAction, clone, atkOf, hasKw, suitOf, isKing, sameRef, locEq, unitAt, unitOf, colOf, firstInColumn };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TBC = api;
})(typeof window !== 'undefined' ? window : globalThis);
