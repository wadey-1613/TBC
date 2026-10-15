/* TBC rules engine — pure state + actions, no DOM. Browser: window.TBC. Node: require().
 *
 * A shared 7-wide x 8-deep battlefield. Player 0 starts on row 0 and marches toward row 7; player 1 the reverse.
 * Each player's king (the castle) sits in the middle of their back row. Win by killing the enemy king.
 *
 * Per turn:  you are offered 3 infantry: deploy 1 (free, appears on your back row), recycle 1 to the
 *            bottom of the infantry deck, and the third is discarded
 *            you are offered 2 squad cards: use 1 (play it, or hold it in your hand, max 3), the other is discarded
 *            infantry offers can also be HELD in your hand (shared hand of max 3)
 *            you may play 1 card from your hand per turn (a held squad card or a held infantry); playing the
 *            squad card you were offered this turn doesn't use that up
 *            move up to 3 different units (one step each; rogues two), but only units that were already on the
 *            board when your turn began; anything placed this turn is 'fresh' and can't move
 *            every unit may attack once (free); rogues can't attack but lay one trap each
 *            a deck that runs out is rebuilt by shuffling its own discard pile; the only win is the enemy castle
 */
(function (root) {
  'use strict';

  const ROWS = 8, COLS = 7, KING_C = 3, KING_HP = 30, HAND_MAX = 3, MOVES = 3, MAX_TURNS = 300;
  const DEFENCE_ZONE = 2, MAX_TRAPS = 5;
  const SYM = { S: '♠', C: '♣', D: '♦', H: '♥' };
  const SUIT_ROLE = { S: 'Defence', C: 'Offence', D: 'Siege', H: 'Long range' };
  const CLS_SYM = { melee: '⚔', ranged: '➶', defence: '▣', rogue: '🗡' };
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  // Traps are laid by rogues on an empty tile next to them. An enemy unit that enters the tile springs it.
  const TRAPS = {
    poison: { name: 'Poison Trap', sym: '☠', text: '1 damage at the start of each of its owner\'s next 2 turns' },
    sticky: { name: 'Sticky Trap', sym: '🕸', text: 'can\'t move on its owner\'s next turn' },
    flash: { name: 'Flash Trap', sym: '✦', text: 'can\'t attack on its owner\'s next turn' },
  };

  // ---------------------------------------------------------------- cards
  // Every unit attacks with ONE of three reach shapes (forward = toward the enemy castle):
  //   melee   the 8 tiles around it
  //   range   the 2nd and 3rd rows ahead, 3 tiles wide (the row right in front is a blind spot)
  //   defence the 3 tiles in front, plus left and right (nothing behind)
  //   none    rogues: they can't attack
  // Keywords:  breach  ignores armour and does double damage to ♠
  //            swift   its move doesn't use up one of your moves
  // A defender strikes back only if the attacker is adjacent AND inside the defender's own shape.
  // Targets: enemyUnit | enemyInf are enemies inside the reach of one of YOUR units. allyUnit | allyInf are yours.
  // Defence units (infantry and ♠) may be placed anywhere within DEFENCE_ZONE tiles of your king.
  const CARDS = {};
  const reg = (c) => { CARDS[c.id] = Object.assign({ kw: [], text: '', armor: 0, atk: 0, hp: 0 }, c); return CARDS[c.id]; };

  // ---- infantry (free, small stats)
  const INF = [
    ['iSword', 'Swordsman', 'melee', 2, 2, 0, 5], ['iBrute', 'Brute', 'melee', 3, 1, 0, 3], ['iSpear', 'Spearman', 'melee', 1, 3, 0, 2],
    ['iArcher', 'Archer', 'ranged', 2, 1, 0, 5], ['iSlinger', 'Slinger', 'ranged', 1, 2, 0, 5],
    ['iShield', 'Shieldman', 'defence', 1, 3, 1, 5], ['iGuard', 'Guard', 'defence', 0, 4, 1, 3], ['iPike', 'Pikeman', 'defence', 2, 2, 1, 2],
  ];
  const INF_DECK = [];
  for (const [id, name, cls, atk, hp, armor, n] of INF) {
    reg({ id, name, kind: 'unit', inf: true, cls, atk, hp, armor, reach: cls === 'ranged' ? 'range' : cls === 'defence' ? 'defence' : 'melee' });
    for (let k = 0; k < n; k++) INF_DECK.push(id);
  }
  // rogues: can't attack, move up to 2 tiles, lay one trap a turn
  for (const [id, name, trap] of [['iPoisoner', 'Poisoner', 'poison'], ['iTrapper', 'Trapper', 'sticky'], ['iSaboteur', 'Saboteur', 'flash']]) {
    reg({ id, name, kind: 'unit', inf: true, cls: 'rogue', atk: 0, hp: 2, armor: 0, reach: 'none', speed: 2, trap, text: `Moves 2. Lays a ${TRAPS[trap].name} each turn. Cannot attack.` });
    INF_DECK.push(id, id);
  }

  // ---- squad deck (52 cards)
  const unit = (suit, rank, name, atk, hp, armor, extra) => reg(Object.assign({ id: suit + rank, suit, rank, name, kind: 'unit', atk, hp, armor }, extra));
  const spell = (suit, rank, name, text, effects, extra) => reg(Object.assign({ id: suit + rank, suit, rank, name, kind: 'spell', text, effects }, extra));
  const B = ['breach'];
  const LOB = 'Siege lob: hits the 2nd and 3rd rows ahead.';

  // ♦ Siege — big units that break defences
  unit('D', 'A', 'Ram', 4, 3, 0, { kw: B });
  unit('D', '2', 'Ladder Crew', 3, 5, 0, { kw: B });
  unit('D', '3', 'Mangonel', 5, 3, 0, { kw: B, reach: 'range', text: LOB });
  unit('D', '4', 'Ballista Cart', 5, 5, 0, { kw: B });
  unit('D', '5', 'Catapult', 6, 4, 0, { kw: B, reach: 'range', text: LOB });
  unit('D', '6', 'Siege Engine', 6, 6, 0, { kw: B });
  unit('D', '7', 'Trebuchet', 8, 4, 0, { kw: B, reach: 'range', text: LOB });
  unit('D', '8', 'Juggernaut', 8, 7, 0, { kw: B });
  unit('D', '9', 'Behemoth', 10, 8, 0, { kw: B });
  unit('D', '10', 'Colossus', 12, 10, 0, { kw: B });
  spell('D', 'J', 'Sapper Charge', 'Deal 6 damage to an enemy unit in your reach.', [{ op: 'damage', n: 6, to: 'target' }], { target: 'enemyUnit' });
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
  spell('C', '3', 'Forced March', 'You may make 1 extra move this turn.', [{ op: 'moves', n: 1 }]);
  spell('C', '4', 'Charge', 'A unit may attack again and gets +1 attack.', [{ op: 'rearm', to: 'target' }, { op: 'buff', atk: 1, hp: 0, to: 'target' }], { target: 'allyUnit' });
  spell('C', '5', 'Warhorn', 'All your units get +1/+1.', [{ op: 'buff', atk: 1, hp: 1, to: 'allyUnits' }]);
  spell('C', '6', 'Berserk', 'An infantry gets +3 attack.', [{ op: 'buff', atk: 3, hp: 0, to: 'target' }], { target: 'allyInf' });
  spell('C', '7', 'Reinforcements', 'A second infantry offer: draw 3 more, deploy one, recycle one, discard one.', [{ op: 'infOffer' }]);
  spell('C', '8', 'Conscription', 'Immediately deploy 3 infantry.', [{ op: 'summonInf', n: 3 }]);
  spell('C', '9', 'Battle Cry', 'All your units may attack again.', [{ op: 'rearm', to: 'allyUnits' }]);
  spell('C', '10', 'Drums of War', 'Your infantry get +2 attack.', [{ op: 'buff', atk: 2, hp: 0, to: 'allyInf' }]);
  unit('C', 'J', 'Champion', 5, 4, 0, { kw: ['swift'], text: 'Moving it does not use up one of your moves.' });
  unit('C', 'Q', 'Captain', 3, 4, 0, { text: 'Play: your infantry get +1 attack.', effects: [{ op: 'buff', atk: 1, hp: 0, to: 'allyInf' }] });
  unit('C', 'K', 'General', 4, 6, 0, { text: 'Play: all your units get +1/+1.', effects: [{ op: 'buff', atk: 1, hp: 1, to: 'allyUnits' }] });

  // ♥ Long range — archers and crossbows that shoot over the front line, plus tactics
  unit('H', 'A', 'Watchtower', 2, 4, 0);
  unit('H', '2', 'Longbowmen', 3, 3, 0);
  unit('H', '3', 'Crossbow Battery', 4, 3, 0);
  unit('H', '4', 'Heavy Crossbow', 5, 4, 0);
  unit('H', '5', 'Siege Archers', 6, 4, 0);
  spell('H', '6', 'Eagle Eye', 'Deal 3 damage to an enemy unit in your reach.', [{ op: 'damage', n: 3, to: 'target' }], { target: 'enemyUnit' });
  spell('H', '7', 'Volley', 'Deal 2 damage to all enemy infantry in your reach.', [{ op: 'damage', n: 2, to: 'enemyInf' }]);
  spell('H', '8', 'Arrow Storm', 'Deal 3 damage to all enemy units in your reach.', [{ op: 'damage', n: 3, to: 'enemyUnits' }]);
  spell('H', '9', 'Fire Arrows', 'Deal 4 damage to an enemy infantry in your reach.', [{ op: 'damage', n: 4, to: 'target' }], { target: 'enemyInf' });
  spell('H', '10', 'Spyglass', 'Draw 2 cards into your hand.', [{ op: 'draw', n: 2 }]);
  unit('H', 'J', 'Marksman', 4, 2, 0, { target: 'enemyInf', text: 'Play: deal 2 damage to an enemy infantry in your reach.', effects: [{ op: 'damage', n: 2, to: 'target' }] });
  spell('H', 'Q', 'Scout Report', 'Draw a card into your hand.', [{ op: 'draw', n: 1 }]);
  unit('H', 'K', 'Master Archer', 6, 5, 0);

  for (const id of Object.keys(CARDS)) {
    const c = CARDS[id];
    if (!c.reach) c.reach = c.suit === 'S' ? 'defence' : c.suit === 'H' ? 'range' : 'melee';
  }

  CARDS.KING = { id: 'KING', kind: 'king', name: 'King', reach: 'melee', atk: 0, hp: KING_HP, armor: 0, kw: [], text: 'Lose your king and you lose the game.' };
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
  const isKing = (u) => !!u && u.id === 'KING';
  const hasKw = (u, kw) => CARDS[u.id].kw.includes(kw);
  const suitOf = (u) => CARDS[u.id].suit;
  const isInf = (u) => !!CARDS[u.id].inf;
  const kingOf = (state, p) => state.board[backRow(p)][KING_C];
  const unitAt = (state, r, c) => (inBounds(r, c) ? state.board[r][c] : null);
  const trapAt = (state, r, c) => state.traps.find((t) => t.r === r && t.c === c) || null;
  const ownTrapAt = (state, p, r, c) => { const t = trapAt(state, r, c); return !!t && t.p === p; };

  function allUnits(state, p) {
    const out = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const u = state.board[r][c]; if (u && u.p === p && !isKing(u)) out.push({ r, c }); }
    return out;
  }

  // Back-row tiles where any new card may appear (never on your own traps)
  function spawnTiles(state, p) {
    const out = [], r = backRow(p);
    for (let c = 0; c < COLS; c++) if (!state.board[r][c] && !ownTrapAt(state, p, r, c)) out.push({ r, c });
    return out;
  }
  // Defence units may also go anywhere within DEFENCE_ZONE tiles of your king
  function spawnTilesFor(state, p, id) {
    const out = spawnTiles(state, p), card = CARDS[id];
    if (card.kind === 'unit' && card.reach === 'defence') {
      const kr = backRow(p);
      for (let r = kr - DEFENCE_ZONE; r <= kr + DEFENCE_ZONE; r++) for (let c = KING_C - DEFENCE_ZONE; c <= KING_C + DEFENCE_ZONE; c++) {
        if (inBounds(r, c) && !state.board[r][c] && !ownTrapAt(state, p, r, c) && !out.some((t) => t.r === r && t.c === c)) out.push({ r, c });
      }
    }
    return out;
  }

  // is `to` inside the reach shape of unit `u` standing at `from`?
  function inRange(u, from, to) {
    const dr = to.r - from.r, dc = to.c - from.c, fwd = dr * dirOf(u.p), side = Math.abs(dc);
    switch (CARDS[u.id].reach) {
      case 'none': return false;
      case 'range': return (fwd === 2 || fwd === 3) && side <= 1;
      case 'defence': return (fwd === 1 && side <= 1) || (fwd === 0 && side === 1);
      default: return Math.max(Math.abs(dr), side) === 1;
    }
  }
  // every tile of the board inside a unit's reach shape (for the UI)
  function reachTiles(state, r, c) {
    const u = state.board[r][c], out = [];
    for (let rr = 0; rr < ROWS; rr++) for (let cc = 0; cc < COLS; cc++) if (inRange(u, { r, c }, { r: rr, c: cc })) out.push({ r: rr, c: cc });
    return out;
  }

  function attackDamage(att, def) {
    if (hasKw(att, 'breach')) return suitOf(def) === 'S' ? att.atk * 2 : att.atk;
    return Math.max(0, att.atk - def.armor);
  }
  const makeUnit = (state, p, id) => {
    const c = CARDS[id];
    return { uid: ++state.uid, id, p, atk: c.atk, hp: c.hp, maxHp: c.hp, armor: c.armor, attacked: false, moved: false, fresh: true, trapped: false, poison: 0, stuck: 0, blind: 0, immobile: false, disarmed: false };
  };

  function attackTargets(state, r, c) {
    const u = state.board[r][c], out = [];
    for (let rr = Math.max(0, r - 3); rr <= Math.min(ROWS - 1, r + 3); rr++) {
      for (let cc = Math.max(0, c - 3); cc <= Math.min(COLS - 1, c + 3); cc++) {
        const t = state.board[rr][cc];
        if (t && t.p !== u.p && inRange(u, { r, c }, { r: rr, c: cc })) out.push({ r: rr, c: cc });
      }
    }
    return out;
  }

  // tiles a unit may move to this turn: forward, left or right (never back), up to its speed, through empty tiles.
  // An enemy trap stops the unit on it; your own traps can't be entered.
  function moveDests(state, r, c) {
    const u = state.board[r][c], dir = dirOf(u.p), speed = CARDS[u.id].speed || 1;
    const out = [], seen = new Set([r * COLS + c]);
    let frontier = [{ r, c }];
    for (let step = 0; step < speed; step++) {
      const next = [];
      for (const t of frontier) {
        for (const [dr, dc] of [[dir, 0], [0, -1], [0, 1]]) {
          const nr = t.r + dr, nc = t.c + dc;
          if (!inBounds(nr, nc) || state.board[nr][nc] || seen.has(nr * COLS + nc) || ownTrapAt(state, u.p, nr, nc)) continue;
          seen.add(nr * COLS + nc);
          out.push({ r: nr, c: nc });
          if (!trapAt(state, nr, nc)) next.push({ r: nr, c: nc });
        }
      }
      frontier = next;
    }
    return out;
  }

  // ---------------------------------------------------------------- setup / flow
  function newGame(seed) {
    const state = { rng: seed | 0, turn: 1, active: 0, winner: null, reason: '', uid: 0, log: [], board: [], traps: [], players: [] };
    for (let r = 0; r < ROWS; r++) state.board.push(new Array(COLS).fill(null));
    for (let p = 0; p < 2; p++) {
      state.board[backRow(p)][KING_C] = { uid: ++state.uid, id: 'KING', p, atk: 0, hp: KING_HP, maxHp: KING_HP, armor: 0, attacked: true, moved: true, fresh: false, trapped: true, poison: 0, stuck: 0, blind: 0, immobile: false, disarmed: false };
      state.players.push({ deploys: 0, moves: 0, handLeft: 0, recycles: 0, infOfferId: 0, infOffer: [], squadOffer: [], deck: shuffle(state, DECK.slice()), infDeck: shuffle(state, INF_DECK.slice()), hand: [], infDiscard: [], squadDiscard: [] });
    }
    startTurn(state);
    return state;
  }

  // when a deck is empty, shuffle that player's discard pile back in as the new deck
  function refill(state, p, deckKey, discardKey) {
    const pl = state.players[p];
    if (!pl[deckKey].length && pl[discardKey].length) {
      pl[deckKey] = shuffle(state, pl[discardKey].splice(0));
      log(state, `Player ${p + 1} shuffles ${pl[deckKey].length} discarded ${deckKey === 'deck' ? 'squad' : 'infantry'} cards into a new deck.`);
    }
    return pl[deckKey].length > 0;
  }

  function drawToHand(state, p) {
    const pl = state.players[p];
    if (!refill(state, p, 'deck', 'squadDiscard')) return;
    const id = pl.deck.pop();
    if (pl.hand.length >= HAND_MAX) { pl.squadDiscard.push(id); log(state, `Player ${p + 1}'s hand is full; ${CARDS[id].name} is discarded.`); }
    else pl.hand.push(id);
  }

  function startTurn(state) {
    const p = state.active, pl = state.players[p];
    pl.deploys = 1;
    pl.moves = MOVES;
    pl.handLeft = 1;
    pl.recycles = 1;
    pl.infOfferId++;
    log(state, `— Turn ${state.turn}: Player ${p + 1} —`);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const u = state.board[r][c];
      if (!u || u.p !== p) continue;
      u.attacked = false; u.moved = false; u.fresh = false; u.trapped = false;
      if (u.poison > 0) { u.hp -= 1; u.poison--; log(state, `${CARDS[u.id].name} takes 1 poison damage.`); }
      u.immobile = u.stuck > 0; if (u.stuck > 0) u.stuck--;
      u.disarmed = u.blind > 0; if (u.blind > 0) u.blind--;
    }
    pl.infOffer = [];
    while (pl.infOffer.length < 3 && refill(state, p, 'infDeck', 'infDiscard')) pl.infOffer.push(pl.infDeck.pop());
    pl.squadOffer = [];
    while (pl.squadOffer.length < 2 && refill(state, p, 'deck', 'squadDiscard')) pl.squadOffer.push(pl.deck.pop());
    log(state, `Player ${p + 1} is offered ${pl.infOffer.length} infantry and ${pl.squadOffer.length ? pl.squadOffer.map((id) => CARDS[id].name).join(' / ') : 'no squad cards'}.`);
    cleanup(state);
  }

  function endTurn(state) {
    const pl = state.players[state.active];
    if (pl.infOffer.length) { pl.infDiscard.push(...pl.infOffer); log(state, `${pl.infOffer.length} unused infantry discarded.`); pl.infOffer = []; }
    if (pl.squadOffer.length) { pl.squadDiscard.push(...pl.squadOffer); log(state, `${pl.squadOffer.map((id) => CARDS[id].name).join(' / ')} discarded.`); pl.squadOffer = []; }
    state.active = 1 - state.active;
    state.turn++;
    if (state.turn > MAX_TURNS && state.winner == null) { state.winner = 2; state.reason = 'Stalemate: nobody took the castle.'; log(state, state.reason); return; }
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

  // ---------------------------------------------------------------- traps
  function enterTile(state, u, r, c) {
    const t = trapAt(state, r, c);
    if (!t || t.p === u.p) return;
    state.traps.splice(state.traps.indexOf(t), 1);
    if (t.type === 'poison') u.poison = 2;
    else if (t.type === 'sticky') u.stuck = 1;
    else if (t.type === 'flash') u.blind = 1;
    log(state, `${CARDS[u.id].name} springs a ${TRAPS[t.type].name}!`);
  }

  function layTrap(state, p, cell, type) {
    state.traps.push({ p, r: cell.r, c: cell.c, type });
    const mine = state.traps.filter((t) => t.p === p);
    if (mine.length > MAX_TRAPS) state.traps.splice(state.traps.indexOf(mine[0]), 1); // the oldest one is lost
  }

  // ---------------------------------------------------------------- effects
  function enemiesInReach(state, p) {
    const seen = new Set(), out = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const u = state.board[r][c];
      if (!u || u.p !== p || isKing(u) || u.atk <= 0) continue;
      for (const t of attackTargets(state, r, c)) {
        const e = state.board[t.r][t.c], key = t.r * COLS + t.c;
        if (!isKing(e) && !seen.has(key)) { seen.add(key); out.push(t); }
      }
    }
    return out;
  }

  function validTargets(state, p, kind) {
    let refs = kind.startsWith('ally') ? allUnits(state, p) : enemiesInReach(state, p);
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
      case 'enemyInf': return enemiesInReach(state, p).filter((x) => isInf(at(x)));
      case 'enemyUnits': return enemiesInReach(state, p);
      default: return [];
    }
  }

  function placeUnit(state, p, id, cell) {
    const u = makeUnit(state, p, id);
    state.board[cell.r][cell.c] = u;
    enterTile(state, u, cell.r, cell.c);
    return CARDS[id];
  }

  function runEffects(state, effects, ctx) {
    for (const e of effects) {
      const pl = state.players[ctx.p], king = kingOf(state, ctx.p), at = (x) => state.board[x.r][x.c];
      switch (e.op) {
        case 'draw': for (let k = 0; k < e.n; k++) drawToHand(state, ctx.p); break;
        case 'healKing': king.hp = Math.min(king.maxHp, king.hp + e.n); break;
        case 'kingArmor': king.armor += e.n; break;
        case 'infOffer': {
          for (let k = 0; k < 3 && refill(state, ctx.p, 'infDeck', 'infDiscard'); k++) pl.infOffer.push(pl.infDeck.pop());
          pl.deploys += 1; pl.recycles += 1; pl.infOfferId++;
          break;
        }
        case 'moves': pl.moves += e.n; break;
        case 'healAll': for (const x of allUnits(state, ctx.p)) at(x).hp = at(x).maxHp; break;
        case 'summonInf': {
          const free = spawnTiles(state, ctx.p).sort((a, b) => Math.abs(a.c - KING_C) - Math.abs(b.c - KING_C) || a.c - b.c);
          let left = e.n;
          for (const cell of free) {
            if (left <= 0 || !refill(state, ctx.p, 'infDeck', 'infDiscard')) break;
            const c = placeUnit(state, ctx.p, pl.infDeck.pop(), cell);
            log(state, `${c.name} is conscripted.`);
            left--;
          }
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
  // hand: 0..2 = a card in hand; -1 / -2 = the first / second card of this turn's squad offer
  function legalActions(state) {
    if (state.winner != null) return [];
    const p = state.active, pl = state.players[p], acts = [];

    if (pl.deploys > 0) pl.infOffer.forEach((id, pick) => { for (const cell of spawnTilesFor(state, p, id)) acts.push({ t: 'deploy', pick, cell }); });
    if (pl.recycles > 0) pl.infOffer.forEach((id, pick) => acts.push({ t: 'recycle', pick }));
    pl.infOffer.forEach((id, pick) => acts.push({ t: 'discardInf', pick }));
    if (pl.hand.length < HAND_MAX) pl.infOffer.forEach((id, pick) => acts.push({ t: 'holdInf', pick }));
    pl.squadOffer.forEach((id, pick) => acts.push({ t: 'discardSquad', pick }));

    {
      const sources = pl.handLeft > 0 ? pl.hand.map((id, i) => ({ id, i })) : [];
      pl.squadOffer.forEach((id, k) => sources.push({ id, i: -1 - k }));
      for (const { id, i } of sources) {
        const c = CARDS[id];
        const targets = c.target ? validTargets(state, p, c.target) : [];
        const area = c.kind === 'spell' && (c.effects || []).find((e) => e.op === 'damage' && e.to !== 'target');
        if (area && !resolveTargets(state, area, { p }).length) continue; // area strikes need something in reach
        if (c.kind === 'spell') {
          if (c.target) targets.forEach((target) => acts.push({ t: 'play', hand: i, target }));
          else acts.push({ t: 'play', hand: i });
        } else {
          for (const cell of spawnTilesFor(state, p, id)) {
            if (targets.length) targets.forEach((target) => acts.push({ t: 'play', hand: i, cell, target }));
            else acts.push({ t: 'play', hand: i, cell });
          }
        }
      }
    }
    if (pl.hand.length < HAND_MAX) pl.squadOffer.forEach((id, pick) => acts.push({ t: 'hold', pick }));

    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const u = state.board[r][c];
      if (!u || u.p !== p || isKing(u)) continue;
      if (!u.moved && !u.fresh && !u.immobile && (pl.moves > 0 || hasKw(u, 'swift'))) {
        for (const cell of moveDests(state, r, c)) acts.push({ t: 'move', from: { r, c }, cell });
      }
      if (!u.attacked && !u.disarmed && u.atk > 0) attackTargets(state, r, c).forEach((target) => acts.push({ t: 'attack', from: { r, c }, target }));
      if (CARDS[u.id].trap && !u.trapped) {
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc;
          if ((dr || dc) && inBounds(nr, nc) && !state.board[nr][nc] && !trapAt(state, nr, nc)) acts.push({ t: 'trap', from: { r, c }, cell: { r: nr, c: nc } });
        }
      }
    }

    acts.push({ t: 'end' });
    return acts;
  }

  const tileName = (c) => `r${c.r + 1}c${c.c + 1}`;

  // `trusted` skips the legality check; the AI passes it for actions it just took from legalActions()
  function applyAction(state, a, trusted) {
    if (!trusted) {
      const key = JSON.stringify(a);
      if (!legalActions(state).some((x) => JSON.stringify(x) === key)) throw new Error('Illegal action ' + key);
    }
    const p = state.active, pl = state.players[p];

    if (a.t === 'end') { endTurn(state); return state; }

    if (a.t === 'deploy') {
      pl.deploys--;
      const c = placeUnit(state, p, pl.infOffer.splice(a.pick, 1)[0], a.cell);
      log(state, `Player ${p + 1} deploys ${c.name}.`);
    } else if (a.t === 'recycle') {
      const id = pl.infOffer.splice(a.pick, 1)[0];
      pl.infDeck.unshift(id); // bottom of the deck
      pl.recycles--;
      log(state, `Player ${p + 1} recycles ${CARDS[id].name} to the bottom of the infantry deck.`);
    } else if (a.t === 'holdInf') {
      const id = pl.infOffer.splice(a.pick, 1)[0];
      pl.hand.push(id);
      log(state, `Player ${p + 1} holds ${CARDS[id].name} in hand.`);
    } else if (a.t === 'discardInf') {
      const id = pl.infOffer.splice(a.pick, 1)[0];
      pl.infDiscard.push(id);
      log(state, `Player ${p + 1} discards ${CARDS[id].name}.`);
    } else if (a.t === 'discardSquad') {
      const id = pl.squadOffer.splice(a.pick, 1)[0];
      pl.squadDiscard.push(id);
      log(state, `Player ${p + 1} discards ${CARDS[id].name}.`);
    } else if (a.t === 'hold') {
      const id = pl.squadOffer[a.pick];
      pl.squadDiscard.push(...pl.squadOffer.filter((x, k) => k !== a.pick));
      pl.squadOffer = [];
      pl.hand.push(id);
      log(state, `Player ${p + 1} holds ${CARDS[id].name}.`);
    } else if (a.t === 'play') {
      let id;
      if (a.hand < 0) {
        const k = -1 - a.hand;
        id = pl.squadOffer[k];
        pl.squadDiscard.push(...pl.squadOffer.filter((x, j) => j !== k));
        pl.squadOffer = [];
      } else { id = pl.hand[a.hand]; pl.hand.splice(a.hand, 1); pl.handLeft--; }
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
      enterTile(state, u, a.cell.r, a.cell.c);
    } else if (a.t === 'trap') {
      const u = state.board[a.from.r][a.from.c];
      u.trapped = true;
      layTrap(state, p, a.cell, CARDS[u.id].trap);
      log(state, `${CARDS[u.id].name} lays a ${TRAPS[CARDS[u.id].trap].name}.`);
    } else if (a.t === 'attack') {
      const att = state.board[a.from.r][a.from.c], def = state.board[a.target.r][a.target.c];
      att.attacked = true;
      const dmg = attackDamage(att, def);
      def.hp -= dmg;
      log(state, `${CARDS[att.id].name} hits ${CARDS[def.id].name} for ${dmg}${dmg === 0 ? ' (blocked by armour)' : ''}.`);
      const adjacent = Math.max(Math.abs(a.from.r - a.target.r), Math.abs(a.from.c - a.target.c)) === 1;
      if (adjacent && def.atk > 0 && inRange(def, a.target, a.from)) {
        const back = attackDamage(def, att);
        att.hp -= back;
        if (back) log(state, `${CARDS[def.id].name} strikes back for ${back}.`);
      }
    }
    cleanup(state);
    return state;
  }

  const VERSION = 'r10'; // bump whenever a rule or card changes: recorded games replay only on the version that recorded them
  const api = { VERSION, ROWS, COLS, KING_C, KING_HP, HAND_MAX, MOVES, DEFENCE_ZONE, MAX_TRAPS, SYM, SUIT_ROLE, CLS_SYM, TRAPS, CARDS, DECK, INF_DECK, newGame, legalActions, applyAction, clone, hasKw, suitOf, isKing, isInf, sameRef, locEq, backRow, dirOf, kingOf, inRange, reachTiles, attackTargets, spawnTiles, spawnTilesFor, moveDests, trapAt, unitAt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TBC = api;
})(typeof window !== 'undefined' ? window : globalThis);
