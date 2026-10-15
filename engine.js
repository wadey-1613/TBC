/* TBC rules engine — pure state + actions, no DOM. Browser: window.TBC. Node: require().
 *
 * A shared 7-wide x 9-deep battlefield. Player 0 starts on row 0 and marches toward row 8; player 1 the reverse.
 * Each player's king (the castle) sits in the middle of their back row. Win by killing the enemy king.
 *
 * Per turn:  deploy 1 infantry (free, top of the infantry deck, appears on your back row)
 *            reveal 1 squad card, then either play it (units appear on your back row) or hold it (hand max 3)
 *            play at most 1 squad card (revealed or from hand)
 *            move 1 unit one step (forward or sideways)
 *            every unit may attack once per turn (free)
 */
(function (root) {
  'use strict';

  const ROWS = 9, COLS = 7, KING_C = 3, KING_HP = 30, HAND_MAX = 3;
  const SYM = { S: '♠', C: '♣', D: '♦', H: '♥' };
  const SUIT_ROLE = { S: 'Defence', C: 'Offence', D: 'Siege', H: 'Long range' };
  const CLS_SYM = { melee: '⚔', ranged: '➶', defence: '▣' };
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  // ---------------------------------------------------------------- cards
  // Keywords:  breach    melee that ignores armour and does double to ♠
  //            ranged    hits enemies up to 2 tiles away, in front or beside (never behind), no retaliation
  //            artillery hits enemies up to 2 tiles away in ANY direction, no retaliation
  //            swift     its move doesn't use your one move per turn
  // Everything else is melee: it hits the 8 tiles around it, and the target strikes back.
  // Targets: enemyUnit | enemyInf | allyUnit | allyInf   (units only, never kings)
  const CARDS = {};
  const reg = (c) => { CARDS[c.id] = Object.assign({ kw: [], text: '', armor: 0, atk: 0, hp: 0 }, c); return CARDS[c.id]; };

  // ---- infantry (free, small stats)
  const INF = [
    ['iSword', 'Swordsman', 'melee', 2, 2, 0, 6], ['iBrute', 'Brute', 'melee', 3, 1, 0, 3], ['iSpear', 'Spearman', 'melee', 1, 3, 0, 3],
    ['iArcher', 'Archer', 'ranged', 2, 1, 0, 6], ['iSlinger', 'Slinger', 'ranged', 1, 2, 0, 6],
    ['iShield', 'Shieldman', 'defence', 1, 3, 1, 6], ['iGuard', 'Guard', 'defence', 0, 4, 1, 3], ['iPike', 'Pikeman', 'defence', 2, 2, 1, 3],
  ];
  const INF_DECK = [];
  for (const [id, name, cls, atk, hp, armor, n] of INF) {
    reg({ id, name, kind: 'unit', inf: true, cls, atk, hp, armor, kw: cls === 'ranged' ? ['ranged'] : [] });
    for (let k = 0; k < n; k++) INF_DECK.push(id);
  }

  // ---- squad deck (52 cards)
  const unit = (suit, rank, name, atk, hp, armor, extra) => reg(Object.assign({ id: suit + rank, suit, rank, name, kind: 'unit', atk, hp, armor }, extra));
  const spell = (suit, rank, name, text, effects, extra) => reg(Object.assign({ id: suit + rank, suit, rank, name, kind: 'spell', text, effects }, extra));
  const B = ['breach'], A = ['artillery'];

  // ♦ Siege — big units that break defences
  unit('D', 'A', 'Ram', 4, 3, 0, { kw: B });
  unit('D', '2', 'Ladder Crew', 3, 5, 0, { kw: B });
  unit('D', '3', 'Mangonel', 5, 3, 0, { kw: B });
  unit('D', '4', 'Ballista Cart', 5, 5, 0, { kw: B });
  unit('D', '5', 'Catapult', 6, 4, 0, { kw: B });
  unit('D', '6', 'Siege Engine', 6, 6, 0, { kw: B });
  unit('D', '7', 'Trebuchet', 8, 4, 0, { kw: B });
  unit('D', '8', 'Juggernaut', 8, 7, 0, { kw: B });
  unit('D', '9', 'Behemoth', 10, 8, 0, { kw: B });
  unit('D', '10', 'Colossus', 12, 10, 0, { kw: B });
  spell('D', 'J', 'Sapper Charge', 'Deal 6 damage to an enemy unit.', [{ op: 'damage', n: 6, to: 'target' }], { target: 'enemyUnit' });
  spell('D', 'Q', 'Battering Charge', 'Your Siege units may attack again and get +2 attack.', [{ op: 'rearm', to: 'allySuit', suit: 'D' }, { op: 'buff', atk: 2, hp: 0, to: 'allySuit', suit: 'D' }]);
  unit('D', 'K', 'Siege Master', 3, 6, 0, { kw: B, text: 'Play: your Siege units get +1/+1.', effects: [{ op: 'buff', atk: 1, hp: 1, to: 'allySuit', suit: 'D' }] });

  // ♠ Defence — fortresses and defensive boosts
  unit('S', 'A', 'Palisade', 0, 5, 1);
  unit('S', '2', 'Stone Wall', 0, 7, 2);
  unit('S', '3', 'Bulwark', 1, 9, 2);
  unit('S', '4', 'Fortress', 2, 12, 3);
  unit('S', '5', 'Citadel', 3, 16, 4);
  spell('S', '6', 'Field Hospital', 'Your king heals 6.', [{ op: 'healKing', n: 6 }]);
  spell('S', '7', 'Fortify', 'A unit gets +3 health and +1 armour.', [{ op: 'buff', atk: 0, hp: 3, armor: 1, to: 'target' }], { target: 'allyUnit' });
  spell('S', '8', 'Shield Wall', 'All your units get +1 armour.', [{ op: 'buff', atk: 0, hp: 0, armor: 1, to: 'allyUnits' }]);
  spell('S', '9', 'Reinforce', 'Restore all your units to full health.', [{ op: 'healAll' }]);
  spell('S', '10', 'Royal Guard', 'Your king gets +2 armour.', [{ op: 'kingArmor', n: 2 }]);
  unit('S', 'J', 'Bodyguard', 2, 6, 2, { text: 'Play: your king heals 4.', effects: [{ op: 'healKing', n: 4 }] });
  spell('S', 'Q', 'Engineers', 'Your Defence units get +3 health.', [{ op: 'buff', atk: 0, hp: 3, to: 'allySuit', suit: 'S' }]);
  unit('S', 'K', 'Warlord', 3, 10, 3, { text: 'Play: your king gets +1 armour.', effects: [{ op: 'kingArmor', n: 1 }] });

  // ♣ Offence — boosts for your infantry and commanders
  spell('C', 'A', 'Rally', 'Your infantry get +1 attack.', [{ op: 'buff', atk: 1, hp: 0, to: 'allyInf' }]);
  spell('C', '2', 'Sharpen Blades', 'A unit gets +2 attack.', [{ op: 'buff', atk: 2, hp: 0, to: 'target' }], { target: 'allyUnit' });
  spell('C', '3', 'Forced March', 'You may move 1 extra unit this turn.', [{ op: 'moves', n: 1 }]);
  spell('C', '4', 'Charge', 'A unit may attack again and gets +1 attack.', [{ op: 'rearm', to: 'target' }, { op: 'buff', atk: 1, hp: 0, to: 'target' }], { target: 'allyUnit' });
  spell('C', '5', 'Warhorn', 'All your units get +1/+1.', [{ op: 'buff', atk: 1, hp: 1, to: 'allyUnits' }]);
  spell('C', '6', 'Berserk', 'An infantry gets +3 attack.', [{ op: 'buff', atk: 3, hp: 0, to: 'target' }], { target: 'allyInf' });
  spell('C', '7', 'Reinforcements', 'Deploy 2 extra infantry this turn.', [{ op: 'deploy', n: 2 }]);
  spell('C', '8', 'Conscription', 'Immediately deploy 3 infantry.', [{ op: 'summonInf', n: 3 }]);
  spell('C', '9', 'Battle Cry', 'All your units may attack again.', [{ op: 'rearm', to: 'allyUnits' }]);
  spell('C', '10', 'Drums of War', 'Your infantry get +2 attack.', [{ op: 'buff', atk: 2, hp: 0, to: 'allyInf' }]);
  unit('C', 'J', 'Champion', 5, 4, 0, { kw: ['swift'], text: 'Moving it does not use your move.' });
  unit('C', 'Q', 'Captain', 3, 4, 0, { text: 'Play: your infantry get +1 attack.', effects: [{ op: 'buff', atk: 1, hp: 0, to: 'allyInf' }] });
  unit('C', 'K', 'General', 4, 6, 0, { text: 'Play: all your units get +1/+1.', effects: [{ op: 'buff', atk: 1, hp: 1, to: 'allyUnits' }] });

  // ♥ Long range — artillery that hits in every direction, plus tactics
  unit('H', 'A', 'Watchtower', 2, 4, 0, { kw: A });
  unit('H', '2', 'Longbowmen', 3, 3, 0, { kw: A });
  unit('H', '3', 'Crossbow Battery', 4, 3, 0, { kw: A });
  unit('H', '4', 'Heavy Crossbow', 5, 4, 0, { kw: A });
  unit('H', '5', 'Siege Archers', 6, 4, 0, { kw: A });
  spell('H', '6', 'Eagle Eye', 'Deal 3 damage to any enemy unit.', [{ op: 'damage', n: 3, to: 'target' }], { target: 'enemyUnit' });
  spell('H', '7', 'Volley', 'Deal 2 damage to all enemy infantry.', [{ op: 'damage', n: 2, to: 'enemyInf' }]);
  spell('H', '8', 'Arrow Storm', 'Deal 3 damage to all enemy units.', [{ op: 'damage', n: 3, to: 'enemyUnits' }]);
  spell('H', '9', 'Fire Arrows', 'Deal 4 damage to an enemy infantry.', [{ op: 'damage', n: 4, to: 'target' }], { target: 'enemyInf' });
  spell('H', '10', 'Spyglass', 'Draw 2 cards into your hand.', [{ op: 'draw', n: 2 }]);
  unit('H', 'J', 'Marksman', 4, 2, 0, { kw: A, target: 'enemyInf', text: 'Play: deal 2 damage to an enemy infantry.', effects: [{ op: 'damage', n: 2, to: 'target' }] });
  spell('H', 'Q', 'Scout Report', 'Draw a card into your hand.', [{ op: 'draw', n: 1 }]);
  unit('H', 'K', 'Master Archer', 6, 5, 0, { kw: A });

  CARDS.KING = { id: 'KING', kind: 'king', name: 'King', atk: 0, hp: KING_HP, armor: 0, kw: [], text: 'Lose your king and you lose the game.' };
  const DECK = Object.keys(CARDS).filter((id) => !CARDS[id].inf && id !== 'KING');

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
  const sameRef = (a, b) => !!a && !!b && a.r === b.r && a.c === b.c;
  const locEq = sameRef;
  const clone = (state) => { const l = state.log; state.log = null; const c = JSON.parse(JSON.stringify(state)); state.log = l; return c; };
  function log(state, msg) { if (state.log) { state.log.push(msg); if (state.log.length > 120) state.log.shift(); } }
  const cardLabel = (c) => (c.suit ? `${SYM[c.suit]}${c.rank} ` : '') + c.name;

  const backRow = (p) => (p === 0 ? 0 : ROWS - 1);
  const dirOf = (p) => (p === 0 ? 1 : -1);
  const inBounds = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
  const unitAt = (state, r, c) => (inBounds(r, c) ? state.board[r][c] : null);
  const isKing = (u) => !!u && u.id === 'KING';
  const hasKw = (u, kw) => CARDS[u.id].kw.includes(kw);
  const suitOf = (u) => CARDS[u.id].suit;
  const isInf = (u) => !!CARDS[u.id].inf;
  const kingOf = (state, p) => state.board[backRow(p)][KING_C];

  function allUnits(state, p) {
    const out = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const u = state.board[r][c]; if (u && u.p === p && !isKing(u)) out.push({ r, c }); }
    return out;
  }
  function spawnTiles(state, p) {
    const out = [], r = backRow(p);
    for (let c = 0; c < COLS; c++) if (!state.board[r][c]) out.push({ r, c });
    return out;
  }

  function inRange(u, from, to) {
    const dr = to.r - from.r, dc = to.c - from.c, d = Math.max(Math.abs(dr), Math.abs(dc));
    if (d < 1) return false;
    if (hasKw(u, 'artillery')) return d <= 2;
    if (hasKw(u, 'ranged')) return d <= 2 && dr * dirOf(u.p) >= 0;
    return d === 1;
  }
  const isMeleeUnit = (u) => !hasKw(u, 'artillery') && !hasKw(u, 'ranged');

  function attackDamage(att, def) {
    if (hasKw(att, 'breach')) return suitOf(def) === 'S' ? att.atk * 2 : att.atk;
    return Math.max(0, att.atk - def.armor);
  }
  const makeUnit = (state, p, id) => { const c = CARDS[id]; return { uid: ++state.uid, id, p, atk: c.atk, hp: c.hp, maxHp: c.hp, armor: c.armor, attacked: false, moved: false }; };

  function attackTargets(state, r, c) {
    const u = state.board[r][c], out = [];
    for (let rr = Math.max(0, r - 2); rr <= Math.min(ROWS - 1, r + 2); rr++) {
      for (let cc = Math.max(0, c - 2); cc <= Math.min(COLS - 1, c + 2); cc++) {
        const t = state.board[rr][cc];
        if (t && t.p !== u.p && inRange(u, { r, c }, { r: rr, c: cc })) out.push({ r: rr, c: cc });
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- setup / flow
  function newGame(seed) {
    const state = { rng: seed | 0, turn: 1, active: 0, winner: null, reason: '', uid: 0, log: [], board: [], players: [] };
    for (let r = 0; r < ROWS; r++) state.board.push(new Array(COLS).fill(null));
    for (let p = 0; p < 2; p++) {
      state.board[backRow(p)][KING_C] = { uid: ++state.uid, id: 'KING', p, atk: 0, hp: KING_HP, maxHp: KING_HP, armor: 0, attacked: true, moved: true };
      state.players.push({ deploys: 0, moves: 0, squadLeft: 0, revealed: null, deck: shuffle(state, DECK.slice()), infDeck: shuffle(state, INF_DECK.slice()), hand: [] });
    }
    startTurn(state);
    return state;
  }

  function loseBy(state, p, why) {
    if (state.winner != null) return;
    state.winner = 1 - p;
    state.reason = why;
    log(state, why);
  }

  function drawToHand(state, p) {
    const pl = state.players[p];
    if (!pl.deck.length) return loseBy(state, p, `Player ${p + 1} ran out of squad cards.`);
    const id = pl.deck.pop();
    if (pl.hand.length >= HAND_MAX) log(state, `Player ${p + 1}'s hand is full; ${CARDS[id].name} is discarded.`);
    else pl.hand.push(id);
  }

  function startTurn(state) {
    const p = state.active, pl = state.players[p];
    pl.deploys = state.turn === 2 ? 2 : 1; // the second player's first turn gets a bonus deploy
    pl.moves = 1;
    pl.squadLeft = 1;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const u = state.board[r][c]; if (u && u.p === p) { u.attacked = false; u.moved = false; } }
    log(state, `— Turn ${state.turn}: Player ${p + 1} —`);
    if (!pl.deck.length) loseBy(state, p, `Player ${p + 1} ran out of squad cards.`);
    else { pl.revealed = pl.deck.pop(); log(state, `Player ${p + 1} reveals ${cardLabel(CARDS[pl.revealed])}.`); }
    cleanup(state);
  }

  function endTurn(state) {
    const pl = state.players[state.active];
    if (pl.revealed) { log(state, `${CARDS[pl.revealed].name} is discarded.`); pl.revealed = null; }
    state.active = 1 - state.active;
    state.turn++;
    startTurn(state);
  }

  function cleanup(state) {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const u = state.board[r][c];
      if (u && u.hp <= 0 && !isKing(u)) { state.board[r][c] = null; log(state, `${CARDS[u.id].name} is destroyed.`); }
    }
    if (state.winner == null) {
      const k0 = kingOf(state, 0).hp <= 0, k1 = kingOf(state, 1).hp <= 0;
      if (k0 && k1) { state.winner = 2; state.reason = 'Both castles have fallen.'; }
      else if (k0) { state.winner = 1; state.reason = "Player 1's castle has fallen."; }
      else if (k1) { state.winner = 0; state.reason = "Player 2's castle has fallen."; }
      if (state.winner != null) log(state, state.reason);
    }
  }

  // ---------------------------------------------------------------- effects
  function validTargets(state, p, kind) {
    const side = kind.startsWith('ally') ? p : 1 - p;
    let refs = allUnits(state, side);
    if (kind.endsWith('Inf')) refs = refs.filter((x) => isInf(state.board[x.r][x.c]));
    return refs;
  }

  function resolveTargets(state, e, ctx) {
    const p = ctx.p, at = (x) => state.board[x.r][x.c];
    switch (e.to) {
      case 'target': return ctx.target && at(ctx.target) ? [ctx.target] : [];
      case 'allyUnits': return allUnits(state, p);
      case 'allyInf': return allUnits(state, p).filter((x) => isInf(at(x)));
      case 'allySuit': return allUnits(state, p).filter((x) => suitOf(at(x)) === e.suit);
      case 'enemyInf': return allUnits(state, 1 - p).filter((x) => isInf(at(x)));
      case 'enemyUnits': return allUnits(state, 1 - p);
      default: return [];
    }
  }

  function placeUnit(state, p, id, cell) {
    state.board[cell.r][cell.c] = makeUnit(state, p, id);
    return CARDS[id];
  }

  function runEffects(state, effects, ctx) {
    for (const e of effects) {
      const pl = state.players[ctx.p], king = kingOf(state, ctx.p), at = (x) => state.board[x.r][x.c];
      switch (e.op) {
        case 'draw': for (let k = 0; k < e.n; k++) drawToHand(state, ctx.p); break;
        case 'healKing': king.hp = Math.min(king.maxHp, king.hp + e.n); break;
        case 'kingArmor': king.armor += e.n; break;
        case 'deploy': pl.deploys += e.n; break;
        case 'moves': pl.moves += e.n; break;
        case 'healAll': for (const x of allUnits(state, ctx.p)) at(x).hp = at(x).maxHp; break;
        case 'summonInf': {
          const free = spawnTiles(state, ctx.p).sort((a, b) => Math.abs(a.c - KING_C) - Math.abs(b.c - KING_C) || a.c - b.c);
          for (const cell of free.slice(0, Math.min(e.n, pl.infDeck.length))) { const c = placeUnit(state, ctx.p, pl.infDeck.pop(), cell); log(state, `${c.name} is conscripted.`); }
          break;
        }
        case 'damage': for (const x of resolveTargets(state, e, ctx)) at(x).hp -= e.n; break;
        case 'rearm': for (const x of resolveTargets(state, e, ctx)) at(x).attacked = false; break;
        case 'buff':
          for (const x of resolveTargets(state, e, ctx)) {
            const u = at(x);
            u.atk += e.atk || 0; u.hp += e.hp || 0; u.maxHp += e.hp || 0; u.armor += e.armor || 0;
          }
          break;
        default: break;
      }
    }
  }

  // ---------------------------------------------------------------- legal actions
  // hand: -1 = the revealed card, 0..2 = a card in hand
  function legalActions(state) {
    if (state.winner != null) return [];
    const p = state.active, pl = state.players[p], acts = [];
    const spawns = spawnTiles(state, p);

    if (pl.deploys > 0 && pl.infDeck.length) for (const cell of spawns) acts.push({ t: 'deploy', cell });

    if (pl.squadLeft > 0) {
      const sources = pl.hand.map((id, i) => ({ id, i }));
      if (pl.revealed) sources.push({ id: pl.revealed, i: -1 });
      for (const { id, i } of sources) {
        const c = CARDS[id];
        const targets = c.target ? validTargets(state, p, c.target) : [];
        if (c.kind === 'spell') {
          if (c.target) targets.forEach((target) => acts.push({ t: 'play', hand: i, target }));
          else acts.push({ t: 'play', hand: i });
        } else {
          for (const cell of spawns) {
            if (targets.length) targets.forEach((target) => acts.push({ t: 'play', hand: i, cell, target }));
            else acts.push({ t: 'play', hand: i, cell });
          }
        }
      }
    }
    if (pl.revealed && pl.hand.length < HAND_MAX) acts.push({ t: 'hold' });

    const dir = dirOf(p);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const u = state.board[r][c];
      if (!u || u.p !== p || isKing(u)) continue;
      if (!u.moved && (pl.moves > 0 || hasKw(u, 'swift'))) {
        for (const [dr, dc] of [[dir, 0], [0, -1], [0, 1]]) {
          const nr = r + dr, nc = c + dc;
          if (inBounds(nr, nc) && !state.board[nr][nc]) acts.push({ t: 'move', from: { r, c }, cell: { r: nr, c: nc } });
        }
      }
      if (!u.attacked && u.atk > 0) attackTargets(state, r, c).forEach((target) => acts.push({ t: 'attack', from: { r, c }, target }));
    }

    acts.push({ t: 'end' });
    return acts;
  }

  const tileName = (c) => `r${c.r + 1}c${c.c + 1}`;

  function applyAction(state, a) {
    const key = JSON.stringify(a);
    if (!legalActions(state).some((x) => JSON.stringify(x) === key)) throw new Error('Illegal action ' + key);
    const p = state.active, pl = state.players[p];

    if (a.t === 'end') { endTurn(state); return state; }

    if (a.t === 'deploy') {
      pl.deploys--;
      const c = placeUnit(state, p, pl.infDeck.pop(), a.cell);
      log(state, `Player ${p + 1} deploys ${c.name}.`);
    } else if (a.t === 'hold') {
      pl.hand.push(pl.revealed);
      log(state, `Player ${p + 1} holds ${CARDS[pl.revealed].name}.`);
      pl.revealed = null;
    } else if (a.t === 'play') {
      let id;
      if (a.hand === -1) { id = pl.revealed; pl.revealed = null; } else { id = pl.hand[a.hand]; pl.hand.splice(a.hand, 1); }
      pl.squadLeft--;
      const c = CARDS[id];
      if (c.kind === 'unit') {
        placeUnit(state, p, id, a.cell);
        log(state, `Player ${p + 1} fields ${cardLabel(c)}.`);
      } else {
        log(state, `Player ${p + 1} plays ${cardLabel(c)}.`);
      }
      if (c.effects) runEffects(state, c.effects, { p, target: a.target });
    } else if (a.t === 'move') {
      const u = state.board[a.from.r][a.from.c];
      state.board[a.from.r][a.from.c] = null;
      state.board[a.cell.r][a.cell.c] = u;
      u.moved = true;
      if (!hasKw(u, 'swift')) pl.moves--;
      log(state, `${CARDS[u.id].name} advances to ${tileName(a.cell)}.`);
    } else if (a.t === 'attack') {
      const att = state.board[a.from.r][a.from.c], def = state.board[a.target.r][a.target.c];
      att.attacked = true;
      const dmg = attackDamage(att, def);
      def.hp -= dmg;
      log(state, `${CARDS[att.id].name} hits ${CARDS[def.id].name} for ${dmg}${dmg === 0 ? ' (blocked by armour)' : ''}.`);
      if (isMeleeUnit(att) && def.atk > 0) {
        const back = attackDamage(def, att);
        att.hp -= back;
        if (back) log(state, `${CARDS[def.id].name} strikes back for ${back}.`);
      }
    }
    cleanup(state);
    return state;
  }

  const api = { ROWS, COLS, KING_C, KING_HP, HAND_MAX, SYM, SUIT_ROLE, CLS_SYM, CARDS, DECK, INF_DECK, newGame, legalActions, applyAction, clone, hasKw, suitOf, isKing, isInf, sameRef, locEq, backRow, dirOf, kingOf, inRange, attackTargets, spawnTiles };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TBC = api;
})(typeof window !== 'undefined' ? window : globalThis);
