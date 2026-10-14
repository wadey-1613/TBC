// Run: node test.js
const assert = require('assert');
const E = require('./engine.js');
require('./ai.js');

function checkInvariants(s) {
  const uids = new Set();
  for (const pl of s.players) {
    assert(pl.hand.length <= E.HAND_MAX, 'hand overflow');
    assert(pl.mana >= 0 && pl.mana <= pl.maxMana, 'mana out of range');
    assert(pl.deploys >= 0, 'negative deploys');
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

// --- decks
assert.strictEqual(E.DECK.length, 52, '52-card hand deck');
assert.strictEqual(new Set(E.DECK).size, 52);
assert.strictEqual(E.INF_DECK.length, 36, '36 infantry');
const cls = (c) => E.INF_DECK.filter((id) => E.CARDS[id].cls === c).length;
assert.deepStrictEqual([cls('melee'), cls('ranged'), cls('defence')], [12, 12, 12]);

// --- rule spot checks
function fresh() {
  const s = E.newGame(1);
  for (const pl of s.players) { pl.hand = []; pl.mana = pl.maxMana = 10; }
  s.log = [];
  return s;
}
const put = (s, p, r, i, id, ready = true) => { s.players[p].rows[r][i] = Object.assign(E.CARDS[id] && { uid: ++s.uid, id, atk: E.CARDS[id].atk, hp: E.CARDS[id].hp, maxHp: E.CARDS[id].hp, armor: E.CARDS[id].armor, ready }); return s.players[p].rows[r][i]; };
const attack = (s, from, target) => E.applyAction(s, { t: 'attack', from, target });

{ // armour cuts hits
  const s = fresh();
  put(s, 1, 0, 3, 'iShield');                    // 1/3 armour 1
  put(s, 0, 0, 3, 'iSword');                     // 2 attack -> 1 dmg
  attack(s, { r: 0, i: 3 }, { p: 1, r: 0, i: 3 });
  assert.strictEqual(s.players[1].rows[0][3].hp, 2);
}
{ // breach ignores armour and doubles vs ♠
  const s = fresh();
  put(s, 1, 0, 3, 'S3');                         // Bulwark 1/9 armour 2
  put(s, 0, 0, 3, 'DA');                         // Ram 4 breach -> 8
  attack(s, { r: 0, i: 3 }, { p: 1, r: 0, i: 3 });
  assert.strictEqual(s.players[1].rows[0][3].hp, 1);
  const s2 = fresh();
  put(s2, 1, 0, 3, 'iShield'); put(s2, 0, 0, 3, 'DA');
  attack(s2, { r: 0, i: 3 }, { p: 1, r: 0, i: 3 });
  assert.strictEqual(s2.players[1].rows[0][3], null, 'ram crushes shieldman through armour');
}
{ // ranged: any column, no retaliation, never the king
  const s = fresh();
  put(s, 0, 1, 0, 'iArcher');
  assert(!E.legalActions(s).some((a) => a.t === 'attack'), 'no targets, king is protected from ranged');
  put(s, 1, 0, 6, 'iSword');
  const t = E.legalActions(s).filter((a) => a.t === 'attack');
  assert(t.length === 1 && t[0].target.i === 6, 'archer reaches the far column');
  E.applyAction(s, t[0]);
  assert.strictEqual(s.players[0].rows[1][0].hp, 1, 'no retaliation against ranged');
}
{ // melee reach the king only through an open column; back-row melee is boxed in
  const s = fresh();
  put(s, 0, 0, 3, 'iSword'); put(s, 1, 0, 3, 'iGuard');
  assert(!E.legalActions(s).some((a) => a.t === 'attack' && E.isKing(E.unitOf(s, a.target))), 'king shielded');
  s.players[1].rows[0][3] = null;
  assert(E.legalActions(s).some((a) => a.t === 'attack' && E.isKing(E.unitOf(s, a.target))), 'king exposed');
  const s2 = fresh(); put(s2, 0, 1, 0, 'iSword');
  assert(!E.legalActions(s2).some((a) => a.t === 'attack'));
}
{ // one free infantry deploy per turn, from the top of the infantry deck
  const s = fresh();
  const top = s.players[0].infDeck[s.players[0].infDeck.length - 1];
  const deploys = () => E.legalActions(s).filter((a) => a.t === 'deploy');
  assert(deploys().length > 0);
  E.applyAction(s, deploys()[0]);
  assert.strictEqual(deploys().length, 0, 'only one deploy per turn');
  const placed = s.players[0].rows.flat().find((u) => u && u.id === top);
  assert(placed, 'top infantry card was deployed');
  assert.strictEqual(placed.ready, false, 'new infantry cannot act this turn');
  assert.strictEqual(s.players[0].mana, 10, 'deploying is free');
  E.applyAction(s, { t: 'end' }); E.applyAction(s, { t: 'end' });
  assert(deploys().length > 0, 'deploy available again next turn');
}
{ // infantry deck can run out
  const s = fresh(); s.players[0].infDeck = [];
  assert(!E.legalActions(s).some((a) => a.t === 'deploy'));
}
{ // boosts: Rally buffs infantry only; Forced March gives an extra deploy; Conscription deploys 3 now
  const s = fresh();
  put(s, 0, 0, 2, 'iSword'); put(s, 0, 0, 3, 'S3');
  s.players[0].hand = ['CA', 'C3', 'C8'];
  E.applyAction(s, { t: 'play', hand: 0 });
  assert.strictEqual(s.players[0].rows[0][2].atk, 3); assert.strictEqual(s.players[0].rows[0][3].atk, 1);
  E.applyAction(s, { t: 'play', hand: 0 });
  assert.strictEqual(s.players[0].deploys, 2);
  const before = s.players[0].rows[0].filter(Boolean).length;
  E.applyAction(s, { t: 'play', hand: 0 });
  assert.strictEqual(s.players[0].rows[0].filter(Boolean).length, before + 3);
}
{ // targeted spells only offer legal targets
  const s = fresh();
  put(s, 1, 0, 3, 'iArcher'); put(s, 1, 0, 4, 'S3');
  s.players[0].hand = ['H9'];                    // Fire Arrows: enemy infantry only
  const plays = E.legalActions(s).filter((a) => a.t === 'play');
  assert.strictEqual(plays.length, 1);
  assert.deepStrictEqual(plays[0].target, { p: 1, r: 0, i: 3 });
}
{ // deck-out on the hand deck loses
  const s = fresh();
  s.players[0].deck = [];
  E.applyAction(s, { t: 'end' }); E.applyAction(s, { t: 'end' });
  assert.strictEqual(s.winner, 1);
}

// --- playouts
let wins = [0, 0, 0];
for (let seed = 1; seed <= 150; seed++) wins[play(seed, randomPick(rng(seed))).winner]++;
console.log('random vs random (150 games) wins P1/P2/draw:', wins.join('/'));

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
