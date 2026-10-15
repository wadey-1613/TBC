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
  }
  assert.strictEqual(kings, 2);
  for (const pl of s.players) {
    assert(pl.hand.length <= E.HAND_MAX, 'hand over 3');
    assert(pl.deploys >= 0 && pl.moves >= 0 && pl.squadLeft >= 0);
  }
}

function play(seed, pick) {
  const s = E.newGame(seed);
  for (let step = 0; s.winner == null; step++) {
    assert(step < 10000, 'game did not terminate (seed ' + seed + ')');
    E.applyAction(s, pick(s));
    checkInvariants(s);
  }
  return s;
}

const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const randomPick = (r) => (st) => { const acts = E.legalActions(st); return acts[Math.floor(r() * acts.length)]; };

// --- decks
assert.strictEqual(E.DECK.length, 52);
assert.strictEqual(new Set(E.DECK).size, 52);
assert.strictEqual(E.INF_DECK.length, 36);

// --- rule spot checks
function fresh() {
  const s = E.newGame(1);
  for (const pl of s.players) { pl.hand = []; pl.revealed = null; pl.deploys = 1; pl.moves = 1; pl.squadLeft = 1; }
  s.log = [];
  return s;
}
const put = (s, p, r, c, id) => { const k = E.CARDS[id]; return (s.board[r][c] = { uid: ++s.uid, id, p, atk: k.atk, hp: k.hp, maxHp: k.hp, armor: k.armor, attacked: false, moved: false }); };
const acts = (s, t) => E.legalActions(s).filter((a) => a.t === t);
const attack = (s, from, target) => E.applyAction(s, { t: 'attack', from, target });

{ // new cards appear on your own back row; player 1 on the far row
  const s = fresh();
  assert(acts(s, 'deploy').every((a) => a.cell.r === 0), 'p0 spawns on row 0');
  assert(acts(s, 'deploy').every((a) => a.cell.c !== E.KING_C), 'cannot spawn on the king');
  E.applyAction(s, { t: 'end' });
  assert(acts(s, 'deploy').every((a) => a.cell.r === 8), 'p1 spawns on row 8');
}
{ // one deploy, one move per turn
  const s = fresh();
  const dep = acts(s, 'deploy')[0];
  E.applyAction(s, dep);
  assert.strictEqual(acts(s, 'deploy').length, 0, 'one infantry per turn');
  put(s, 0, 2, 1, 'iSword'); put(s, 0, 2, 5, 'iSword');
  const mv = acts(s, 'move');
  assert(mv.length > 0 && mv.every((m) => m.cell.r >= m.from.r), 'no backward moves');
  E.applyAction(s, mv[0]);
  assert.strictEqual(acts(s, 'move').length, 0, 'only one unit may move per turn');
}
{ // squad: revealed card must be played or held; hand max 3; one play per turn
  const s = fresh();
  s.players[0].revealed = 'DA'; s.players[0].hand = ['SA', 'S2'];
  assert.strictEqual(acts(s, 'hold').length, 1);
  E.applyAction(s, acts(s, 'hold')[0]);
  assert.strictEqual(s.players[0].hand.length, 3);
  s.players[0].revealed = 'D2';
  assert.strictEqual(acts(s, 'hold').length, 0, 'hand is full');
  const play = acts(s, 'play').find((a) => a.hand === -1);
  E.applyAction(s, play);
  assert.strictEqual(acts(s, 'play').length, 0, 'one squad card per turn');
}
{ // melee reaches 1 tile, ranged forward 2, artillery 2 in every direction
  const s = fresh();
  put(s, 0, 3, 3, 'iSword'); put(s, 1, 4, 3, 'iShield'); put(s, 1, 5, 3, 'iSword');
  let t = acts(s, 'attack').map((a) => a.target.r);
  assert.deepStrictEqual(t, [4], 'melee only hits the adjacent tile');
  const s2 = fresh();
  put(s2, 0, 3, 3, 'iArcher'); put(s2, 1, 5, 3, 'iShield'); put(s2, 1, 1, 3, 'iSword');
  assert.deepStrictEqual(acts(s2, 'attack').map((a) => a.target.r), [5], 'archer shoots 2 ahead but not behind');
  const s3 = fresh();
  put(s3, 0, 3, 3, 'H2'); put(s3, 1, 5, 3, 'iShield'); put(s3, 1, 1, 3, 'iSword'); put(s3, 1, 6, 3, 'iSword');
  assert.deepStrictEqual(acts(s3, 'attack').map((a) => a.target.r).sort(), [1, 5], 'artillery hits 2 in any direction');
}
{ // armour, breach, retaliation, no retaliation vs ranged
  const s = fresh();
  put(s, 0, 3, 3, 'iSword'); put(s, 1, 4, 3, 'iShield');
  attack(s, { r: 3, c: 3 }, { r: 4, c: 3 });
  assert.strictEqual(s.board[4][3].hp, 2, 'armour cuts 2 to 1');
  assert.strictEqual(s.board[3][3].hp, 1, 'defender strikes back (1 atk - 0 armour)');
  const s2 = fresh();
  put(s2, 0, 3, 3, 'DA'); put(s2, 1, 4, 3, 'S3');
  attack(s2, { r: 3, c: 3 }, { r: 4, c: 3 });
  assert.strictEqual(s2.board[4][3].hp, 1, 'ram deals double to a fortress');
  const s3 = fresh();
  put(s3, 0, 3, 3, 'iArcher'); put(s3, 1, 4, 3, 'iSword');
  attack(s3, { r: 3, c: 3 }, { r: 4, c: 3 });
  assert.strictEqual(s3.board[3][3].hp, 1, 'no retaliation against ranged');
}
{ // each unit attacks once per turn; rearm boosts restore it
  const s = fresh();
  put(s, 0, 3, 3, 'iSword'); put(s, 1, 4, 3, 'S3');
  attack(s, { r: 3, c: 3 }, { r: 4, c: 3 });
  assert.strictEqual(acts(s, 'attack').length, 0, 'already attacked this turn');
  s.players[0].hand = ['C9'];
  E.applyAction(s, { t: 'play', hand: 0 });
  assert.strictEqual(acts(s, 'attack').length, 1, 'Battle Cry rearms');
}
{ // reaching and killing the castle wins
  const s = fresh();
  put(s, 0, 7, 3, 'iSword');
  const k = acts(s, 'attack');
  assert.strictEqual(k.length, 1);
  s.board[8][3].hp = 1;
  E.applyAction(s, k[0]);
  assert.strictEqual(s.winner, 0);
}
{ // boosts
  const s = fresh();
  put(s, 0, 1, 1, 'iSword'); put(s, 0, 1, 2, 'S3');
  s.players[0].hand = ['CA'];
  E.applyAction(s, { t: 'play', hand: 0 });
  assert.strictEqual(s.board[1][1].atk, 3); assert.strictEqual(s.board[1][2].atk, 1);
  const s2 = fresh();
  s2.players[0].hand = ['C8'];
  const before = E.INF_DECK.length;
  E.applyAction(s2, { t: 'play', hand: 0 });
  assert.strictEqual(s2.board[0].filter((u) => u && !E.isKing(u)).length, 3, 'conscription fills the back row');
}
{ // squad deck-out loses
  const s = fresh();
  s.players[1].deck = [];
  E.applyAction(s, { t: 'end' });
  assert.strictEqual(s.winner, 0);
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
