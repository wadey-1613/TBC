// Run: node test.js
const assert = require('assert');
const E = require('./engine.js');
require('./ai.js');

function checkInvariants(s) {
  const uids = new Set();
  for (const pl of s.players) {
    assert(pl.hand.length <= E.HAND_MAX, 'hand overflow');
    assert(pl.mana >= 0 && pl.mana <= pl.maxMana, 'mana out of range');
    assert.strictEqual(pl.rows[0].length, E.FRONT);
    assert.strictEqual(pl.rows[1].length, E.BACK);
    assert(E.isKing(pl.rows[1][E.KING_I]), 'king left its slot');
    pl.rows.forEach((row) => row.forEach((u) => {
      if (!u) return;
      assert(E.isKing(u) || u.hp > 0, 'dead unit left on board');
      assert(!uids.has(u.uid), 'duplicate uid');
      uids.add(u.uid);
    }));
  }
}

function play(seed, pick) {
  const s = E.newGame(seed);
  for (let step = 0; s.winner == null; step++) {
    assert(step < 8000, 'game did not terminate (seed ' + seed + ')');
    E.applyAction(s, pick(s));
    checkInvariants(s);
  }
  return s;
}

const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const randomPick = (r) => (st) => { const acts = E.legalActions(st); return acts[Math.floor(r() * acts.length)]; };

// --- deck
assert.strictEqual(E.DECK.length, 52, '52-card deck');
assert.strictEqual(new Set(E.DECK).size, 52);

// --- rule spot checks
function fresh() {
  const s = E.newGame(1);
  for (const pl of s.players) { pl.hand = []; pl.mana = pl.maxMana = 10; }
  s.log = [];
  return s;
}
const put = (s, p, r, i, id, ready = true) => { const u = { uid: ++s.uid, id, atk: E.CARDS[id].atk, hp: E.CARDS[id].hp, maxHp: E.CARDS[id].hp, armor: E.CARDS[id].armor, ready }; s.players[p].rows[r][i] = u; return u; };

{ // armour blocks small attackers; breach doesn't care and doubles vs spades
  const s = fresh();
  put(s, 1, 0, 3, 'S5');            // Bulwark armour 2
  const club = put(s, 0, 0, 3, 'C6'); // Raider atk 4 -> 2 dmg
  E.applyAction(s, { t: 'attack', from: { r: 0, i: 3 }, target: { p: 1, r: 0, i: 3 } });
  assert.strictEqual(s.players[1].rows[0][3].hp, 7 - 2);
  const s2 = fresh();
  put(s2, 1, 0, 3, 'S5');
  put(s2, 0, 0, 3, 'D2');           // Ram atk 4 breach vs spade -> 8
  E.applyAction(s2, { t: 'attack', from: { r: 0, i: 3 }, target: { p: 1, r: 0, i: 3 } });
  assert.strictEqual(s2.players[1].rows[0][3], null, 'ram breaks bulwark');
}
{ // ranged cannot target the king, and shoots over the wall at any column
  const s = fresh();
  put(s, 0, 1, 0, 'H8');            // Ranger in the back row
  const t = E.legalActions(s).filter((a) => a.t === 'attack');
  assert.strictEqual(t.length, 0, 'no valid targets (king is shielded, no other units)');
  put(s, 1, 0, 6, 'C2');
  const t2 = E.legalActions(s).filter((a) => a.t === 'attack');
  assert(t2.length === 1 && t2[0].target.i === 6, 'archer reaches far column');
  E.applyAction(s, t2[0]);
  assert.strictEqual(s.players[0].rows[1][0].hp, 4, 'no retaliation vs ranged');
}
{ // melee reaches the king only through an empty front[3]-column approach
  const s = fresh();
  put(s, 0, 0, 3, 'C7');
  put(s, 1, 0, 3, 'S2');            // blocks column 3
  let kingHit = E.legalActions(s).some((a) => a.t === 'attack' && E.isKing(E.unitOf(s, a.target)));
  assert(!kingHit, 'king shielded by front[3]');
  s.players[1].rows[0][3] = null;
  kingHit = E.legalActions(s).some((a) => a.t === 'attack' && E.isKing(E.unitOf(s, a.target)));
  assert(kingHit, 'king exposed when column is open');
}
{ // melee in the back row cannot attack; swarm bonus
  const s = fresh();
  put(s, 0, 1, 0, 'C7');
  assert(!E.legalActions(s).some((a) => a.t === 'attack'), 'back-row melee is boxed in');
  put(s, 0, 0, 2, 'C4'); put(s, 0, 0, 3, 'C4'); put(s, 0, 0, 4, 'C4');
  assert.strictEqual(E.atkOf(s, 0, 0, 3), 5);
  assert.strictEqual(E.atkOf(s, 0, 0, 2), 4);
}
{ // deck-out loses
  const s = fresh();
  s.players[0].deck = [];
  E.applyAction(s, { t: 'end' }); E.applyAction(s, { t: 'end' });
  assert.strictEqual(s.winner, 1, 'player 1 decks out');
}
{ // summon fills nearest empty front slots
  const s = fresh();
  s.players[0].hand = ['CQ'];
  E.applyAction(s, { t: 'play', hand: 0, cell: { r: 0, i: 3 } });
  assert(s.players[0].rows[0][2] && s.players[0].rows[0][4], 'conscripts summoned beside Recruiter');
}

// --- playouts
let wins = [0, 0, 0];
for (let seed = 1; seed <= 150; seed++) wins[play(seed, randomPick(rng(seed))).winner]++;
console.log('random vs random (150 games) wins P1/P2/draw:', wins.join('/'));

wins = [0, 0, 0];
for (let seed = 1; seed <= 30; seed++) wins[play(seed, (st) => E.AI.chooseAction(st)).winner]++;
console.log('AI vs AI (30 games) wins P1/P2/draw:', wins.join('/'));

let aiWins = 0;
for (let seed = 1; seed <= 30; seed++) {
  const r = rng(seed + 999), side = seed % 2, rp = randomPick(r);
  const s = play(seed, (st) => (st.active === side ? E.AI.chooseAction(st) : rp(st)));
  if (s.winner === side) aiWins++;
}
console.log('AI vs random (30 games): AI won', aiWins);
assert(aiWins >= 25, 'AI should beat random play');
console.log('All tests passed.');
