/* TBC rules engine — pure state + actions, no DOM. Browser: window.TBC. Node: require().
 *
 * A shared 7-wide x 9-deep battlefield. Player 0 starts on row 0 and marches toward row 8; player 1 the reverse.
 * Tiles are claimed by landing on them and stay yours until the enemy lands on them (or plays Land Grab). Rows 1-4 start as player 0's,
 * 6-9 as player 1's. Win by killing the enemy king, or by owning more tiles when the turn limit runs out.
 * Each king can summon one Legend at a time; its level grows with the tiles you own.
 * Each player's king (the castle) sits in the middle of their back row. Win by killing the enemy king.
 *
 * Per turn:  you start with 5 cards, draw 1 squad card each turn (the first player skips the draw on turn 1) and hold up to 8.
 *            Mana is 1 on your first turn, 2 on your second, ... up to 10. Spend it to play any number of cards from your hand.
 *            You are also dealt 1 free infantry each turn to place instantly (swap it for another once a turn for 1 mana);
 *            an unplaced infantry goes to the bottom of its deck. A full hand sends new cards to the bottom of the deck.
 *            move up to 3 different units (one step each; hidden rogues two, any direction), but only units that were already
 *            on the board when your turn began; anything placed this turn is 'fresh' and can't move
 *            every unit may attack once (free). Rogues start hidden and have ONE trap or bomb (or a double-damage
 *            sneak attack); using any of them reveals the rogue for good, and it fights on as a plain melee unit
 *            a deck that runs out is rebuilt by shuffling its own discard pile; the only win is the enemy castle
 */
(function (root) {
  'use strict';

  const ROWS = 9, COLS = 7, KING_C = 3, KING_HP = 30, HAND_MAX = 8, START_HAND = 5, MAX_MANA = 10, MOVES = 3, MAX_TURNS = 80;
  const HOME_ROWS = 4;                      // rows 1-4 are yours at the start, row 5 is neutral, rows 6-9 are theirs
  // The king summons a LEGEND. Its level (and cost in mana, and the turns it takes to come back after dying) grows with the tiles you own.
  const LEGEND_LEVELS = [null, { cost: 1, atk: 4, hp: 6, armor: 3 }, { cost: 2, atk: 5, hp: 8, armor: 4 }, { cost: 3, atk: 6, hp: 10, armor: 5 }];
  const LEGEND_STEPS = 3;
  const levelFor = (tiles) => (tiles >= 38 ? 3 : tiles >= 31 ? 2 : 1);
  // Outposts: 4 marked tiles. Hold one with a unit for a full turn, then build one of these on it. They work for whoever stands on them.
  const OUTPOSTS = {
    lookout: { name: 'Lookout', sym: '🏹', text: 'A ranged unit standing here shoots one tile further.' },
    bunker: { name: 'Bunker', sym: '⛺', text: 'Gives you 1 extra infantry each turn, and your infantry may be placed in the tiles around it.' },
    mine: { name: 'Gold Mine', sym: '⛏', text: '+1 mana at the start of your turn.' },
  };
  const DEFENCE_ZONE = 2;
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
  // Keywords:  breach  ignores armour and does double damage to ♠
  //            swift   its move doesn't use up one of your moves
  // A defender strikes back only if the attacker is adjacent AND inside the defender's own shape.
  // Targets: enemyUnit | enemyInf are enemies inside the reach of one of YOUR units. allyUnit | allyInf are yours.
  // Defence units (infantry and ♠) may be placed anywhere within DEFENCE_ZONE tiles of your king.
  // ARMOUR is a pool of plates: a normal hit removes ceil(attack / 2) plates and doesn't touch health; once the plates
  // are gone every hit goes to health at full strength (no spill-over). Breach, poison, bombs and boosts ignore armour.
  // Defence-shape units (walls, towers, defence infantry) take DOUBLE damage from behind. Defence infantry counter-hit
  // adjacent melee attackers in front or beside for floor(attack / 2) if they survive; walls and towers never counter.
  // Rogues start hidden (can't be targeted). While hidden they may use their ONE trap or bomb, or sneak attack for double
  // damage. Doing any of these reveals them for good and they fight on as plain melee units.
  const CARDS = {};
  const reg = (c) => { CARDS[c.id] = Object.assign({ kw: [], text: '', armor: 0, atk: 0, hp: 0 }, c); return CARDS[c.id]; };

  // ---- infantry (free, small stats). Stats: attack, health, armour plates.
  const INF = [
    ['iSword', 'Swordsman', 'melee', 2, 2, 1, 5], ['iBrute', 'Brute', 'melee', 2, 2, 1, 3], ['iSpear', 'Spearman', 'melee', 2, 2, 1, 2],
    ['iArcher', 'Archer', 'ranged', 1, 2, 1, 5], ['iSlinger', 'Slinger', 'ranged', 1, 2, 1, 5],
    ['iShield', 'Shieldman', 'defence', 0, 3, 3, 5], ['iGuard', 'Guard', 'defence', 0, 3, 3, 3], ['iPike', 'Pikeman', 'defence', 0, 3, 3, 2],
  ];
  const INF_DECK = [];
  for (const [id, name, cls, atk, hp, armor, n] of INF) {
    reg({
      id, name, kind: 'unit', inf: true, cls, atk, hp, armor,
      reach: cls === 'ranged' ? 'range' : cls === 'defence' ? 'defence' : 'melee',
      kw: cls === 'defence' ? ['counter'] : [],
      text: cls === 'defence' ? 'Cannot attack. Counters a melee hit from the front or sides for half its strength if it survives. Double damage from behind.' : '',
    });
    for (let k = 0; k < n; k++) INF_DECK.push(id);
  }
  // rogues: hidden until they act. ONE trap or bomb (or a double-damage sneak attack), then plain melee units
  const ROGUES = [['iPoisoner', 'Poisoner', 'trap', 'poison'], ['iTrapper', 'Trapper', 'trap', 'sticky'], ['iSaboteur', 'Saboteur', 'trap', 'flash'], ['iBomber', 'Bomber', 'bomb', null]];
  for (const [id, name, rogue, trap] of ROGUES) {
    const what = rogue === 'bomb' ? 'one bomb (thrown exactly 2 tiles away: 1 damage to everything around the landing spot, friends too)' : `one ${TRAPS[trap].name}`;
    const c = { id, name, kind: 'unit', inf: true, cls: 'rogue', atk: 1, hp: 2, armor: 2, reach: 'melee', rogue, kw: ['stealth'], text: `Hidden: can't be targeted. Moves 2 in any direction. Has ${what}, or a sneak attack for double damage. Acting reveals it for good.` };
    if (trap) c.trap = trap;
    reg(c);
    INF_DECK.push(id, id);
  }

  // ---- squad deck (52 cards)
  const unit = (suit, rank, name, atk, hp, armor, extra) => reg(Object.assign({ id: suit + rank, suit, rank, name, kind: 'unit', atk, hp, armor }, extra));
  const spell = (suit, rank, name, text, effects, extra) => reg(Object.assign({ id: suit + rank, suit, rank, name, kind: 'spell', text, effects }, extra));
  const B = ['breach'];
  const LOB = 'Siege lob: hits the 2nd and 3rd rows ahead.';

  // ♦ Siege — big units that break defences
  unit('D', 'A', 'Ram', 4, 3, 0, { kw: B });
  unit('D', '2', 'Ladder Crew', 3, 5, 0, { kw: B, effects: [{ op: 'claimAround' }] });
  unit('D', '3', 'Mangonel', 5, 3, 0, { kw: B, reach: 'range', text: LOB, death: [{ op: 'dmgAdj', n: 1 }] });
  unit('D', '4', 'Ballista Cart', 5, 5, 0, { kw: B, death: [{ op: 'poisonAdj' }] });
  unit('D', '5', 'Catapult', 6, 4, 0, { kw: B, reach: 'range', text: LOB, death: [{ op: 'trapHere', type: 'poison' }] });
  unit('D', '6', 'Siege Engine', 6, 6, 0, { kw: B, effects: [{ op: 'claimAround' }], death: [{ op: 'dmgAdj', n: 1 }] });
  unit('D', '7', 'Trebuchet', 8, 4, 0, { kw: B, reach: 'range', text: LOB, death: [{ op: 'spawnToken' }] });
  unit('D', '8', 'Juggernaut', 8, 7, 0, { kw: B, effects: [{ op: 'pushAdj' }], death: [{ op: 'spawnToken' }] });
  unit('D', '9', 'Behemoth', 10, 8, 0, { kw: B, effects: [{ op: 'pushAdj' }], death: [{ op: 'dmgAdj', n: 1 }, { op: 'poisonAdj' }] });
  unit('D', '10', 'Colossus', 12, 10, 0, { kw: B, effects: [{ op: 'claimAround' }], death: [{ op: 'spawnToken' }, { op: 'dmgAdj', n: 1 }] });
  spell('D', 'J', 'Sapper Charge', 'Deal 6 damage to an enemy unit in your reach.', [{ op: 'damage', n: 6, to: 'target' }], { target: 'enemyUnit' });
  spell('D', 'Q', 'Battering Charge', 'Your Siege units may attack again and get +2 attack.', [{ op: 'rearm', to: 'allySuit', suit: 'D' }, { op: 'buff', atk: 2, hp: 0, to: 'allySuit', suit: 'D' }]);
  unit('D', 'K', 'Siege Master', 3, 6, 0, { kw: B, text: 'Play: your Siege units get +1/+1.', effects: [{ op: 'buff', atk: 1, hp: 1, to: 'allySuit', suit: 'D' }] });

  // The Siege Tower is the 53rd card: a wall that holds one archer (see garrison rules in moveDests / placeUnit)
  unit('D', 'T', 'Siege Tower', 0, 8, 3, { reach: 'defence', kw: ['wall', 'tower'], text: 'Holds 1 archer: it shoots from inside and can\'t be targeted. If the tower falls the archer drops out.' });

  // ♠ Defence — walls (no attack, no counter, take double damage from behind) and defensive boosts
  unit('S', 'A', 'Palisade', 0, 4, 1);
  unit('S', '2', 'Stone Wall', 0, 5, 2);
  unit('S', '3', 'Bulwark', 0, 6, 2, { death: [{ op: 'buffAdj', armor: 1 }] });
  unit('S', '4', 'Fortress', 0, 6, 3, { death: [{ op: 'claimAround' }] });
  unit('S', '5', 'Citadel', 0, 6, 4, { effects: [{ op: 'healKing', n: 3 }], death: [{ op: 'buffAdj', armor: 1 }] });
  spell('S', '6', 'Field Hospital', 'Your king heals 6.', [{ op: 'healKing', n: 6 }]);
  spell('S', '7', 'Fortify', 'A unit gets +3 health and +1 armour.', [{ op: 'buff', atk: 0, hp: 3, armor: 1, to: 'target' }], { target: 'allyUnit' });
  spell('S', '8', 'Shield Wall', 'All your units get +1 armour.', [{ op: 'buff', atk: 0, hp: 0, armor: 1, to: 'allyUnits' }]);
  spell('S', '9', 'Reinforce', 'Restore all your units to full health and armour.', [{ op: 'healAll' }]);
  spell('S', '10', 'Royal Guard', 'Your king gets +2 armour.', [{ op: 'kingArmor', n: 2 }]);
  unit('S', 'J', 'Bodyguard', 0, 5, 2, { text: 'Play: your king heals 4.', effects: [{ op: 'healKing', n: 4 }] });
  spell('S', 'Q', 'Engineers', 'Your Defence units get +3 health.', [{ op: 'buff', atk: 0, hp: 3, to: 'allySuit', suit: 'S' }]);
  unit('S', 'K', 'Warlord', 0, 6, 3, { text: 'Play: your king gets +1 armour.', effects: [{ op: 'kingArmor', n: 1 }], death: [{ op: 'claimAround' }] });

  // ♣ Offence — boosts for your infantry and commanders
  spell('C', 'A', 'Rally', 'Your infantry get +1 attack.', [{ op: 'buff', atk: 1, hp: 0, to: 'allyInf' }]);
  spell('C', '2', 'Sharpen Blades', 'A unit gets +2 attack.', [{ op: 'buff', atk: 2, hp: 0, to: 'target' }], { target: 'allyUnit' });
  spell('C', '3', 'Forced March', 'You may make 1 extra move this turn.', [{ op: 'moves', n: 1 }]);
  spell('C', '4', 'Charge', 'A unit may attack again and gets +1 attack.', [{ op: 'rearm', to: 'target' }, { op: 'buff', atk: 1, hp: 0, to: 'target' }], { target: 'allyUnit' });
  spell('C', '5', 'Warhorn', 'All your units get +1/+1.', [{ op: 'buff', atk: 1, hp: 1, to: 'allyUnits' }]);
  spell('C', '6', 'Berserk', 'An infantry gets +3 attack.', [{ op: 'buff', atk: 3, hp: 0, to: 'target' }], { target: 'allyInf' });
  spell('C', '7', 'Reinforcements', 'Deal yourself 1 extra infantry to place right now.', [{ op: 'infExtra' }]);
  spell('C', '8', 'Conscription', 'Immediately deploy 3 infantry.', [{ op: 'summonInf', n: 3 }]);
  spell('C', '9', 'Battle Cry', 'All your units may attack again.', [{ op: 'rearm', to: 'allyUnits' }]);
  spell('C', '10', 'Drums of War', 'Your infantry get +2 attack.', [{ op: 'buff', atk: 2, hp: 0, to: 'allyInf' }]);
  spell('C', 'L', 'Land Grab', 'Claim the 3x3 tiles around a tile next to your land (not tiles with enemy units).', [{ op: 'claim' }], { target: 'tile' });
  spell('C', 'M', 'Land Grab', 'Claim the 3x3 tiles around a tile next to your land (not tiles with enemy units).', [{ op: 'claim' }], { target: 'tile' });
  unit('C', 'J', 'Champion', 5, 4, 0, { kw: ['swift'], text: 'Moving it does not use up one of your moves.' });
  unit('C', 'Q', 'Captain', 3, 4, 0, { text: 'Play: your infantry get +1 attack.', effects: [{ op: 'buff', atk: 1, hp: 0, to: 'allyInf' }] });
  unit('C', 'K', 'General', 4, 6, 0, { text: 'Play: all your units get +1/+1.', effects: [{ op: 'buff', atk: 1, hp: 1, to: 'allyUnits' }], death: [{ op: 'moreMana', n: 1 }] });

  // ♥ Long range — archers and crossbows that shoot over the front line, plus tactics
  unit('H', 'A', 'Watchtower', 2, 4, 0);
  unit('H', '2', 'Longbowmen', 3, 3, 0, { effects: [{ op: 'reveal' }] });
  unit('H', '3', 'Crossbow Battery', 4, 3, 0, { effects: [{ op: 'pushAdj' }] });
  unit('H', '4', 'Heavy Crossbow', 5, 4, 0, { effects: [{ op: 'draw', n: 1 }] });
  unit('H', '5', 'Siege Archers', 6, 4, 0, { effects: [{ op: 'draw', n: 1 }, { op: 'reveal' }] });
  spell('H', '6', 'Eagle Eye', 'Deal 3 damage to an enemy unit in your reach.', [{ op: 'damage', n: 3, to: 'target' }], { target: 'enemyUnit' });
  spell('H', '7', 'Volley', 'Deal 2 damage to all enemy infantry in your reach.', [{ op: 'damage', n: 2, to: 'enemyInf' }]);
  spell('H', '8', 'Arrow Storm', 'Deal 3 damage to all enemy units in your reach.', [{ op: 'damage', n: 3, to: 'enemyUnits' }]);
  spell('H', '9', 'Fire Arrows', 'Deal 4 damage to an enemy infantry in your reach.', [{ op: 'damage', n: 4, to: 'target' }], { target: 'enemyInf' });
  spell('H', '10', 'Spyglass', 'Draw 2 cards into your hand.', [{ op: 'draw', n: 2 }]);
  unit('H', 'J', 'Marksman', 4, 2, 0, { target: 'enemyInf', text: 'Play: deal 2 damage to an enemy infantry in your reach.', effects: [{ op: 'damage', n: 2, to: 'target' }] });
  spell('H', 'Q', 'Scout Report', 'Draw a card into your hand.', [{ op: 'draw', n: 1 }]);
  unit('H', 'K', 'Master Archer', 6, 5, 0, { effects: [{ op: 'trapAdj', type: 'sticky' }] });

  for (const id of Object.keys(CARDS)) {
    const c = CARDS[id];
    if (!c.reach) c.reach = c.suit === 'S' ? 'defence' : c.suit === 'H' ? 'range' : 'melee';
    if (c.suit === 'S' && c.kind === 'unit') c.kw = ['wall'].concat(c.kw);
  }

  // text for arrival effects and death bonuses (built from the effect lists so they never disagree)
  const PHRASE = {
    claimAround: () => 'claim the tiles around it', pushAdj: () => 'push adjacent enemies back one tile', reveal: () => 'reveal hidden enemies within 2 tiles',
    healKing: (e) => `your king heals ${e.n}`, draw: (e) => `draw ${e.n} card${e.n > 1 ? 's' : ''}`, trapAdj: (e) => `lay a ${e.type === 'sticky' ? 'Sticky' : 'Poison'} Trap next to it`,
    dmgAdj: (e) => `${e.n} damage to adjacent enemies`, poisonAdj: () => 'poison adjacent enemies', trapHere: () => 'leave a Poison Trap on its tile',
    buffAdj: () => 'adjacent friends get +1 armour', moreMana: (e) => `+${e.n} mana next turn`, spawnToken: () => 'leave a Skeleton (1/0/1) on its tile',
  };
  for (const c of Object.values(CARDS)) {
    if (c.kind !== 'unit' || c.inf) continue;
    const parts = [];
    if (c.text) parts.push(c.text);
    else if (c.effects) parts.push('Arrives: ' + c.effects.map((e) => PHRASE[e.op](e)).join(', ') + '.');
    if (c.death) parts.push('On fall: ' + c.death.map((e) => PHRASE[e.op](e)).join(', ') + '.');
    c.text = parts.join(' ');
  }
  CARDS.SKEL = { id: 'SKEL', kind: 'unit', name: 'Skeleton', reach: 'melee', atk: 1, hp: 1, armor: 0, kw: [], token: true, text: 'Left behind by a fallen unit.' };
  CARDS.LEGEND = { id: 'LEGEND', kind: 'unit', name: 'Legend', reach: 'melee', atk: 4, hp: 6, armor: 3, kw: ['legend'], token: true, text: 'Summoned by your king. Moves up to 3 tiles a turn and claims every tile it lands on.' };
  CARDS.KING = { id: 'KING', kind: 'king', name: 'King', reach: 'melee', atk: 0, hp: KING_HP, armor: 0, kw: [], text: 'Lose your king and you lose the game.' };
  // mana costs (infantry are free)
  const COSTS = {
    DA: 2, D2: 3, D3: 3, D4: 4, D5: 4, D6: 5, D7: 5, D8: 6, D9: 7, D10: 8, DJ: 3, DQ: 3, DK: 4, DT: 5,
    SA: 1, S2: 2, S3: 3, S4: 4, S5: 5, S6: 2, S7: 1, S8: 4, S9: 3, S10: 3, SJ: 3, SQ: 3, SK: 5,
    CL: 3, CM: 3, CA: 1, C2: 1, C3: 2, C4: 2, C5: 3, C6: 2, C7: 3, C8: 4, C9: 4, C10: 4, CJ: 4, CQ: 3, CK: 5,
    HA: 2, H2: 3, H3: 3, H4: 4, H5: 5, H6: 3, H7: 3, H8: 5, H9: 2, H10: 2, HJ: 4, HQ: 1, HK: 6,
  };
  for (const id of Object.keys(CARDS)) CARDS[id].cost = CARDS[id].inf ? 0 : (COSTS[id] || 0);
  const DECK = Object.keys(CARDS).filter((id) => !CARDS[id].inf && id !== 'KING' && !CARDS[id].token);

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

  // ---- territory: every tile has an owner (null = nobody). Landing on a tile claims it; hidden rogues claim nothing.
  const ownerAt = (state, r, c) => state.owner[r][c];
  const tileCount = (state, p) => { let n = 0; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (state.owner[r][c] === p) n++; return n; };
  function claim(state, u, r, c) {
    if (u.stealth || isKing(u)) return;
    if (state.owner[r][c] !== u.p) state.owner[r][c] = u.p;
  }
  const outpostAt = (state, r, c) => state.outposts.find((o) => o.r === r && o.c === c) || null;
  // outposts whose tile holds one of p's units (that is who they work for)
  const heldOutposts = (state, p, kind) => state.outposts.filter((o) => o.kind && (!kind || o.kind === kind) && state.board[o.r][o.c] && state.board[o.r][o.c].p === p);
  const legendOf = (state, p) => { for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const u = state.board[r][c]; if (u && u.p === p && u.legend) return { r, c }; } return null; };
  // empty tiles around your king where the legend may appear
  function summonTiles(state, p) {
    const k = backRow(p), out = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const r = k + dr, c = KING_C + dc;
      if ((dr || dc) && inBounds(r, c) && !state.board[r][c] && !ownTrapAt(state, p, r, c)) out.push({ r, c });
    }
    return out;
  }
  const legendLevel = (state, p) => levelFor(tileCount(state, p));
  // tiles a Land Grab centred on `cell` would flip (never a tile holding an enemy unit)
  function grabTiles(state, p, cell) {
    const out = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const r = cell.r + dr, c = cell.c + dc;
      if (!inBounds(r, c) || state.owner[r][c] === p) continue;
      const u = state.board[r][c];
      if (u && u.p !== p) continue;
      out.push({ r, c });
    }
    return out;
  }
  // centres for Land Grab: within 1 tile of land you own, and it must flip something
  function grabCentres(state, p) {
    const out = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      let near = false;
      for (let dr = -1; dr <= 1 && !near; dr++) for (let dc = -1; dc <= 1; dc++) if (inBounds(r + dr, c + dc) && state.owner[r + dr][c + dc] === p) { near = true; break; }
      if (near && grabTiles(state, p, { r, c }).length) out.push({ r, c });
    }
    return out;
  }

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
    if (card.inf) {                                       // infantry may also go around a bunker you hold
      for (const o of heldOutposts(state, p, 'bunker')) for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const r = o.r + dr, c = o.c + dc;
        if ((dr || dc) && inBounds(r, c) && !state.board[r][c] && !ownTrapAt(state, p, r, c) && !out.some((t) => t.r === r && t.c === c)) out.push({ r, c });
      }
    }
    if (!out.length) {                                    // overflow: if every usual tile is full, any empty tile on your first two rows will do
      const kr = backRow(p);
      for (const r of [kr, kr + dirOf(p)]) for (let c = 0; c < COLS; c++) if (!state.board[r][c] && !ownTrapAt(state, p, r, c)) out.push({ r, c });
    }
    if (canGarrisonCard(id)) {
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const t = state.board[r][c];
        if (t && t.p === p && hasKw(t, 'tower') && !t.garrison) out.push({ r, c });
      }
    }
    return out;
  }

  // is `to` inside the reach shape of unit `u` standing at `from`?
  function inRange(u, from, to, ext) {
    const dr = to.r - from.r, dc = to.c - from.c, fwd = dr * dirOf(u.p), side = Math.abs(dc);
    switch (CARDS[u.id].reach) {
      case 'none': return false;
      case 'range': return (fwd === 2 || fwd === 3 || (ext && fwd === 4)) && side <= 1;
      case 'defence': return (fwd === 1 && side <= 1) || (fwd === 0 && side === 1);
      default: return Math.max(Math.abs(dr), side) === 1;
    }
  }
  const lookoutAt = (state, r, c) => { const o = outpostAt(state, r, c); return !!o && o.kind === 'lookout'; };
  // who shoots from a tile: an archer garrisoned in a tower, otherwise the unit itself
  const shooterAt = (state, r, c) => { const u = state.board[r][c]; return u && u.garrison && u.garrison.atk > 0 ? u.garrison : u; };
  // every tile of the board inside the reach shape of whoever attacks from tile (r, c) (for the UI)
  function reachTiles(state, r, c) {
    const s = shooterAt(state, r, c), out = [];
    if (!s || s.atk <= 0) return out;
    const ext = lookoutAt(state, r, c);
    for (let rr = 0; rr < ROWS; rr++) for (let cc = 0; cc < COLS; cc++) if (inRange(s, { r, c }, { r: rr, c: cc }, ext)) out.push({ r: rr, c: cc });
    return out;
  }

  // One hit of strength `raw` on `def` (standing at defPos) from `att` at attPos (att is null for a counter-hit).
  function strike(state, att, attPos, def, defPos, raw) {
    let a = raw, behind = false;
    if (CARDS[def.id].reach === 'defence' && attPos && (attPos.r - defPos.r) * dirOf(def.p) < 0) { behind = true; a *= 2; }
    let toArmour = 0, toHp = 0;
    if (att && hasKw(att, 'breach')) toHp = suitOf(def) === 'S' ? a * 2 : a;
    else if (def.armor > 0) { toArmour = Math.min(def.armor, Math.ceil(a / 2)); def.armor -= toArmour; }
    else toHp = a;
    def.hp -= toHp;
    return { a, behind, toArmour, toHp };
  }
  const describeHit = (r) => (r.toArmour ? `${r.toArmour} armour` : `${r.toHp} damage`);

  const makeUnit = (state, p, id) => {
    const c = CARDS[id];
    return { uid: ++state.uid, id, p, atk: c.atk, hp: c.hp, maxHp: c.hp, armor: c.armor, maxArmor: c.armor, attacked: false, moved: false, fresh: true, trapped: false, stealth: !!c.rogue, ammo: c.rogue ? 1 : 0, garrison: null, poison: 0, stuck: 0, blind: 0, immobile: false, disarmed: false, since: state.players[p] ? state.players[p].turns : 0 };
  };

  // archers (ranged infantry) may be placed or moved into a friendly Siege Tower that has room
  const canGarrisonCard = (id) => !!CARDS[id].inf && CARDS[id].reach === 'range';
  const canGarrison = (u, tower) => tower.p === u.p && hasKw(tower, 'tower') && !tower.garrison && canGarrisonCard(u.id);

  // hidden enemy rogues can't be targeted
  function attackTargets(state, r, c, shooter) {
    const u = shooter || state.board[r][c], out = [], ext = lookoutAt(state, r, c);
    for (let rr = Math.max(0, r - 4); rr <= Math.min(ROWS - 1, r + 4); rr++) {
      for (let cc = Math.max(0, c - 3); cc <= Math.min(COLS - 1, c + 3); cc++) {
        const t = state.board[rr][cc];
        if (t && t.p !== u.p && !t.stealth && inRange(u, { r, c }, { r: rr, c: cc }, ext)) out.push({ r: rr, c: cc });
      }
    }
    return out;
  }

  // tiles a unit may move to this turn through empty tiles. Normal units: forward, left or right, one step.
  // Hidden rogues: up to 2 steps in ANY direction. An enemy trap stops the unit on it; your own traps can't be entered.
  // Archers may step into a friendly Siege Tower with room.
  function moveDests(state, r, c) {
    const u = state.board[r][c], dir = dirOf(u.p), sneaky = !!CARDS[u.id].rogue && u.stealth;
    const dirs = sneaky ? [[1, 0], [-1, 0], [0, -1], [0, 1]] : [[dir, 0], [0, -1], [0, 1]], speed = sneaky ? 2 : 1;
    const out = [], seen = new Set([r * COLS + c]);
    let frontier = [{ r, c }];
    for (let step = 0; step < speed; step++) {
      const next = [];
      for (const t of frontier) {
        for (const [dr, dc] of dirs) {
          const nr = t.r + dr, nc = t.c + dc;
          if (!inBounds(nr, nc) || seen.has(nr * COLS + nc) || ownTrapAt(state, u.p, nr, nc)) continue;
          const occ = state.board[nr][nc];
          if (occ) { if (canGarrison(u, occ)) { seen.add(nr * COLS + nc); out.push({ r: nr, c: nc }); } continue; }
          seen.add(nr * COLS + nc);
          out.push({ r: nr, c: nc });
          if (!trapAt(state, nr, nc)) next.push({ r: nr, c: nc });
        }
      }
      frontier = next;
    }
    return out;
  }

  // a bomb: 1 damage (ignoring armour) to everything on and around the landing tile, friends included. Hidden rogues are missed.
  function explode(state, cell) {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const r = cell.r + dr, c = cell.c + dc;
      if (!inBounds(r, c)) continue;
      const u = state.board[r][c];
      if (u && !u.stealth) { u.hp -= 1; log(state, `${CARDS[u.id].name} is caught in the blast.`); }
    }
  }

  // ---------------------------------------------------------------- setup / flow
  function newGame(seed) {
    const state = { rng: seed | 0, turn: 1, active: 0, winner: null, reason: '', uid: 0, log: [], board: [], traps: [], players: [], owner: [], outposts: [] };
    for (let r = 0; r < ROWS; r++) { state.board.push(new Array(COLS).fill(null)); state.owner.push(new Array(COLS).fill(r < HOME_ROWS ? 0 : r >= ROWS - HOME_ROWS ? 1 : null)); }
    // 4 outposts in two mirrored pairs (rows 3-7), so neither side starts nearer to them
    const cand = [];
    for (let r = 2; r <= 4; r++) for (let c = 0; c < COLS; c++) if (r < 4 || c < KING_C) cand.push({ r, c });
    shuffle(state, cand);
    const first = cand[0], second = cand.find((t) => Math.max(Math.abs(t.r - first.r), Math.abs(t.c - first.c)) > 1) || cand[1];
    for (const t of [first, second]) { state.outposts.push({ r: t.r, c: t.c, kind: null }); state.outposts.push({ r: ROWS - 1 - t.r, c: COLS - 1 - t.c, kind: null }); }
    for (let p = 0; p < 2; p++) {
      state.board[backRow(p)][KING_C] = { uid: ++state.uid, id: 'KING', p, atk: 0, hp: KING_HP, maxHp: KING_HP, armor: 0, attacked: true, moved: true, fresh: false, trapped: true, maxArmor: 0, stealth: false, ammo: 0, garrison: null, poison: 0, stuck: 0, blind: 0, immobile: false, disarmed: false, since: 0 };
      state.players.push({ mana: 0, maxMana: 0, turns: 0, moves: 0, swaps: 0, infHand: [], deck: shuffle(state, DECK.slice()), infDeck: shuffle(state, INF_DECK.slice()), hand: [], infDiscard: [], squadDiscard: [], legendCd: 0, legendLevel: 0, nextMana: 0 });
    }
    for (let p = 0; p < 2; p++) for (let i = 0; i < START_HAND; i++) drawToHand(state, p);
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

  // draw one squad card; a full hand sends it to the bottom of the deck instead (nothing is lost)
  function drawToHand(state, p) {
    const pl = state.players[p];
    if (!refill(state, p, 'deck', 'squadDiscard')) return;
    const id = pl.deck.pop();
    if (pl.hand.length >= HAND_MAX) { pl.deck.unshift(id); log(state, `Player ${p + 1}'s hand is full; ${CARDS[id].name} goes to the bottom of the deck.`); }
    else pl.hand.push(id);
  }

  // deal infantry cards to place this turn
  function dealInfantry(state, p, n) {
    const pl = state.players[p];
    for (let k = 0; k < n && refill(state, p, 'infDeck', 'infDiscard'); k++) pl.infHand.push(pl.infDeck.pop());
  }

  function startTurn(state) {
    const p = state.active, pl = state.players[p];
    pl.turns++;
    pl.maxMana = Math.min(MAX_MANA, pl.turns) + heldOutposts(state, p, 'mine').length + pl.nextMana;
    pl.nextMana = 0;
    pl.mana = pl.maxMana;
    if (pl.legendCd > 0) pl.legendCd--;
    pl.moves = MOVES;
    pl.swaps = 1;
    log(state, `— Turn ${state.turn}: Player ${p + 1} (mana ${pl.mana}) —`);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const u = state.board[r][c];
      if (!u || u.p !== p) continue;
      u.attacked = false; u.moved = false; u.fresh = false; u.trapped = false; u.steps = LEGEND_STEPS;
      if (u.garrison) { u.garrison.attacked = false; u.garrison.fresh = false; }
      if (u.poison > 0) { u.hp -= 1; u.poison--; log(state, `${CARDS[u.id].name} takes 1 poison damage.`); }
      u.immobile = u.stuck > 0; if (u.stuck > 0) u.stuck--;
      u.disarmed = u.blind > 0; if (u.blind > 0) u.blind--;
    }
    if (state.turn > 1) drawToHand(state, p);        // the very first player skips the draw on turn 1
    pl.infHand = [];
    dealInfantry(state, p, 1 + heldOutposts(state, p, 'bunker').length);
    cleanup(state);
  }

  function endTurn(state) {
    const pl = state.players[state.active];
    if (pl.infHand.length) { pl.infDeck.unshift(...pl.infHand); log(state, `Player ${state.active + 1}'s unplaced infantry goes to the bottom of its deck.`); pl.infHand = []; }
    state.active = 1 - state.active;
    state.turn++;
    if (state.turn > MAX_TURNS && state.winner == null) {
      const t0 = tileCount(state, 0), t1 = tileCount(state, 1), h0 = kingOf(state, 0).hp, h1 = kingOf(state, 1).hp;
      if (t0 !== t1) { state.winner = t0 > t1 ? 0 : 1; state.reason = `Time is up: Player ${state.winner + 1} owns more tiles (${Math.max(t0, t1)} to ${Math.min(t0, t1)}).`; }
      else if (h0 !== h1) { state.winner = h0 > h1 ? 0 : 1; state.reason = `Time is up and the land is level: Player ${state.winner + 1}'s castle is healthier.`; }
      else { state.winner = 2; state.reason = 'Time is up: a dead heat.'; }
      log(state, state.reason); return;
    }
    startTurn(state);
  }

  const NEIGH = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  function cleanup(state) {
    for (let pass = 0; pass < 8; pass++) {              // death bonuses can kill other units, so repeat until nothing more falls
      const fallen = [];
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const u = state.board[r][c];
        if (u && u.hp <= 0 && !isKing(u)) {
          log(state, `${CARDS[u.id].name} is destroyed.`);
          if (u.legend) { state.players[u.p].legendCd = LEGEND_LEVELS[u.level].cost; log(state, `Player ${u.p + 1}'s Legend has fallen; it can be summoned again in ${state.players[u.p].legendCd} turn(s).`); }
          if (u.garrison) { state.board[r][c] = u.garrison; log(state, `${CARDS[u.garrison.id].name} drops out of the wreckage.`); }
          else state.board[r][c] = null;
          fallen.push({ u, r, c });
        }
      }
      for (const f of fallen) if (CARDS[f.u.id].death) runEffects(state, CARDS[f.u.id].death, { p: f.u.p, cell: { r: f.r, c: f.c }, dead: true });
      if (!fallen.length) break;
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
  }

  // ---------------------------------------------------------------- effects
  function enemiesInReach(state, p) {
    const seen = new Set(), out = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const u = state.board[r][c];
      if (!u || u.p !== p || isKing(u)) continue;
      for (const s of [u, u.garrison]) {
        if (!s || s.atk <= 0) continue;
        for (const t of attackTargets(state, r, c, s)) {
          const e = state.board[t.r][t.c], key = t.r * COLS + t.c;
          if (!isKing(e) && !seen.has(key)) { seen.add(key); out.push(t); }
        }
      }
    }
    return out;
  }

  function validTargets(state, p, kind) {
    if (kind === 'tile') return grabCentres(state, p);
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
    const u = makeUnit(state, p, id), tile = state.board[cell.r][cell.c];
    if (tile && canGarrison(u, tile)) { tile.garrison = u; return CARDS[id]; }   // an archer placed into a Siege Tower
    state.board[cell.r][cell.c] = u;
    claim(state, u, cell.r, cell.c);
    enterTile(state, u, cell.r, cell.c);
    return CARDS[id];
  }

  function runEffects(state, effects, ctx) {
    for (const e of effects) {
      const pl = state.players[ctx.p], king = kingOf(state, ctx.p), at = (x) => state.board[x.r][x.c];
      switch (e.op) {
        case 'draw': for (let k = 0; k < e.n; k++) drawToHand(state, ctx.p); break;
        case 'healKing': king.hp = Math.min(king.maxHp, king.hp + e.n); break;
        case 'kingArmor': king.armor += e.n; king.maxArmor += e.n; break;
        case 'infExtra': dealInfantry(state, ctx.p, 1); break;
        case 'moves': pl.moves += e.n; break;
        case 'healAll': for (const x of allUnits(state, ctx.p)) { at(x).hp = at(x).maxHp; at(x).armor = at(x).maxArmor; } break;
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
        case 'claim': { const got = grabTiles(state, ctx.p, ctx.target); for (const t of got) state.owner[t.r][t.c] = ctx.p; log(state, `Player ${ctx.p + 1} claims ${got.length} tiles.`); break; }
        case 'claimAround': { const got = grabTiles(state, ctx.p, ctx.cell); for (const t of got) state.owner[t.r][t.c] = ctx.p; state.owner[ctx.cell.r][ctx.cell.c] = ctx.p; if (got.length) log(state, `${got.length} tiles are claimed.`); break; }
        case 'buffAdj': for (const [dr, dc] of NEIGH) { const u = unitAt(state, ctx.cell.r + dr, ctx.cell.c + dc); if (u && u.p === ctx.p && !isKing(u)) { u.armor += e.armor || 0; u.maxArmor += e.armor || 0; u.atk += e.atk || 0; } } break;
        case 'dmgAdj': for (const [dr, dc] of NEIGH) { const u = unitAt(state, ctx.cell.r + dr, ctx.cell.c + dc); if (u && u.p !== ctx.p && !u.stealth) u.hp -= e.n; } break;
        case 'poisonAdj': for (const [dr, dc] of NEIGH) { const u = unitAt(state, ctx.cell.r + dr, ctx.cell.c + dc); if (u && u.p !== ctx.p && !u.stealth && !isKing(u)) u.poison = Math.max(u.poison, 2); } break;
        case 'pushAdj':
          for (const [dr, dc] of NEIGH) {
            const r = ctx.cell.r + dr, c = ctx.cell.c + dc, u = unitAt(state, r, c), nr = r + dr, nc = c + dc;
            if (!u || u.p === ctx.p || isKing(u) || u.stealth || !inBounds(nr, nc) || state.board[nr][nc]) continue;
            state.board[r][c] = null; state.board[nr][nc] = u;
            log(state, `${CARDS[u.id].name} is shoved back.`);
            enterTile(state, u, nr, nc);
          }
          break;
        case 'reveal':
          for (let r = ctx.cell.r - 2; r <= ctx.cell.r + 2; r++) for (let c = ctx.cell.c - 2; c <= ctx.cell.c + 2; c++) {
            const u = unitAt(state, r, c);
            if (u && u.p !== ctx.p && u.stealth) { u.stealth = false; log(state, `${CARDS[u.id].name} is spotted!`); }
          }
          break;
        case 'trapAdj': {
          const fwd = dirOf(ctx.p), order = NEIGH.slice().sort((a, b) => b[0] * fwd - a[0] * fwd);
          for (const [dr, dc] of order) {
            const r = ctx.cell.r + dr, c = ctx.cell.c + dc;
            if (inBounds(r, c) && !state.board[r][c] && !trapAt(state, r, c)) { layTrap(state, ctx.p, { r, c }, e.type); break; }
          }
          break;
        }
        case 'trapHere': if (!trapAt(state, ctx.cell.r, ctx.cell.c) && !state.board[ctx.cell.r][ctx.cell.c]) layTrap(state, ctx.p, ctx.cell, e.type); break;
        case 'spawnToken': if (!state.board[ctx.cell.r][ctx.cell.c]) { const u = makeUnit(state, ctx.p, 'SKEL'); u.fresh = false; state.board[ctx.cell.r][ctx.cell.c] = u; log(state, 'A Skeleton rises.'); } break;
        case 'moreMana': pl.nextMana += e.n; break;
        case 'damage': for (const x of resolveTargets(state, e, ctx)) at(x).hp -= e.n; break;
        case 'rearm': for (const x of resolveTargets(state, e, ctx)) { at(x).attacked = false; if (at(x).garrison) at(x).garrison.attacked = false; } break;
        case 'buff':
          for (const x of resolveTargets(state, e, ctx)) {
            const u = at(x);
            u.atk += e.atk || 0; u.hp += e.hp || 0; u.maxHp += e.hp || 0; u.armor += e.armor || 0; u.maxArmor += e.armor || 0;
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

    // free infantry dealt this turn: place it, or pay 1 mana to swap it for the next one
    pl.infHand.forEach((id, pick) => { for (const cell of spawnTilesFor(state, p, id)) acts.push({ t: 'deploy', pick, cell }); });
    if (pl.swaps > 0 && pl.mana >= 1) pl.infHand.forEach((id, pick) => acts.push({ t: 'swapInf', pick }));

    // squad cards from your hand, as many as your mana allows
    pl.hand.forEach((id, i) => {
      const c = CARDS[id];
      if (c.cost > pl.mana) return;
      const targets = c.target ? validTargets(state, p, c.target) : [];
      const area = c.kind === 'spell' && (c.effects || []).find((e) => e.op === 'damage' && e.to !== 'target');
      if (area && !resolveTargets(state, area, { p }).length) return;      // area strikes need something in reach
      if (c.kind === 'spell') {
        if (c.target) targets.forEach((target) => acts.push({ t: 'play', hand: i, target }));
        else acts.push({ t: 'play', hand: i });
      } else {
        for (const cell of spawnTilesFor(state, p, id)) {
          if (targets.length) targets.forEach((target) => acts.push({ t: 'play', hand: i, cell, target }));
          else acts.push({ t: 'play', hand: i, cell });
        }
      }
    });

    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const u = state.board[r][c];
      if (!u || u.p !== p || isKing(u)) continue;
      if (u.legend) {                                  // the legend has its own 3 steps and doesn't use your moves
        if (!u.fresh && !u.immobile && u.steps > 0) for (const cell of moveDests(state, r, c)) acts.push({ t: 'move', from: { r, c }, cell });
      } else if (!u.moved && !u.fresh && !u.immobile && (pl.moves > 0 || hasKw(u, 'swift'))) {
        for (const cell of moveDests(state, r, c)) acts.push({ t: 'move', from: { r, c }, cell });
      }
      const op = outpostAt(state, r, c);                // hold an outpost for a full turn, then build on it
      if (op && !op.kind && !u.stealth && u.since < pl.turns) for (const kind of Object.keys(OUTPOSTS)) acts.push({ t: 'build', at: { r, c }, kind });
      if (!u.attacked && !u.disarmed && u.atk > 0) attackTargets(state, r, c).forEach((target) => acts.push({ t: 'attack', from: { r, c }, target }));
      const g = u.garrison;
      if (g && !g.attacked && !g.disarmed && g.atk > 0) attackTargets(state, r, c, g).forEach((target) => acts.push({ t: 'attack', from: { r, c }, g: true, target }));
      const card = CARDS[u.id];
      if (card.rogue && u.stealth && u.ammo > 0) {     // a hidden rogue's one-shot: a trap next to it, or a bomb exactly 2 tiles away
        if (card.rogue === 'trap') {
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr, nc = c + dc;
            if ((dr || dc) && inBounds(nr, nc) && !state.board[nr][nc] && !trapAt(state, nr, nc)) acts.push({ t: 'trap', from: { r, c }, cell: { r: nr, c: nc } });
          }
        } else {
          for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
            if (Math.max(Math.abs(dr), Math.abs(dc)) === 2 && inBounds(r + dr, c + dc)) acts.push({ t: 'bomb', from: { r, c }, cell: { r: r + dr, c: c + dc } });
          }
        }
      }
    }

    if (pl.legendCd === 0 && !legendOf(state, p) && pl.mana >= LEGEND_LEVELS[legendLevel(state, p)].cost) {
      for (const cell of summonTiles(state, p)) acts.push({ t: 'summon', cell });
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
      const c = placeUnit(state, p, pl.infHand.splice(a.pick, 1)[0], a.cell);
      log(state, `Player ${p + 1} deploys ${c.name}.`);
    } else if (a.t === 'swapInf') {
      const id = pl.infHand.splice(a.pick, 1)[0];
      pl.infDeck.unshift(id);
      pl.mana -= 1; pl.swaps--;
      dealInfantry(state, p, 1);
      log(state, `Player ${p + 1} pays 1 mana to swap ${CARDS[id].name} for a new infantry.`);
    } else if (a.t === 'play') {
      const id = pl.hand[a.hand], c = CARDS[id];
      pl.hand.splice(a.hand, 1);
      pl.mana -= c.cost;
      if (c.kind === 'unit') {
        placeUnit(state, p, id, a.cell);
        log(state, `Player ${p + 1} fields ${cardLabel(c)} (${c.cost} mana).`);
      } else {
        pl.squadDiscard.push(id);
        log(state, `Player ${p + 1} plays ${cardLabel(c)} (${c.cost} mana).`);
      }
      if (c.effects) runEffects(state, c.effects, { p, target: a.target, cell: a.cell });
    } else if (a.t === 'move') {
      const u = state.board[a.from.r][a.from.c], dest = state.board[a.cell.r][a.cell.c];
      state.board[a.from.r][a.from.c] = null;
      u.moved = true;
      if (u.legend) u.steps--;
      else if (!hasKw(u, 'swift')) pl.moves--;
      u.since = pl.turns;
      if (dest) { dest.garrison = u; log(state, `${CARDS[u.id].name} climbs into the ${CARDS[dest.id].name}.`); }
      else {
        state.board[a.cell.r][a.cell.c] = u;
        claim(state, u, a.cell.r, a.cell.c);
        log(state, `${CARDS[u.id].name} ${u.stealth ? 'slips' : 'advances'} to ${tileName(a.cell)}.`);
        enterTile(state, u, a.cell.r, a.cell.c);
      }
    } else if (a.t === 'summon') {
      const lv = legendLevel(state, p), L = LEGEND_LEVELS[lv], u = makeUnit(state, p, 'LEGEND');
      u.atk = L.atk; u.hp = u.maxHp = L.hp; u.armor = u.maxArmor = L.armor; u.legend = true; u.level = lv; u.steps = LEGEND_STEPS;
      pl.mana -= L.cost;
      state.board[a.cell.r][a.cell.c] = u;
      claim(state, u, a.cell.r, a.cell.c);
      enterTile(state, u, a.cell.r, a.cell.c);
      log(state, `Player ${p + 1}'s king summons a level ${lv} Legend (${L.cost} mana).`);
    } else if (a.t === 'build') {
      const o = outpostAt(state, a.at.r, a.at.c);
      o.kind = a.kind;
      log(state, `Player ${p + 1} builds a ${OUTPOSTS[a.kind].name} at ${tileName(a.at)}.`);
    } else if (a.t === 'trap') {
      const u = state.board[a.from.r][a.from.c];
      u.ammo = 0; u.stealth = false;
      layTrap(state, p, a.cell, CARDS[u.id].trap);
      log(state, `${CARDS[u.id].name} lays a ${TRAPS[CARDS[u.id].trap].name} and is revealed.`);
    } else if (a.t === 'bomb') {
      const u = state.board[a.from.r][a.from.c];
      u.ammo = 0; u.stealth = false;
      log(state, `${CARDS[u.id].name} throws a bomb at ${tileName(a.cell)} and is revealed!`);
      explode(state, a.cell);
    } else if (a.t === 'attack') {
      const tile = state.board[a.from.r][a.from.c], att = a.g ? tile.garrison : tile, def = state.board[a.target.r][a.target.c];
      att.attacked = true;
      let raw = att.atk, sneak = false;
      if (att.stealth) { raw *= 2; sneak = true; att.stealth = false; }      // a sneak attack hits twice as hard and reveals the rogue
      const res = strike(state, att, a.from, def, a.target, raw);
      log(state, `${sneak ? 'Sneak attack! ' : ''}${CARDS[att.id].name} hits ${CARDS[def.id].name}${res.behind ? ' from behind' : ''} for ${describeHit(res)}.`);
      const adjacent = Math.max(Math.abs(a.from.r - a.target.r), Math.abs(a.from.c - a.target.c)) === 1;
      if (adjacent) {
        const defFwd = (a.from.r - a.target.r) * dirOf(def.p);               // >= 0: the attacker is in front of or beside the defender
        if (hasKw(def, 'counter')) {
          const counter = Math.floor(raw / 2);
          if (def.hp > 0 && !res.behind && defFwd >= 0 && counter > 0) {
            const back = strike(state, null, null, att, a.from, counter);
            log(state, `${CARDS[def.id].name} counters for ${describeHit(back)}.`);
          }
        } else if (def.atk > 0 && !hasKw(def, 'wall') && inRange(def, a.target, a.from)) {
          const back = strike(state, def, a.target, att, a.from, def.atk);
          log(state, `${CARDS[def.id].name} strikes back for ${describeHit(back)}.`);
        }
      }
    }
    cleanup(state);
    return state;
  }

  const VERSION = 'r15'; // bump whenever a rule or card changes: recorded games replay only on the version that recorded them
  const api = { VERSION, ROWS, COLS, KING_C, KING_HP, HAND_MAX, START_HAND, MAX_MANA, MOVES, MAX_TURNS, HOME_ROWS, DEFENCE_ZONE, OUTPOSTS, LEGEND_LEVELS, LEGEND_STEPS, levelFor, legendLevel, legendOf, summonTiles, tileCount, grabTiles, grabCentres, outpostAt, heldOutposts, ownerAt, SYM, SUIT_ROLE, CLS_SYM, TRAPS, CARDS, DECK, INF_DECK, newGame, legalActions, applyAction, clone, hasKw, suitOf, isKing, isInf, sameRef, locEq, backRow, dirOf, kingOf, inRange, reachTiles, attackTargets, spawnTiles, spawnTilesFor, moveDests, trapAt, unitAt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TBC = api;
})(typeof window !== 'undefined' ? window : globalThis);
