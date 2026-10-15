// Run: node test.js
const assert = require('assert');
const E = require('./engine.js');
require('./ai.js');

function checkInvariants(s) {
  const uids = new Set();
  let kings = 0;
  for (let r = 0; r < E.ROWS; r++) for (let c = 0; c < E.COLS; c++) {
    const u = s.board[r][c];
    if (!u) continue;
    if (E.isKing(u)) { kings++; assert.strictEqual(r, E.backRow(u.p)); assert.strictEqual(c, E.KING_C); }
    else assert(u.hp > 0, 'dead unit left on board');
    assert(!uids.has(u.uid), 'duplicate uid'); uids.add(u.uid);
    assert(u.armor >= 0 && u.armor <= u.maxArmor, 'armour out of range');
    if (u.garrison) { assert.strictEqual(u.garrison.p, u.p, 'garrison belongs to the tower owner'); assert(E.hasKw(u, 'tower'), 'only towers hold archers'); }
  }
  assert.strictEqual(kings, 2);
  for (const pl of s.players) {
    assert(pl.hand.length <= E.HAND_MAX, 'hand over 8');
    assert(pl.mana >= 0 && pl.mana <= pl.maxMana && pl.maxMana <= E.MAX_MANA + 4, 'mana out of range');
    assert(pl.moves >= 0);
  }
}

function play(seed, pick) {
  const s = E.newGame(seed);
  for (let step = 0; s.winner == null; step++) {
    assert(step < 14000, 'game did not terminate (seed ' + seed + ')');
    E.applyAction(s, pick(s));
    checkInvariants(s);
  }
  return s;
}

const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const randomPick = (r) => (st) => { const acts = E.legalActions(st); return acts[Math.floor(r() * acts.length)]; };

// --- decks
assert.strictEqual(E.DECK.length, 55, '52 standard cards + the Siege Tower + 2 Land Grabs');
assert.strictEqual(new Set(E.DECK).size, 55);
assert.strictEqual(E.INF_DECK.length, 38, '36 + 2 extra rogues');
const cls = (c) => E.INF_DECK.filter((id) => E.CARDS[id].cls === c).length;
assert.deepStrictEqual([cls('melee'), cls('ranged'), cls('defence'), cls('rogue')], [10, 10, 10, 8]);
for (const id of E.INF_DECK) { const c = E.CARDS[id]; assert.strictEqual(c.cost, 0, 'infantry are free'); if (c.cls === 'melee') assert.deepStrictEqual([c.atk, c.armor], [2, 1]); if (c.cls === 'ranged') assert.deepStrictEqual([c.atk, c.armor], [1, 1]); if (c.cls === 'defence') assert.deepStrictEqual([c.atk, c.armor], [0, 3]); if (c.cls === 'rogue') assert.deepStrictEqual([c.atk, c.armor], [1, 2]); }
for (const id of E.DECK) assert(E.CARDS[id].cost >= 1 && E.CARDS[id].cost <= 8, 'squad cards cost 1-8 mana: ' + id);

// --- helpers
function fresh() {
  const s = E.newGame(1);
  for (const pl of s.players) { pl.hand = []; pl.infHand = []; pl.mana = pl.maxMana = 10; pl.moves = 3; pl.swaps = 1; }
  s.log = [];
  return s;
}
const put = (s, p, r, c, id) => {
  const k = E.CARDS[id];
  return (s.board[r][c] = { uid: ++s.uid, id, p, atk: k.atk, hp: k.hp, maxHp: k.hp, armor: k.armor, maxArmor: k.armor, attacked: false, moved: false, fresh: false, trapped: false, stealth: !!k.rogue, ammo: k.rogue ? 1 : 0, garrison: null, poison: 0, stuck: 0, blind: 0, immobile: false, disarmed: false, since: 0 });
};
const acts = (s, t) => E.legalActions(s).filter((a) => a.t === t);
const attack = (s, from, target, extra) => E.applyAction(s, Object.assign({ t: 'attack', from, target }, extra));
const hits = (s) => acts(s, 'attack').map((a) => `${a.target.r},${a.target.c}`).sort();
const endTurns = (s, n) => { for (let i = 0; i < n; i++) E.applyAction(s, { t: 'end' }); };

// --- the hand and mana
{
  const s = E.newGame(7);
  assert.deepStrictEqual(s.players.map((p) => p.hand.length), [5, 5], 'both players start with 5 cards');
  assert.deepStrictEqual([s.players[0].mana, s.players[0].maxMana], [1, 1], 'mana is 1 on your first turn');
  assert.strictEqual(s.players[0].infHand.length, 1, 'a free infantry is dealt each turn');
  endTurns(s, 1);
  assert.strictEqual(s.players[1].hand.length, 6, 'the second player draws on their first turn');
  assert.strictEqual(s.players[1].mana, 1);
  endTurns(s, 1);
  assert.deepStrictEqual([s.players[0].hand.length, s.players[0].mana], [6, 2], 'player 1 draws from turn 2 on, and has 2 mana');
  for (let i = 0; i < 40; i++) endTurns(s, 1);
  assert(s.players.every((p) => p.maxMana === 10), 'mana stops at 10');
  assert(s.players.every((p) => p.hand.length <= 8), 'hand stops at 8');
}
{ // a full hand sends the drawn card to the bottom of the deck
  const s = fresh();
  s.players[0].hand = ['SA', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'];
  s.players[0].deck = ['H2', 'HA'];
  const before = s.players[0].deck.length;
  endTurns(s, 2);                                      // back to player 0, who draws
  assert.strictEqual(s.players[0].hand.length, 8);
  assert.strictEqual(s.players[0].deck[0], 'HA', 'the card that did not fit went to the bottom');
  assert.strictEqual(s.players[0].deck.length, before);
}
{ // cards cost mana; any number can be played in a turn; boosts go to the discard pile
  const s = fresh();
  s.players[0].maxMana = s.players[0].mana = 5;
  s.players[0].hand = ['SA', 'CA', 'S5', 'H10'];       // costs 1, 1, 5, 2
  const playable = () => acts(s, 'play').map((a) => s.players[0].hand[a.hand]);
  assert(playable().includes('S5'), 'a 5-cost card is affordable with 5 mana');
  E.applyAction(s, acts(s, 'play').find((a) => s.players[0].hand[a.hand] === 'SA'));
  E.applyAction(s, acts(s, 'play').find((a) => s.players[0].hand[a.hand] === 'CA'));
  assert.strictEqual(s.players[0].mana, 3, 'costs are paid');
  assert(!playable().includes('S5'), 'a 5-cost card is no longer affordable with 3 mana');
  E.applyAction(s, acts(s, 'play').find((a) => s.players[0].hand[a.hand] === 'H10'));
  assert.strictEqual(s.players[0].mana, 1);
  assert.deepStrictEqual(s.players[0].squadDiscard, ['CA', 'H10'], 'boosts go to the discard pile');
  assert.strictEqual(s.board[0].filter((u) => u && u.id === 'SA').length, 1, 'units go to the board');
}
{ // the free infantry: place it anywhere legal, or pay 1 mana (once a turn) to swap it; an unplaced one goes to the bottom
  const s = fresh();
  s.players[0].infHand = ['iSword'];
  const m0 = s.players[0].mana;
  E.applyAction(s, acts(s, 'deploy')[0]);
  assert.strictEqual(s.players[0].mana, m0, 'infantry are free');
  assert.strictEqual(s.players[0].infHand.length, 0);
  const t = fresh();
  t.players[0].infHand = ['iSword']; t.players[0].infDeck = ['iArcher', 'iGuard'];
  E.applyAction(t, acts(t, 'swapInf')[0]);
  assert.strictEqual(t.players[0].mana, 9, 'a swap costs 1 mana');
  assert.deepStrictEqual(t.players[0].infHand, ['iGuard'], 'a new infantry is dealt');
  assert.strictEqual(t.players[0].infDeck[0], 'iSword', 'the old one goes to the bottom');
  assert.strictEqual(acts(t, 'swapInf').length, 0, 'one swap per turn');
  const u = fresh();
  u.players[0].infHand = ['iSword']; u.players[0].infDeck = ['iArcher'];
  endTurns(u, 1);
  assert.strictEqual(u.players[0].infDeck[0], 'iSword', 'an unplaced infantry goes to the bottom of the deck');
  const r = fresh();
  r.players[0].hand = ['C7'];
  E.applyAction(r, acts(r, 'play')[0]);
  assert.strictEqual(r.players[0].infHand.length, 1, 'Reinforcements deals an extra infantry');
}
{ // new cards appear on your own back row; defence units may also go around the king; overflow when the usual tiles are full
  const s = fresh();
  s.players[0].infHand = ['iSword'];
  assert(acts(s, 'deploy').every((a) => a.cell.r === 0), 'melee infantry go on the back row');
  s.players[0].infHand = ['iShield'];
  assert(acts(s, 'deploy').some((a) => a.cell.r > 0), 'defence infantry may go in front of the king');
  s.players[0].hand = ['S4', 'D4'];
  const fort = acts(s, 'play').filter((a) => a.hand === 0).map((a) => `${a.cell.r},${a.cell.c}`);
  assert(fort.includes('1,3') && fort.includes('2,2') && fort.includes('0,1') && !fort.includes('3,3'));
  assert(acts(s, 'play').filter((a) => a.hand === 1).every((a) => a.cell.r === 0));
  const o = fresh();
  for (let c = 0; c < E.COLS; c++) if (c !== E.KING_C) put(o, 0, 0, c, 'iSpear');
  o.players[0].infHand = ['iSword'];
  const cells = acts(o, 'deploy').map((a) => a.cell);
  assert(cells.length > 0 && cells.every((c) => c.r === 1), 'overflow: with the back row full, the next row is allowed');
  const p1 = E.newGame(3); endTurns(p1, 1);
  assert(acts(p1, 'deploy').every((a) => a.cell.r === E.ROWS - 1 || E.CARDS[p1.players[1].infHand[a.pick]].reach === 'defence'), 'player 1 spawns on its own back row');
}
{ // moves: up to 3, one step each, never backward for ordinary units; new units can't move
  const s = fresh();
  for (let c = 0; c < 4; c++) put(s, 0, 2, c, 'iSword');
  const mv = acts(s, 'move');
  assert(mv.length > 0 && mv.every((m) => m.cell.r >= m.from.r), 'no backward moves');
  E.applyAction(s, mv.find((m) => m.from.c === 0));
  assert(!acts(s, 'move').some((m) => m.from.c === 0), 'a unit moves at most once per turn');
  E.applyAction(s, acts(s, 'move').find((m) => m.from.c === 1));
  E.applyAction(s, acts(s, 'move').find((m) => m.from.c === 2));
  assert.strictEqual(acts(s, 'move').length, 0, 'three moves used up');
  const n = fresh();
  n.players[0].infHand = ['iSword'];
  E.applyAction(n, acts(n, 'deploy')[0]);
  assert.strictEqual(acts(n, 'move').length, 0, 'freshly placed units cannot move');
  endTurns(n, 2);
  assert(acts(n, 'move').length > 0, 'but can on your next turn');
}
{ // an empty squad deck is rebuilt from its own discard pile; running out is never a loss
  const s = fresh();
  s.players[1].deck = []; s.players[1].squadDiscard = ['DA', 'D2', 'D3'];
  s.players[1].infDeck = []; s.players[1].infDiscard = ['iSword', 'iBrute'];
  endTurns(s, 1);
  assert.strictEqual(s.winner, null);
  assert.strictEqual(s.players[1].hand.length, 1, 'drew from the rebuilt deck');
  assert.strictEqual(s.players[1].deck.length, 2);
  assert.strictEqual(s.players[1].infHand.length, 1);
  const s2 = fresh();
  s2.players[1].deck = []; s2.players[1].squadDiscard = []; s2.players[1].infDeck = []; s2.players[1].infDiscard = [];
  endTurns(s2, 1);
  assert.strictEqual(s2.winner, null, 'even with nothing left, the game goes on');
}

// --- reach shapes (melee 8 around, range 2nd and 3rd row ahead, 3 wide)
{
  const m = fresh();
  put(m, 0, 3, 3, 'iSword');
  for (const [r, c] of [[2,2],[2,3],[2,4],[3,2],[3,4],[4,2],[4,3],[4,4]]) put(m, 1, r, c, 'iSpear');
  put(m, 1, 5, 3, 'iSpear');
  assert.strictEqual(hits(m).length, 8, 'melee hits all 8 neighbours'); assert(!hits(m).includes('5,3'));
  const r = fresh();
  put(r, 0, 3, 3, 'iArcher');
  for (const [rr, c] of [[4,3],[5,2],[5,3],[5,4],[5,5],[6,2],[6,4],[6,5],[2,3],[3,4]]) put(r, 1, rr, c, 'iSpear');
  assert.deepStrictEqual(hits(r), ['5,2','5,3','5,4','6,2','6,4'], 'range = 2nd and 3rd rows ahead, 3 wide');
  const q = fresh();
  put(q, 1, 5, 3, 'iArcher'); put(q, 0, 3, 3, 'iSpear'); put(q, 0, 6, 3, 'iSpear');
  E.applyAction(q, { t: 'end' });
  assert.deepStrictEqual(hits(q), ['3,3'], 'player 1 shoots down the board');
}

// --- armour plates and counters
{ // a normal hit removes ceil(attack / 2) plates and leaves health alone
  const s = fresh();
  put(s, 0, 3, 3, 'iSword'); put(s, 1, 4, 3, 'iShield');           // 2 attack into armour 3, health 3
  attack(s, { r: 3, c: 3 }, { r: 4, c: 3 });
  assert.strictEqual(s.board[4][3].armor, 2); assert.strictEqual(s.board[4][3].hp, 3);
  const c = s.board[3][3];
  assert.strictEqual(c.armor, 0, 'the counter (half of 2 = 1) took the swordsman\'s plate');
  assert.strictEqual(c.hp, 2, 'and left its health alone');
  // once the plates are gone, hits go to health at full strength
  s.board[4][3].armor = 0;
  s.board[3][3].attacked = false;
  attack(s, { r: 3, c: 3 }, { r: 4, c: 3 });
  assert.strictEqual(s.board[4][3].hp, 1);
  // a 1-attack archer still scratches armour 1 (round up)
  const a = fresh();
  put(a, 0, 3, 3, 'iArcher'); put(a, 1, 5, 3, 'iSword');
  attack(a, { r: 3, c: 3 }, { r: 5, c: 3 });
  assert.strictEqual(a.board[5][3].armor, 0); assert.strictEqual(a.board[5][3].hp, 2);
}
{ // breach ignores armour and does double to spades
  const s = fresh();
  put(s, 0, 3, 3, 'DA'); put(s, 1, 4, 3, 'iShield');                // Ram, 4 breach vs health 3
  attack(s, { r: 3, c: 3 }, { r: 4, c: 3 });
  assert.strictEqual(s.board[4][3], null, 'ram crushes a shieldman through its armour');
  const s2 = fresh();
  put(s2, 0, 3, 3, 'DA'); put(s2, 1, 4, 3, 'S4');                   // Fortress 6 health, armour 3
  attack(s2, { r: 3, c: 3 }, { r: 4, c: 3 });
  assert.strictEqual(s2.board[4][3], null, 'ram does double (8) to a spade wall');
}
{ // defence infantry: no attack, counter half the attacker's strength only if it survives, melee only, front or sides
  const s = fresh();
  put(s, 1, 4, 3, 'iShield');
  assert(!acts(E.applyAction(s, { t: 'end' }) && s, 'attack').length, 'defence infantry cannot attack');
  const k = fresh();
  put(k, 0, 3, 3, 'DA'); put(k, 1, 4, 3, 'iShield');
  attack(k, { r: 3, c: 3 }, { r: 4, c: 3 });
  assert.strictEqual(k.board[3][3].hp, 3, 'a killed defender cannot counter');
  const rg = fresh();
  put(rg, 0, 2, 3, 'iArcher'); put(rg, 1, 4, 3, 'iShield');
  attack(rg, { r: 2, c: 3 }, { r: 4, c: 3 });
  assert.strictEqual(rg.board[2][3].armor, 1, 'ranged attackers are never countered');
  const sd = fresh();                                                // from the side
  put(sd, 0, 4, 2, 'iSword'); put(sd, 1, 4, 3, 'iShield');
  attack(sd, { r: 4, c: 2 }, { r: 4, c: 3 });
  assert.strictEqual(sd.board[4][2].armor, 0, 'countered from the side');
  const bh = fresh();                                                // from behind (the shield faces down the board)
  put(bh, 0, 5, 3, 'iSword'); put(bh, 1, 4, 3, 'iShield');
  attack(bh, { r: 5, c: 3 }, { r: 4, c: 3 });
  assert.strictEqual(bh.board[4][3].armor, 1, 'double damage from behind: 4 strength removes 2 plates');
  assert.strictEqual(bh.board[5][3].armor, 1, 'and no counter from behind');
}
{ // walls: no attack, never counter, double damage from behind
  const s = fresh();
  put(s, 1, 4, 3, 'S3');
  E.applyAction(s, { t: 'end' });
  assert(!acts(s, 'attack').length, 'walls cannot attack');
  const w = fresh();
  put(w, 0, 3, 3, 'iSword'); put(w, 1, 4, 3, 'S3');
  attack(w, { r: 3, c: 3 }, { r: 4, c: 3 });
  assert.strictEqual(w.board[3][3].armor, 1, 'a wall does not counter');
  for (const id of ['S3', 'S4', 'D' + 'T']) assert.strictEqual(E.CARDS[id].atk, 0);
}

// --- rogues
{ // hidden rogues can't be targeted by attacks or boosts
  const s = fresh();
  put(s, 0, 3, 3, 'iSword'); put(s, 1, 4, 3, 'iPoisoner'); put(s, 1, 4, 4, 'iSword');
  assert.deepStrictEqual(hits(s), ['4,4'], 'only the visible swordsman can be attacked');
  s.players[0].hand = ['H9'];
  assert(!acts(s, 'play').some((a) => a.target && a.target.c === 3), 'Fire Arrows cannot pick a hidden rogue');
  s.board[4][3].stealth = false;
  assert(hits(s).includes('4,3'), 'a revealed rogue can be attacked');
}
{ // a hidden rogue moves up to 2 tiles in any direction, a revealed one moves like everyone else
  const s = fresh();
  put(s, 0, 3, 3, 'iTrapper');
  const m = acts(s, 'move').map((x) => `${x.cell.r},${x.cell.c}`);
  for (const t of ['4,3', '5,3', '2,3', '1,3', '3,2', '3,1', '3,4', '3,5', '4,2', '4,4', '2,2', '2,4']) assert(m.includes(t), 'can reach ' + t);
  assert.strictEqual(m.length, 12);
  s.board[3][3].stealth = false;
  const m2 = acts(s, 'move').map((x) => `${x.cell.r},${x.cell.c}`).sort();
  assert.deepStrictEqual(m2, ['3,2', '3,4', '4,3'], 'revealed: one step forward or sideways');
}
{ // one trap per rogue, ever: it is revealed, loses its trap and fights on as a melee unit
  const s = fresh();
  const rg = put(s, 0, 2, 3, 'iPoisoner');
  const tr = acts(s, 'trap');
  assert.strictEqual(tr.length, 8, 'a trap can go on any of the 8 adjacent empty tiles');
  E.applyAction(s, tr.find((a) => a.cell.r === 3 && a.cell.c === 3));
  assert.strictEqual(rg.stealth, false); assert.strictEqual(rg.ammo, 0);
  assert.strictEqual(s.traps.length, 1);
  E.applyAction(s, { t: 'end' }); E.applyAction(s, { t: 'end' });
  assert.strictEqual(acts(s, 'trap').length, 0, 'no more traps');
  put(s, 1, 3, 4, 'iSword');
  assert(hits(s).includes('3,4'), 'it can attack now');
  assert(!acts(s, 'move').some((m) => m.cell.r === 3 && m.cell.c === 3), 'you cannot walk onto your own trap');
}
{ // sneak attack: double damage, reveals the rogue, and the trap is gone (only usable while hidden)
  const s = fresh();
  const rg = put(s, 0, 3, 3, 'iTrapper'); put(s, 1, 4, 3, 'iSword'); s.board[4][3].armor = 0;
  attack(s, { r: 3, c: 3 }, { r: 4, c: 3 });
  assert.strictEqual(s.board[4][3], null, 'a 1-attack rogue sneaks for 2 and kills a 2-health swordsman');
  assert.strictEqual(rg.stealth, false);
  assert.strictEqual(acts(s, 'trap').length, 0, 'revealed rogues cannot lay traps');
  const t = fresh();
  const rg2 = put(t, 0, 3, 3, 'iTrapper');
  E.applyAction(t, acts(t, 'trap')[0]);
  put(t, 1, 4, 3, 'iSword'); t.board[4][3].armor = 0;
  attack(t, { r: 3, c: 3 }, { r: 4, c: 3 });
  assert.strictEqual(t.board[4][3].hp, 1, 'after laying its trap the rogue hits for 1, no sneak bonus');
}
{ // bombs: exactly 2 tiles away, 1 damage to the 3x3 around the landing spot (ignoring armour), friends and kings too, misses hidden units
  const s = fresh();
  put(s, 0, 3, 3, 'iBomber');
  const b = acts(s, 'bomb');
  assert.strictEqual(b.length, 16, 'the ring of tiles exactly 2 away');
  assert(b.every((a) => Math.max(Math.abs(a.cell.r - 3), Math.abs(a.cell.c - 3)) === 2));
  put(s, 1, 5, 3, 'iShield'); put(s, 1, 5, 4, 'iSword'); put(s, 0, 4, 2, 'iSpear'); put(s, 1, 6, 6, 'iSword'); put(s, 1, 4, 4, 'iPoisoner');
  E.applyAction(s, b.find((a) => a.cell.r === 5 && a.cell.c === 3));
  assert.strictEqual(s.board[5][3].hp, 2, 'the shieldman takes 1 to health despite its armour'); assert.strictEqual(s.board[5][3].armor, 3);
  assert.strictEqual(s.board[5][4].hp, 1, 'neighbouring enemy hit');
  assert.strictEqual(s.board[4][2].hp, 1, 'friendly spearman on the edge of the blast hit too');
  assert.strictEqual(s.board[6][6].hp, 2, 'far unit untouched');
  assert.strictEqual(s.board[4][4].hp, 2, 'a hidden rogue is missed');
  assert.strictEqual(s.board[3][3].hp, 2, 'the bomber is 2 away from the landing tile, so it is safe');
  assert.strictEqual(acts(s, 'bomb').length, 0, 'one bomb only');
  const k = fresh();
  put(k, 0, E.ROWS - 3, 3, 'iBomber');
  const before = E.kingOf(k, 1).hp;
  E.applyAction(k, acts(k, 'bomb').find((a) => a.cell.r === E.ROWS - 1 && a.cell.c === 3));
  assert.strictEqual(E.kingOf(k, 1).hp, before - 1, 'bombs hit castles');
}
{ // trap effects: poison 1 a turn for 2 turns, sticky = no move for a turn, flash = no attack for a turn
  const run = (id) => {
    const s = fresh();
    put(s, 0, 2, 3, id);
    E.applyAction(s, acts(s, 'trap').find((a) => a.cell.r === 3 && a.cell.c === 3));
    E.applyAction(s, { t: 'end' });
    const v = put(s, 1, 4, 3, 'iSword');
    E.applyAction(s, acts(s, 'move').find((m) => m.from.r === 4 && m.cell.r === 3 && m.cell.c === 3));
    assert.strictEqual(s.traps.length, 0, 'trap is used up');
    return { s, v };
  };
  let { s, v } = run('iPoisoner');
  assert.strictEqual(v.poison, 2);
  E.applyAction(s, { t: 'end' }); E.applyAction(s, { t: 'end' });
  assert.strictEqual(v.hp, 1, 'first poison tick'); E.applyAction(s, { t: 'end' }); E.applyAction(s, { t: 'end' });
  assert.strictEqual(s.board[3][3], null, 'second tick kills a 2-health swordsman');
  ({ s, v } = run('iTrapper'));
  E.applyAction(s, { t: 'end' }); E.applyAction(s, { t: 'end' });
  assert(!acts(s, 'move').some((m) => m.from.r === 3 && m.from.c === 3), 'the stuck unit cannot move on its next turn');
  E.applyAction(s, { t: 'end' }); E.applyAction(s, { t: 'end' });
  assert(acts(s, 'move').some((m) => m.from.r === 3 && m.from.c === 3), 'and moves freely the turn after');
  ({ s, v } = run('iSaboteur'));
  put(s, 0, 2, 3, 'iSpear');
  E.applyAction(s, { t: 'end' }); E.applyAction(s, { t: 'end' });
  assert(!acts(s, 'attack').some((a) => a.from.r === 3), 'a blinded unit cannot attack on its next turn');
  E.applyAction(s, { t: 'end' }); E.applyAction(s, { t: 'end' });
  assert(acts(s, 'attack').some((a) => a.from.r === 3), 'and attacks normally after that');
}

// --- siege tower
{
  const s = fresh();
  const tw = put(s, 0, 1, 3, 'DT');
  assert(!acts(s, 'attack').length, 'a tower has no attack of its own');
  put(s, 0, 1, 2, 'iArcher').moved = false;
  const into = acts(s, 'move').find((m) => m.from.r === 1 && m.from.c === 2 && m.cell.r === 1 && m.cell.c === 3);
  assert(into, 'an archer can step into a friendly tower');
  E.applyAction(s, into);
  assert(tw.garrison && tw.garrison.id === 'iArcher'); assert.strictEqual(s.board[1][2], null);
  put(s, 0, 1, 4, 'iArcher');
  assert(!acts(s, 'move').some((m) => m.from.c === 4 && m.cell.c === 3), 'a tower holds only one archer');
  // the garrisoned archer shoots from the tower tile; the enemy can only hit the tower
  put(s, 1, 3, 3, 'iSword');
  tw.garrison.attacked = false;
  const sh = acts(s, 'attack').filter((a) => a.g);
  assert(sh.length === 1 && sh[0].target.r === 3, 'the archer inside shoots 2 rows ahead');
  E.applyAction(s, sh[0]);
  assert.strictEqual(s.board[3][3].armor, 0, 'the archer\'s 1 attack removed the swordsman\'s plate');
  E.applyAction(s, { t: 'end' });
  put(s, 1, 2, 3, 'iSword').fresh = false;
  const foe = acts(s, 'attack').filter((a) => a.from.r === 2);
  assert.strictEqual(foe.filter((a) => a.target.r === 1 && a.target.c === 3).length, 1, 'enemies target the tower tile (the archer inside is not a separate target)');
  // when the tower falls the archer drops out
  tw.hp = 0;
  E.applyAction(s, { t: 'end' });
  assert(s.board[1][3] && s.board[1][3].id === 'iArcher', 'the archer drops out onto the tower\'s tile');
  const d = fresh();
  d.players[0].infHand = ['iArcher'];
  put(d, 0, 1, 3, 'DT');
  const into2 = acts(d, 'deploy').filter((a) => a.cell.r === 1 && a.cell.c === 3);
  assert(into2.length === 1, 'an archer card can be placed straight into the tower');
  E.applyAction(d, into2[0]);
  assert.strictEqual(d.board[1][3].garrison.id, 'iArcher');
  const n = fresh(); n.players[0].infHand = ['iSword']; put(n, 0, 1, 3, 'DT');
  assert(!acts(n, 'deploy').some((a) => a.cell.r === 1 && a.cell.c === 3), 'only archers go in towers');
}

// --- boosts, zones
{ // Rally buffs infantry only; Conscription deploys 3 now
  const s = fresh();
  put(s, 0, 0, 2, 'iSword'); put(s, 0, 0, 5, 'S3');
  s.players[0].hand = ['CA'];
  E.applyAction(s, { t: 'play', hand: 0 });
  assert.strictEqual(s.board[0][2].atk, 3); assert.strictEqual(s.board[0][5].atk, 0, 'walls are not infantry');
  const s2 = fresh();
  s2.players[0].hand = ['C8'];
  E.applyAction(s2, { t: 'play', hand: 0 });
  assert.strictEqual(s2.board[0].filter((u) => u && !E.isKing(u)).length, 3);
}
{ // armour boosts raise the plate pool; Reinforce restores it
  const s = fresh();
  const w = put(s, 0, 1, 3, 'S2');
  s.players[0].hand = ['S7'];
  E.applyAction(s, acts(s, 'play').find((a) => a.target.r === 1));
  assert.deepStrictEqual([w.armor, w.maxArmor, w.hp], [3, 3, 8]);
  w.armor = 0; w.hp = 1;
  s.players[0].hand = ['S9'];
  E.applyAction(s, { t: 'play', hand: 0 });
  assert.deepStrictEqual([w.armor, w.hp], [3, 8]);
}
{ // damage boosts only work on enemies inside the reach of one of your units
  const s = fresh();
  put(s, 1, 6, 3, 'iSword');
  s.players[0].hand = ['H9', 'H7'];
  assert.strictEqual(acts(s, 'play').length, 0, 'nothing in reach, so neither boost can be played');
  put(s, 0, 4, 3, 'iArcher');
  const pl = acts(s, 'play');
  assert(pl.some((a) => a.hand === 0 && a.target.r === 6) && pl.some((a) => a.hand === 1));
  const s2 = fresh();
  put(s2, 1, 6, 3, 'iSword'); put(s2, 1, 4, 5, 'iSword'); put(s2, 0, 1, 3, 'iSpear');
  s2.players[0].hand = ['H9'];
  assert.strictEqual(acts(s2, 'play').length, 0);
}
{ // reaching and killing the castle wins
  const s = fresh();
  put(s, 0, E.ROWS - 2, 3, 'iSword');
  const k = acts(s, 'attack');
  assert.strictEqual(k.length, 1);
  s.board[E.ROWS - 1][3].hp = 1;
  E.applyAction(s, k[0]);
  assert.strictEqual(s.winner, 0);
}


// --- territory, outposts, legend (r14)
{ // 9 rows; home territory; moving claims tiles and they stay yours
  assert.strictEqual(E.ROWS, 9);
  const s = fresh();
  assert.strictEqual(E.tileCount(s, 0), 28); assert.strictEqual(E.tileCount(s, 1), 28);
  put(s, 0, 3, 2, 'iSword');
  E.applyAction(s, { t: 'move', from: { r: 3, c: 2 }, cell: { r: 4, c: 2 } });
  assert.strictEqual(s.owner[4][2], 0, 'stepping onto neutral ground claims it');
  E.applyAction(s, { t: 'end' }); E.applyAction(s, { t: 'end' });
  E.applyAction(s, { t: 'move', from: { r: 4, c: 2 }, cell: { r: 5, c: 2 } });
  assert.strictEqual(s.owner[5][2], 0, 'stepping onto enemy ground claims it');
  assert.strictEqual(s.owner[4][2], 0, 'tiles stay yours after you leave');
  assert.strictEqual(E.tileCount(s, 0), 30); assert.strictEqual(E.tileCount(s, 1), 27);
}
{ // hidden rogues claim nothing; revealed ones do
  const s = fresh();
  put(s, 0, 3, 2, 'iTrapper');
  E.applyAction(s, { t: 'move', from: { r: 3, c: 2 }, cell: { r: 5, c: 2 } });
  assert.strictEqual(s.owner[5][2], 1, 'a hidden rogue claims no tiles');
}
{ // Land Grab
  const s = fresh();
  s.players[0].hand = ['CL'];
  const centres = acts(s, 'play').map((a) => a.target);
  assert(centres.every((t) => t.r >= 2), 'must be next to your own land');
  assert(!centres.some((t) => t.r === 0), 'a centre must flip something');
  E.applyAction(s, { t: 'play', hand: 0, target: { r: 4, c: 3 } });
  assert.strictEqual(E.tileCount(s, 0), 28 + 6);
  const s2 = fresh();
  put(s2, 1, 4, 3, 'iSword');
  s2.players[0].hand = ['CL'];
  E.applyAction(s2, { t: 'play', hand: 0, target: { r: 4, c: 3 } });
  assert.strictEqual(s2.owner[4][3], null, 'a tile with an enemy unit is not taken');
  assert.strictEqual(E.tileCount(s2, 0), 28 + 5);
}
{ // the king summons a legend; level and cost follow land; one at a time; cooldown after death
  const s = fresh();
  const sm = acts(s, 'summon');
  assert(sm.length > 0 && sm.every((a) => Math.max(Math.abs(a.cell.r - 0), Math.abs(a.cell.c - 3)) === 1));
  E.applyAction(s, sm[0]);
  const lg = s.board[sm[0].cell.r][sm[0].cell.c];
  assert(lg.legend && lg.level === 1 && lg.hp === 6 && lg.atk === 4 && lg.armor === 3);
  assert.strictEqual(s.players[0].mana, 9, 'level 1 costs 1 mana');
  assert.strictEqual(acts(s, 'summon').length, 0, 'only one legend at a time');
  assert.strictEqual(acts(s, 'move').filter((a) => a.from.r === lg.r).length, 0);
  lg.fresh = false;
  // 3 steps, doesn't use the 3 moves, claims every tile it lands on
  const at = sm[0].cell;
  let pos = { r: at.r, c: at.c };
  for (let i = 0; i < 3; i++) {
    const mv = acts(s, 'move').find((a) => a.from.r === pos.r && a.from.c === pos.c && a.cell.r === pos.r + 1);
    assert(mv, 'step ' + i);
    E.applyAction(s, mv); pos = mv.cell;
  }
  assert.strictEqual(s.players[0].moves, 3);
  assert.strictEqual(acts(s, 'move').filter((a) => a.from.r === pos.r && a.from.c === pos.c).length, 0, 'only 3 steps');
  assert.strictEqual(s.owner[pos.r][pos.c], 0);
  // dies -> cooldown equal to its cost
  s.board[pos.r][pos.c].hp = 0;
  E.applyAction(s, { t: 'end' }); E.applyAction(s, { t: 'end' });
  assert.strictEqual(s.players[0].legendCd, 0, 'killed legend: cooldown of 1 turn passes at my next turn start');
}
{ // level scales with land
  const s = fresh();
  assert.strictEqual(E.legendLevel(s, 0), 1);
  for (let r = 4; r < 7; r++) for (let c = 0; c < 7; c++) s.owner[r][c] = 0;
  assert(E.tileCount(s, 0) >= 38);
  assert.strictEqual(E.legendLevel(s, 0), 3);
  assert.strictEqual(acts(s, 'summon')[0] && s.players[0].mana >= 3, true);
  const before = s.players[0].mana;
  E.applyAction(s, acts(s, 'summon')[0]);
  assert.strictEqual(before - s.players[0].mana, 3);
  const lg = s.board[1][2] || s.board[1][3] || s.board[1][4] || s.board[0][2] || s.board[0][4];
  assert(lg && lg.level === 3 && lg.hp === 10);
}
{ // outposts: 4 of them in mirrored pairs; build after holding a full turn
  const s = E.newGame(7);
  assert.strictEqual(s.outposts.length, 4);
  for (const o of s.outposts) assert(s.outposts.some((q) => q.r === E.ROWS - 1 - o.r && q.c === E.COLS - 1 - o.c), 'mirrored');
  const t = fresh();
  t.outposts = [{ r: 4, c: 3, kind: null }];
  const u = put(t, 0, 3, 3, 'iSword');
  E.applyAction(t, { t: 'move', from: { r: 3, c: 3 }, cell: { r: 4, c: 3 } });
  assert.strictEqual(acts(t, 'build').length, 0, 'not on the turn you arrive');
  t.players[0].turns++;                                  // a full turn later
  assert.strictEqual(acts(t, 'build').length, 3);
  E.applyAction(t, { t: 'build', at: { r: 4, c: 3 }, kind: 'mine' });
  assert.strictEqual(t.outposts[0].kind, 'mine');
  assert.strictEqual(acts(t, 'build').length, 0);
  // gold mine: +1 mana at the start of your turn while you hold it
  E.applyAction(t, { t: 'end' }); E.applyAction(t, { t: 'end' });
  assert.strictEqual(t.players[0].maxMana, Math.min(10, t.players[0].turns) + 1);
}
{ // lookout: ranged unit shoots one tile further
  const s = fresh();
  s.outposts = [{ r: 3, c: 3, kind: 'lookout' }];
  put(s, 0, 3, 3, 'iArcher'); put(s, 1, 7, 3, 'iSword');
  assert.strictEqual(acts(s, 'attack').length, 1, 'range 4 from a lookout');
  const s2 = fresh();
  s2.outposts = [];
  put(s2, 0, 3, 3, 'iArcher'); put(s2, 1, 7, 3, 'iSword');
  assert.strictEqual(acts(s2, 'attack').length, 0);
}
{ // bunker: an extra infantry each turn and placement around it
  const s = fresh();
  s.outposts = [{ r: 4, c: 3, kind: 'bunker' }];
  put(s, 0, 4, 3, 'iSword');
  s.players[0].infHand = ['iSword'];
  const cells = acts(s, 'deploy').map((a) => a.cell);
  assert(cells.some((c) => c.r === 5 && c.c === 3), 'can place next to the bunker');
  E.applyAction(s, { t: 'end' }); E.applyAction(s, { t: 'end' });
  assert.strictEqual(s.players[0].infHand.length, 2, 'bunker deals an extra infantry');
}
{ // time limit: more tiles wins
  const s = fresh();
  s.turn = E.MAX_TURNS;
  s.active = 1;
  for (let c = 0; c < 7; c++) s.owner[4][c] = 0;
  E.applyAction(s, { t: 'end' });
  assert.strictEqual(s.winner, 0);
  assert(/tiles/.test(s.reason));
}


// --- arrival effects and death bonuses (r15)
{ // Heavy arrival effects
  const s = fresh();
  put(s, 1, 1, 4, 'iSword');                      // adjacent to the back row spot we play on
  s.players[0].hand = ['H3'];                     // Crossbow Battery: push adjacent enemies back
  E.applyAction(s, { t: 'play', hand: 0, cell: { r: 0, c: 4 } });
  assert(!s.board[1][4] && s.board[2][4] && s.board[2][4].id === 'iSword', 'the adjacent enemy is shoved back one tile');
  const t = fresh();
  put(t, 1, 1, 5, 'iTrapper');
  t.players[0].hand = ['H2'];                     // Longbowmen: reveal hidden enemies within 2
  E.applyAction(t, { t: 'play', hand: 0, cell: { r: 0, c: 4 } });
  assert.strictEqual(t.board[1][5].stealth, false);
  const w = fresh();
  w.players[0].hand = ['HK'];
  w.players[0].mana = 10;
  E.applyAction(w, { t: 'play', hand: 0, cell: { r: 0, c: 1 } });
  assert(w.traps.some((tr) => tr.p === 0 && tr.type === 'sticky'), 'Master Archer lays a sticky trap next to it');
}
{ // death bonuses
  const s = fresh();
  put(s, 0, 4, 3, 'D7'); s.board[4][3].hp = 0;    // Trebuchet leaves a skeleton
  E.applyAction(s, { t: 'end' });
  assert(s.board[4][3] && s.board[4][3].id === 'SKEL', 'a Skeleton rises');
  const t = fresh();
  put(t, 0, 4, 3, 'D3'); put(t, 1, 5, 3, 'iSword'); t.board[4][3].hp = 0;   // Mangonel: 1 damage to adjacent enemies
  E.applyAction(t, { t: 'end' });
  assert.strictEqual(t.board[5][3].hp, 1);
  const u = fresh();
  put(u, 0, 4, 3, 'S4'); u.board[4][3].hp = 0; u.owner[4][2] = null; u.owner[5][4] = 1;   // Fortress: its land stays yours
  E.applyAction(u, { t: 'end' });
  assert.strictEqual(u.owner[4][2], 0); assert.strictEqual(u.owner[5][4], 0);
  const m = fresh();
  put(m, 0, 4, 3, 'CK'); m.board[4][3].hp = 0;    // General: +1 mana next turn
  E.applyAction(m, { t: 'end' }); E.applyAction(m, { t: 'end' });
  assert.strictEqual(m.players[0].maxMana, Math.min(10, m.players[0].turns) + 1);
  const c = fresh();
  put(c, 0, 4, 3, 'D3'); put(c, 1, 5, 3, 'iSword'); put(c, 0, 5, 4, 'D3'); put(c, 1, 4, 4, 'iSword');
  c.board[4][3].hp = 0; c.board[5][4].hp = 0;
  E.applyAction(c, { t: 'end' });
  const hp = [c.board[5][3], c.board[4][4]].map((x) => (x ? x.hp : 0));
  assert(hp.every((h) => h <= 1), 'both Mangonels fired their death bonus');
}

// --- playouts
let wins = [0, 0, 0];
for (let seed = 1; seed <= 100; seed++) wins[play(seed, randomPick(rng(seed))).winner]++;
console.log('random vs random (100 games) wins P1/P2/draw:', wins.join('/'));

wins = [0, 0, 0];
let turns = 0;
for (let seed = 1; seed <= 30; seed++) { const s = play(seed, (st) => E.AI.chooseAction(st)); wins[s.winner]++; turns += s.turn; }
console.log('AI vs AI (30 games) wins P1/P2/draw:', wins.join('/'), '· avg turns', (turns / 30).toFixed(1));

let aiWins = 0;
for (let seed = 1; seed <= 30; seed++) {
  const r = rng(seed + 999), side = seed % 2, rp = randomPick(r);
  const s = play(seed, (st) => (st.active === side ? E.AI.chooseAction(st) : rp(st)));
  if (s.winner === side) aiWins++;
}
console.log('AI vs random (30 games): AI won', aiWins);
assert(aiWins >= 25, 'AI should beat random play');
console.log('All tests passed.');
