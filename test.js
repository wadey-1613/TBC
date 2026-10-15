// Run: node test.js   (rules r16: 5 wide x 7 deep play area, kings off the grid, 3 actions a turn)
const assert = require('assert');
const E = require('./engine.js');
require('./ai.js');

function checkInvariants(s) {
  const uids = new Set();
  let kings = 0;
  for (let r = 0; r < E.ROWS; r++) for (let c = 0; c < E.COLS; c++) {
    const u = s.board[r][c];
    if (!u) continue;
    assert((r > 0 && r < E.ROWS - 1) || c === E.KING_C, 'nothing lives on the void tiles of the king rows');
    if (E.isKing(u)) { kings++; assert.strictEqual(r, E.kingRow(u.p)); assert.strictEqual(c, E.KING_C); }
    else assert(u.hp > 0, 'dead unit left on board');
    assert(!uids.has(u.uid), 'duplicate uid'); uids.add(u.uid);
    assert(u.armor >= 0 && u.armor <= u.maxArmor, 'armour out of range');
    if (u.garrison) { assert.strictEqual(u.garrison.p, u.p, 'garrison belongs to the tower owner'); assert(E.hasKw(u, 'tower'), 'only towers hold archers'); }
  }
  assert.strictEqual(kings, 2);
  for (const pl of s.players) {
    assert(pl.hand.length <= E.HAND_MAX, 'hand over the limit');
    assert(pl.mana >= 0 && pl.mana <= pl.maxMana && pl.maxMana <= E.MAX_MANA + 2 + 3, 'mana out of range');
    assert(pl.ap >= 0, 'actions went negative');
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
const randomPick = (r) => (st) => { const a = E.legalActions(st); return a[Math.floor(r() * a.length)]; };

// --- decks
assert.strictEqual(E.DECK.length, 40, 'a 40-card squad deck');
assert.strictEqual(new Set(E.DECK).size, 40);
assert.strictEqual(E.INF_DECK.length, 38);
const cls = (c) => E.INF_DECK.filter((id) => E.CARDS[id].cls === c).length;
assert.deepStrictEqual([cls('melee'), cls('ranged'), cls('defence'), cls('rogue')], [10, 10, 10, 8]);
for (const id of E.INF_DECK) { const c = E.CARDS[id]; assert.strictEqual(c.cost, 0, 'infantry are free'); if (c.cls === 'melee') assert.deepStrictEqual([c.atk, c.armor], [2, 1]); if (c.cls === 'ranged') assert.deepStrictEqual([c.atk, c.armor], [1, 1]); if (c.cls === 'defence') assert.deepStrictEqual([c.atk, c.armor], [0, 3]); if (c.cls === 'rogue') assert.deepStrictEqual([c.atk, c.armor], [1, 2]); }
for (const id of E.DECK) assert(E.CARDS[id].cost >= 1 && E.CARDS[id].cost <= 8, 'squad cards cost 1-8 mana: ' + id);
assert.strictEqual(E.DECK.filter((id) => E.CARDS[id].kind === 'unit').length, 29, '29 units + 11 boosts');

// --- helpers
function fresh() {
  const s = E.newGame(1);
  for (const pl of s.players) { pl.hand = []; pl.infHand = []; pl.mana = pl.maxMana = 10; pl.ap = 3; }
  s.outposts = [];
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

// --- the board: 7 play rows, kings off the grid one row behind
{
  assert.deepStrictEqual([E.ROWS, E.COLS, E.KING_C], [9, 5, 2]);
  const s = E.newGame(2);
  assert.strictEqual(E.kingOf(s, 0), s.board[0][2]); assert.strictEqual(E.kingOf(s, 1), s.board[8][2]);
  assert.strictEqual(E.backRow(0), 1); assert.strictEqual(E.backRow(1), 7);
  assert(!E.unitAt(s, 0, 0), 'the corners of the king rows do not exist');
  assert.strictEqual(E.tileCount(s, 0), 16); assert.strictEqual(E.tileCount(s, 1), 16, '15 home tiles + the king tile each; 5 neutral tiles');
  assert.strictEqual(s.outposts.length, 2);
  for (const o of s.outposts) assert(s.outposts.some((q) => q.r === E.ROWS - 1 - o.r && q.c === E.COLS - 1 - o.c), 'mirrored');
  const deploy = E.legalActions(s).filter((a) => a.t === 'deploy');
  assert(deploy.every((a) => a.cell.r === 1 || E.CARDS[s.players[0].infHand[a.pick]].reach === 'defence'), 'new infantry appear on your back (first) row');
}

// --- the hand and mana
{
  const s = E.newGame(7);
  assert.deepStrictEqual(s.players.map((p) => p.hand.length), [4, 4], 'both players start with 4 cards');
  assert.deepStrictEqual([s.players[0].mana, s.players[0].ap], [1, 3], 'mana is 1 and you have 3 actions on turn 1');
  assert.strictEqual(s.players[0].infHand.length, 1, 'a free infantry is dealt each turn');
  endTurns(s, 1);
  assert.strictEqual(s.players[1].hand.length, 5);
  endTurns(s, 1);
  assert.deepStrictEqual([s.players[0].hand.length, s.players[0].mana], [5, 2]);
  for (let i = 0; i < 24; i++) endTurns(s, 1);
  assert(s.players.every((p) => p.maxMana === 10), 'mana stops at 10');
  assert(s.players.every((p) => p.hand.length <= 6), 'hand stops at 6');
}
{ // a full hand sends the drawn card to the bottom of the deck
  const s = fresh();
  s.players[0].hand = ['SA', 'S2', 'S3', 'S4', 'S5', 'S6'];
  s.players[0].deck = ['H2', 'HA'];
  endTurns(s, 2);
  assert.strictEqual(s.players[0].hand.length, 6);
  assert.strictEqual(s.players[0].deck[0], 'HA');
}
{ // cards cost mana; any number can be played in a turn; boosts go to the discard pile
  const s = fresh();
  s.players[0].maxMana = s.players[0].mana = 5;
  s.players[0].hand = ['SA', 'CA', 'S5', 'H9'];       // 1, 1, 5, 2
  const playable = () => acts(s, 'play').map((a) => s.players[0].hand[a.hand]);
  assert(playable().includes('S5'));
  E.applyAction(s, acts(s, 'play').find((a) => s.players[0].hand[a.hand] === 'SA'));
  E.applyAction(s, acts(s, 'play').find((a) => s.players[0].hand[a.hand] === 'CA'));
  assert.strictEqual(s.players[0].mana, 3, 'costs are paid');
  assert(!playable().includes('S5'));
  assert.deepStrictEqual(s.players[0].squadDiscard, ['CA'], 'boosts go to the discard pile');
  assert.strictEqual(s.players[0].ap, 3, 'playing cards costs mana, not actions');
  assert.strictEqual(acts(s, 'swapInf').length, 0, 'infantry swapping is gone');
}
{ // the free infantry is placed, or goes to the bottom of its deck; Reinforcements deals another
  const s = fresh();
  s.players[0].infHand = ['iSword'];
  E.applyAction(s, acts(s, 'deploy')[0]);
  assert.strictEqual(s.players[0].mana, 10); assert.strictEqual(s.players[0].infHand.length, 0);
  const u = fresh();
  u.players[0].infHand = ['iSword']; u.players[0].infDeck = ['iArcher'];
  endTurns(u, 1);
  assert.strictEqual(u.players[0].infDeck[0], 'iSword');
  const r = fresh();
  r.players[0].hand = ['C7'];
  E.applyAction(r, acts(r, 'play')[0]);
  assert.strictEqual(r.players[0].infHand.length, 1);
}
{ // defence units may go in your first two rows (within 2 tiles of the king); overflow when the back row is full
  const s = fresh();
  s.players[0].infHand = ['iSword'];
  assert(acts(s, 'deploy').every((a) => a.cell.r === 1));
  s.players[0].infHand = ['iShield'];
  assert(acts(s, 'deploy').some((a) => a.cell.r === 2), 'defence infantry may go one row forward');
  assert(!acts(s, 'deploy').some((a) => a.cell.r === 3));
  const o = fresh();
  for (let c = 0; c < E.COLS; c++) put(o, 0, 1, c, 'iSpear');
  o.players[0].infHand = ['iSword'];
  assert(acts(o, 'deploy').length > 0 && acts(o, 'deploy').every((a) => a.cell.r === 2), 'overflow: with the back row full, the next row is allowed');
  const p1 = E.newGame(3); endTurns(p1, 1);
  assert(acts(p1, 'deploy').every((a) => a.cell.r === 7 || E.CARDS[p1.players[1].infHand[a.pick]].reach === 'defence'));
}

// --- three actions a turn: a move or an attack costs one
{
  const s = fresh();
  for (let c = 0; c < 4; c++) put(s, 0, 2, c, 'iSword');
  put(s, 1, 4, 0, 'iSpear'); put(s, 1, 4, 3, 'iSpear');
  const mv = acts(s, 'move');
  assert(mv.length > 0 && mv.every((m) => m.cell.r >= m.from.r), 'no backward moves');
  E.applyAction(s, mv.find((m) => m.from.c === 0));
  assert(!acts(s, 'move').some((m) => m.from.c === 0), 'a unit moves at most once per turn');
  assert.strictEqual(s.players[0].ap, 2);
  E.applyAction(s, acts(s, 'move').find((m) => m.from.c === 1));
  E.applyAction(s, acts(s, 'move').find((m) => m.from.c === 2));
  assert.strictEqual(s.players[0].ap, 0);
  assert.strictEqual(acts(s, 'move').length, 0, 'actions used up');
  assert.strictEqual(acts(s, 'attack').length, 0, 'and attacking needs an action too');
  const n = fresh();
  n.players[0].infHand = ['iSword'];
  E.applyAction(n, acts(n, 'deploy')[0]);
  assert.strictEqual(acts(n, 'move').length, 0, 'freshly placed units cannot move');
  endTurns(n, 2);
  assert(acts(n, 'move').length > 0);
  const a = fresh();                                  // an attack costs an action
  put(a, 0, 3, 2, 'iSword'); put(a, 1, 4, 2, 'iSpear');
  attack(a, { r: 3, c: 2 }, { r: 4, c: 2 });
  assert.strictEqual(a.players[0].ap, 2);
  const w = fresh();                                  // a Champion's move is free, Forced March gives an extra action
  put(w, 0, 3, 1, 'CJ');
  E.applyAction(w, acts(w, 'move')[0]);
  assert.strictEqual(w.players[0].ap, 3, 'swift moves do not use an action');
  w.players[0].hand = ['C3'];
  E.applyAction(w, acts(w, 'play')[0]);
  assert.strictEqual(w.players[0].ap, 4);
}
{ // an empty squad deck is rebuilt from its own discard pile
  const s = fresh();
  s.players[1].deck = []; s.players[1].squadDiscard = ['DA', 'D2', 'D3'];
  s.players[1].infDeck = []; s.players[1].infDiscard = ['iSword', 'iBrute'];
  endTurns(s, 1);
  assert.strictEqual(s.winner, null);
  assert.strictEqual(s.players[1].hand.length, 1); assert.strictEqual(s.players[1].deck.length, 2);
}

// --- reach shapes (melee 8 around, range 2nd and 3rd row ahead, 3 wide)
{
  const m = fresh();
  put(m, 0, 3, 2, 'iSword');
  for (const [r, c] of [[2, 1], [2, 2], [2, 3], [3, 1], [3, 3], [4, 1], [4, 2], [4, 3]]) put(m, 1, r, c, 'iSpear');
  put(m, 1, 5, 2, 'iSpear');
  assert.strictEqual(hits(m).length, 8, 'melee hits all 8 neighbours'); assert(!hits(m).includes('5,2'));
  const r = fresh();
  put(r, 0, 2, 2, 'iArcher');
  for (const [rr, c] of [[3, 2], [4, 1], [4, 2], [4, 3], [4, 4], [5, 1], [5, 3], [1, 2], [2, 3]]) put(r, 1, rr, c, 'iSpear');
  assert.deepStrictEqual(hits(r), ['4,1', '4,2', '4,3', '5,1', '5,3'], 'range = 2nd and 3rd rows ahead, 3 wide');
  const q = fresh();
  put(q, 1, 5, 2, 'iArcher'); put(q, 0, 3, 2, 'iSpear'); put(q, 0, 6, 2, 'iSpear');
  E.applyAction(q, { t: 'end' });
  assert.deepStrictEqual(hits(q), ['3,2'], 'player 1 shoots down the board');
}

// --- armour plates and counters
{
  const s = fresh();
  put(s, 0, 3, 2, 'iSword'); put(s, 1, 4, 2, 'iShield');
  attack(s, { r: 3, c: 2 }, { r: 4, c: 2 });
  assert.strictEqual(s.board[4][2].armor, 2); assert.strictEqual(s.board[4][2].hp, 3);
  assert.strictEqual(s.board[3][2].armor, 0, 'the counter took the swordsman\'s plate'); assert.strictEqual(s.board[3][2].hp, 2);
  s.board[4][2].armor = 0; s.board[3][2].attacked = false;
  attack(s, { r: 3, c: 2 }, { r: 4, c: 2 });
  assert.strictEqual(s.board[4][2].hp, 1, 'with no plates left, hits go to health');
  const a = fresh();
  put(a, 0, 3, 2, 'iArcher'); put(a, 1, 5, 2, 'iSword');
  attack(a, { r: 3, c: 2 }, { r: 5, c: 2 });
  assert.strictEqual(a.board[5][2].armor, 0); assert.strictEqual(a.board[5][2].hp, 2);
}
{ // breach ignores armour and does double to spades
  const s = fresh();
  put(s, 0, 3, 2, 'DA'); put(s, 1, 4, 2, 'iShield');
  attack(s, { r: 3, c: 2 }, { r: 4, c: 2 });
  assert.strictEqual(s.board[4][2], null);
  const s2 = fresh();
  put(s2, 0, 3, 2, 'DA'); put(s2, 1, 4, 2, 'S4');
  attack(s2, { r: 3, c: 2 }, { r: 4, c: 2 });
  assert.strictEqual(s2.board[4][2], null);
}
{ // defence infantry: no attack, counter only if they survive, melee only, front or sides, double damage from behind
  const s = fresh();
  put(s, 1, 4, 2, 'iShield');
  E.applyAction(s, { t: 'end' });
  assert(!acts(s, 'attack').length, 'defence infantry cannot attack');
  const k = fresh();
  put(k, 0, 3, 2, 'DA'); put(k, 1, 4, 2, 'iShield');
  attack(k, { r: 3, c: 2 }, { r: 4, c: 2 });
  assert.strictEqual(k.board[3][2].hp, 3, 'a killed defender cannot counter');
  const rg = fresh();
  put(rg, 0, 2, 2, 'iArcher'); put(rg, 1, 4, 2, 'iShield');
  attack(rg, { r: 2, c: 2 }, { r: 4, c: 2 });
  assert.strictEqual(rg.board[2][2].armor, 1, 'ranged attackers are never countered');
  const sd = fresh();
  put(sd, 0, 4, 1, 'iSword'); put(sd, 1, 4, 2, 'iShield');
  attack(sd, { r: 4, c: 1 }, { r: 4, c: 2 });
  assert.strictEqual(sd.board[4][1].armor, 0, 'countered from the side');
  const bh = fresh();
  put(bh, 0, 5, 2, 'iSword'); put(bh, 1, 4, 2, 'iShield');
  attack(bh, { r: 5, c: 2 }, { r: 4, c: 2 });
  assert.strictEqual(bh.board[4][2].armor, 1); assert.strictEqual(bh.board[5][2].armor, 1, 'no counter from behind');
}
{ // walls never attack or counter
  const s = fresh();
  put(s, 1, 4, 2, 'S3');
  E.applyAction(s, { t: 'end' });
  assert(!acts(s, 'attack').length);
  const w = fresh();
  put(w, 0, 3, 2, 'iSword'); put(w, 1, 4, 2, 'S3');
  attack(w, { r: 3, c: 2 }, { r: 4, c: 2 });
  assert.strictEqual(w.board[3][2].armor, 1);
}

// --- rogues
{ // hidden rogues can't be targeted
  const s = fresh();
  put(s, 0, 3, 2, 'iSword'); put(s, 1, 4, 2, 'iPoisoner'); put(s, 1, 4, 3, 'iSword');
  assert.deepStrictEqual(hits(s), ['4,3']);
  s.players[0].hand = ['H9'];
  assert(!acts(s, 'play').some((a) => a.target && a.target.c === 2));
  s.board[4][2].stealth = false;
  assert(hits(s).includes('4,2'));
}
{ // a hidden rogue moves 2 tiles any direction; a revealed one moves like everyone else
  const s = fresh();
  put(s, 0, 4, 2, 'iTrapper');
  const m = acts(s, 'move').map((x) => `${x.cell.r},${x.cell.c}`);
  for (const t of ['5,2', '6,2', '3,2', '2,2', '4,1', '4,0', '4,3', '4,4', '5,1', '5,3', '3,1', '3,3']) assert(m.includes(t), 'can reach ' + t);
  s.board[4][2].stealth = false;
  assert.deepStrictEqual(acts(s, 'move').map((x) => `${x.cell.r},${x.cell.c}`).sort(), ['4,1', '4,3', '5,2']);
}
{ // one trap per rogue, ever; it costs an action
  const s = fresh();
  const rg = put(s, 0, 2, 2, 'iPoisoner');
  const tr = acts(s, 'trap');
  assert.strictEqual(tr.length, 8);
  E.applyAction(s, tr.find((a) => a.cell.r === 3 && a.cell.c === 2));
  assert.strictEqual(s.players[0].ap, 2);
  assert.strictEqual(rg.stealth, false); assert.strictEqual(s.traps.length, 1);
  endTurns(s, 2);
  assert.strictEqual(acts(s, 'trap').length, 0);
  assert(!acts(s, 'move').some((m) => m.cell.r === 3 && m.cell.c === 2), 'you cannot walk onto your own trap');
}
{ // sneak attack: double damage and reveals
  const s = fresh();
  const rg = put(s, 0, 3, 2, 'iTrapper'); put(s, 1, 4, 2, 'iSword'); s.board[4][2].armor = 0;
  attack(s, { r: 3, c: 2 }, { r: 4, c: 2 });
  assert.strictEqual(s.board[4][2], null); assert.strictEqual(rg.stealth, false);
}
{ // bombs: exactly 2 tiles away, 1 damage to the 3x3 (ignoring armour), friends and castles too
  const s = fresh();
  put(s, 0, 3, 2, 'iBomber');
  const b = acts(s, 'bomb');
  assert(b.every((a) => Math.max(Math.abs(a.cell.r - 3), Math.abs(a.cell.c - 2)) === 2));
  put(s, 1, 5, 2, 'iShield'); put(s, 1, 5, 3, 'iSword'); put(s, 0, 4, 1, 'iSpear'); put(s, 1, 4, 3, 'iPoisoner');
  E.applyAction(s, b.find((a) => a.cell.r === 5 && a.cell.c === 2));
  assert.strictEqual(s.board[5][2].hp, 2); assert.strictEqual(s.board[5][2].armor, 3);
  assert.strictEqual(s.board[5][3].hp, 1);
  assert.strictEqual(s.board[4][1].hp, 1, 'friends too');
  assert.strictEqual(s.board[4][3].hp, 2, 'a hidden rogue is missed');
  const k = fresh();
  put(k, 0, E.ROWS - 3, 2, 'iBomber');
  const before = E.kingOf(k, 1).hp;
  E.applyAction(k, acts(k, 'bomb').find((a) => a.cell.r === E.ROWS - 1 && a.cell.c === 2));
  assert.strictEqual(E.kingOf(k, 1).hp, before - 1, 'bombs hit castles');
}
{ // trap effects
  const run = (id) => {
    const s = fresh();
    put(s, 0, 2, 2, id);
    E.applyAction(s, acts(s, 'trap').find((a) => a.cell.r === 3 && a.cell.c === 2));
    E.applyAction(s, { t: 'end' });
    const v = put(s, 1, 4, 2, 'iSword');
    E.applyAction(s, acts(s, 'move').find((m) => m.from.r === 4 && m.cell.r === 3 && m.cell.c === 2));
    assert.strictEqual(s.traps.length, 0);
    return { s, v };
  };
  let { s, v } = run('iPoisoner');
  assert.strictEqual(v.poison, 2);
  endTurns(s, 2); assert.strictEqual(v.hp, 1); endTurns(s, 2);
  assert.strictEqual(s.board[3][2], null);
  ({ s, v } = run('iTrapper'));
  endTurns(s, 2);
  assert(!acts(s, 'move').some((m) => m.from.r === 3 && m.from.c === 2));
  endTurns(s, 2);
  assert(acts(s, 'move').some((m) => m.from.r === 3 && m.from.c === 2));
  ({ s, v } = run('iSaboteur'));
  put(s, 0, 2, 2, 'iSpear');
  endTurns(s, 2);
  assert(!acts(s, 'attack').some((a) => a.from.r === 3));
  endTurns(s, 2);
  assert(acts(s, 'attack').some((a) => a.from.r === 3));
}

// --- siege tower
{
  const s = fresh();
  const tw = put(s, 0, 1, 2, 'DT');
  put(s, 0, 1, 1, 'iArcher');
  const into = acts(s, 'move').find((m) => m.from.c === 1 && m.cell.c === 2 && m.cell.r === 1);
  assert(into);
  E.applyAction(s, into);
  assert(tw.garrison && tw.garrison.id === 'iArcher');
  put(s, 0, 1, 3, 'iArcher');
  assert(!acts(s, 'move').some((m) => m.from.c === 3 && m.cell.c === 2), 'a tower holds only one archer');
  put(s, 1, 3, 2, 'iSword');
  const sh = acts(s, 'attack').filter((a) => a.g);
  assert(sh.length === 1 && sh[0].target.r === 3);
  tw.hp = 0;
  E.applyAction(s, { t: 'end' });
  assert(s.board[1][2] && s.board[1][2].id === 'iArcher', 'the archer drops out');
  const d = fresh();
  d.players[0].infHand = ['iArcher'];
  put(d, 0, 1, 2, 'DT');
  assert(acts(d, 'deploy').filter((a) => a.cell.r === 1 && a.cell.c === 2).length === 1);
}

// --- boosts and the castle
{
  const s = fresh();
  put(s, 0, 1, 1, 'iSword'); put(s, 0, 1, 4, 'S3');
  s.players[0].hand = ['CA'];
  E.applyAction(s, { t: 'play', hand: 0 });
  assert.strictEqual(s.board[1][1].atk, 3); assert.strictEqual(s.board[1][4].atk, 0);
  const s2 = fresh();
  s2.players[0].hand = ['C8'];
  E.applyAction(s2, { t: 'play', hand: 0 });
  assert.strictEqual(s2.board[1].filter((u) => u).length, 3, 'Conscription deploys 3');
}
{ // damage boosts only work on enemies in reach
  const s = fresh();
  put(s, 1, 6, 2, 'iSword');
  s.players[0].hand = ['H9'];
  assert.strictEqual(acts(s, 'play').length, 0);
  put(s, 0, 4, 2, 'iArcher');
  assert(acts(s, 'play').some((a) => a.target.r === 6));
}
{ // the king sits one row behind your back row: reachable from the enemy's back row (melee) or 2-3 rows out (range)
  const s = fresh();
  put(s, 0, E.ROWS - 2, 2, 'iSword');
  const k = acts(s, 'attack');
  assert.strictEqual(k.length, 1); assert.deepStrictEqual(k[0].target, { r: 8, c: 2 });
  s.board[8][2].hp = 1;
  E.applyAction(s, k[0]);
  assert.strictEqual(s.winner, 0);
  const d = fresh();
  put(d, 0, E.ROWS - 2, 0, 'iSword');
  assert.strictEqual(acts(d, 'attack').length, 0, 'a melee unit in the far corner cannot touch the king');
  const r = fresh();
  put(r, 0, 6, 2, 'iArcher');
  assert(acts(r, 'attack').some((a) => a.target.r === 8), 'an archer two rows out can shoot the king');
}

// --- territory, outposts, legend
{ // moving claims tiles and they stay yours
  const s = fresh();
  put(s, 0, 3, 1, 'iSword');
  E.applyAction(s, { t: 'move', from: { r: 3, c: 1 }, cell: { r: 4, c: 1 } });
  assert.strictEqual(s.owner[4][1], 0);
  endTurns(s, 2);
  E.applyAction(s, { t: 'move', from: { r: 4, c: 1 }, cell: { r: 5, c: 1 } });
  assert.strictEqual(s.owner[5][1], 0); assert.strictEqual(s.owner[4][1], 0, 'tiles stay yours after you leave');
  assert.strictEqual(E.tileCount(s, 0), 18); assert.strictEqual(E.tileCount(s, 1), 15);
}
{ // hidden rogues claim nothing
  const s = fresh();
  put(s, 0, 3, 1, 'iTrapper');
  E.applyAction(s, { t: 'move', from: { r: 3, c: 1 }, cell: { r: 5, c: 1 } });
  assert.strictEqual(s.owner[5][1], 1);
}
{ // Land Grab
  const s = fresh();
  s.players[0].hand = ['CL'];
  const centres = acts(s, 'play').map((a) => a.target);
  assert(centres.every((t) => E.unitAt(s, t.r, t.c) !== undefined) && !centres.some((t) => t.r === 0 || t.r === 8), 'centres are real tiles');
  E.applyAction(s, { t: 'play', hand: 0, target: { r: 4, c: 2 } });
  assert.strictEqual(E.tileCount(s, 0), 16 + 6);
  const s2 = fresh();
  put(s2, 1, 4, 2, 'iSword');
  s2.players[0].hand = ['CL'];
  E.applyAction(s2, { t: 'play', hand: 0, target: { r: 4, c: 2 } });
  assert.strictEqual(s2.owner[4][2], null); assert.strictEqual(E.tileCount(s2, 0), 16 + 5);
}
{ // the king summons a Legend: level and cost follow land; one at a time; 3 steps for one action; cooldown after death
  const s = fresh();
  const sm = acts(s, 'summon');
  assert(sm.length === 3 && sm.every((a) => a.cell.r === 1));
  E.applyAction(s, sm[0]);
  const at = sm[0].cell, lg = s.board[at.r][at.c];
  assert(lg.legend && lg.level === 1 && lg.hp === 6 && lg.atk === 4 && lg.armor === 3);
  assert.strictEqual(s.players[0].mana, 9);
  assert.strictEqual(acts(s, 'summon').length, 0);
  lg.fresh = false;
  let pos = { r: at.r, c: at.c };
  for (let i = 0; i < 3; i++) {
    const mv = acts(s, 'move').find((a) => a.from.r === pos.r && a.from.c === pos.c && a.cell.r === pos.r + 1);
    assert(mv, 'step ' + i);
    E.applyAction(s, mv); pos = mv.cell;
  }
  assert.strictEqual(s.players[0].ap, 2, 'the whole 3-step move cost one action');
  assert.strictEqual(acts(s, 'move').filter((a) => a.from.r === pos.r).length, 0, 'only 3 steps');
  s.board[pos.r][pos.c].hp = 0;
  endTurns(s, 2);
  assert.strictEqual(s.players[0].legendCd, 0);
  assert.strictEqual(E.levelFor(18), 1); assert.strictEqual(E.levelFor(19), 2); assert.strictEqual(E.levelFor(23), 3);
}
{ // outposts: build after holding a full turn; gold mine, lookout and bunker
  const t = fresh();
  t.outposts = [{ r: 4, c: 2, kind: null }];
  put(t, 0, 3, 2, 'iSword');
  E.applyAction(t, { t: 'move', from: { r: 3, c: 2 }, cell: { r: 4, c: 2 } });
  assert.strictEqual(acts(t, 'build').length, 0, 'not on the turn you arrive');
  endTurns(t, 2);
  assert.strictEqual(acts(t, 'build').length, 3);
  E.applyAction(t, { t: 'build', at: { r: 4, c: 2 }, kind: 'mine' });
  endTurns(t, 2);
  assert.strictEqual(t.players[0].maxMana, Math.min(10, t.players[0].turns) + 1);
  const s = fresh();
  s.outposts = [{ r: 3, c: 2, kind: 'lookout' }];
  put(s, 0, 3, 2, 'iArcher'); put(s, 1, 7, 2, 'iSword');
  assert.strictEqual(acts(s, 'attack').length, 1, 'range 4 from a lookout');
  const b = fresh();
  b.outposts = [{ r: 4, c: 2, kind: 'bunker' }];
  put(b, 0, 4, 2, 'iSword');
  b.players[0].infHand = ['iSword'];
  assert(acts(b, 'deploy').some((a) => a.cell.r === 5 && a.cell.c === 2));
  endTurns(b, 2);
  assert.strictEqual(b.players[0].infHand.length, 2);
}
{ // time limit: more tiles wins
  const s = fresh();
  s.turn = E.MAX_TURNS; s.active = 1;
  for (let c = 0; c < 5; c++) s.owner[4][c] = 0;
  E.applyAction(s, { t: 'end' });
  assert.strictEqual(s.winner, 0); assert(/tiles/.test(s.reason));
}

// --- arrival effects and death bonuses
{
  const s = fresh();
  put(s, 1, 2, 3, 'iSword');
  s.players[0].hand = ['H3'];                    // Crossbow Battery: push adjacent enemies back
  E.applyAction(s, { t: 'play', hand: 0, cell: { r: 1, c: 2 } });
  assert(!s.board[2][3] && s.board[3][4] && s.board[3][4].id === 'iSword', 'the adjacent enemy is shoved back one tile');
  const t = fresh();
  put(t, 1, 2, 4, 'iTrapper');
  t.players[0].hand = ['H2'];                    // Longbowmen: reveal
  E.applyAction(t, { t: 'play', hand: 0, cell: { r: 1, c: 3 } });
  assert.strictEqual(t.board[2][4].stealth, false);
  const w = fresh();
  w.players[0].hand = ['HK'];
  E.applyAction(w, { t: 'play', hand: 0, cell: { r: 1, c: 1 } });
  assert(w.traps.some((tr) => tr.p === 0 && tr.type === 'sticky'));
}
{ // death bonuses
  const s = fresh();
  put(s, 0, 4, 2, 'D7'); s.board[4][2].hp = 0;
  E.applyAction(s, { t: 'end' });
  assert(s.board[4][2] && s.board[4][2].id === 'SKEL', 'a Skeleton rises');
  const t = fresh();
  put(t, 0, 4, 2, 'D3'); put(t, 1, 5, 2, 'iSword'); t.board[4][2].hp = 0;
  E.applyAction(t, { t: 'end' });
  assert.strictEqual(t.board[5][2].hp, 1);
  const u = fresh();
  put(u, 0, 4, 2, 'S4'); u.board[4][2].hp = 0; u.owner[4][1] = null; u.owner[5][3] = 1;
  E.applyAction(u, { t: 'end' });
  assert.strictEqual(u.owner[4][1], 0); assert.strictEqual(u.owner[5][3], 0);
  const m = fresh();
  put(m, 0, 4, 2, 'CK'); m.board[4][2].hp = 0;
  endTurns(m, 2);
  assert.strictEqual(m.players[0].maxMana, Math.min(10, m.players[0].turns) + 1);
}

// --- playouts
let wins = [0, 0, 0];
for (let seed = 1; seed <= 100; seed++) wins[play(seed, randomPick(rng(seed))).winner]++;
console.log('random vs random (100 games) wins P1/P2/draw:', wins.join('/'));

wins = [0, 0, 0];
let turns = 0, byCastle = 0;
for (let seed = 1; seed <= 30; seed++) { const s = play(seed, (st) => E.AI.chooseAction(st)); wins[s.winner]++; turns += s.turn; if (/castle/.test(s.reason)) byCastle++; }
console.log('AI vs AI (30 games) wins P1/P2/draw:', wins.join('/'), '· avg turns', (turns / 30).toFixed(1), '· by castle', byCastle);

let aiWins = 0;
for (let seed = 1; seed <= 30; seed++) {
  const r = rng(seed + 999), side = seed % 2, rp = randomPick(r);
  const s = play(seed, (st) => (st.active === side ? E.AI.chooseAction(st) : rp(st)));
  if (s.winner === side) aiWins++;
}
console.log('AI vs random (30 games): AI won', aiWins);
assert(aiWins >= 25, 'AI should beat random play');
console.log('All tests passed.');
