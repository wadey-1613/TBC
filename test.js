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
  for (const pl of s.players) { pl.hand = []; pl.squadOffer = []; pl.deploys = 1; pl.moves = 3; pl.squadLeft = 1; pl.recycles = 1; }
  s.log = [];
  return s;
}
const put = (s, p, r, c, id) => { const k = E.CARDS[id]; return (s.board[r][c] = { uid: ++s.uid, id, p, atk: k.atk, hp: k.hp, maxHp: k.hp, armor: k.armor, attacked: false, moved: false, fresh: false }); };
const acts = (s, t) => E.legalActions(s).filter((a) => a.t === t);
const attack = (s, from, target) => E.applyAction(s, { t: 'attack', from, target });

{ // new cards appear on your own back row; player 1 on the far row
  const s = fresh();
  assert(acts(s, 'deploy').every((a) => a.cell.r === 0), 'p0 spawns on row 0');
  assert(acts(s, 'deploy').every((a) => a.cell.c !== E.KING_C), 'cannot spawn on the king');
  E.applyAction(s, { t: 'end' });
  assert(acts(s, 'deploy').every((a) => a.cell.r === 8), 'p1 spawns on row 8');
}
{ // one deploy per turn; up to 3 moves, one step per unit, never backward
  const s = fresh();
  E.applyAction(s, acts(s, 'deploy')[0]);
  assert.strictEqual(acts(s, 'deploy').length, 0, 'one infantry per turn');
  for (let c = 0; c < 4; c++) s.board[2][c] = Object.assign({}, put(s, 0, 2, c, 'iSword'), { fresh: false });
  const mv = acts(s, 'move');
  assert(mv.length > 0 && mv.every((m) => m.cell.r >= m.from.r), 'no backward moves');
  E.applyAction(s, mv.find((m) => m.from.c === 0));
  assert(!acts(s, 'move').some((m) => m.from.c === 0), 'a unit moves at most once per turn');
  E.applyAction(s, acts(s, 'move').find((m) => m.from.c === 1));
  E.applyAction(s, acts(s, 'move').find((m) => m.from.c === 2));
  assert.strictEqual(acts(s, 'move').length, 0, 'three moves used up');
}
{ // units placed this turn cannot move; they can next turn
  const s = fresh();
  E.applyAction(s, acts(s, 'deploy')[0]);
  assert.strictEqual(acts(s, 'move').length, 0, 'freshly deployed infantry cannot move');
  s.players[0].hand = ['C8']; s.players[0].squadLeft = 1;
  E.applyAction(s, { t: 'play', hand: 0 });                  // conscription: 3 more fresh units
  assert.strictEqual(acts(s, 'move').length, 0, 'conscripted units cannot move either');
  E.applyAction(s, { t: 'end' }); E.applyAction(s, { t: 'end' });
  assert(acts(s, 'move').length > 0, 'they can move on your next turn');
  const swiftTest = fresh();
  put(swiftTest, 0, 0, 1, 'CJ').fresh = true;                // swift Champion, just placed
  assert.strictEqual(acts(swiftTest, 'move').length, 0, 'even swift units wait a turn');
}
{ // squad offer: 2 cards, use one (play or hold), the other is discarded; hand max 3
  const s = fresh();
  s.players[0].squadOffer = ['DA', 'D2']; s.players[0].hand = ['SA', 'S2'];
  assert.strictEqual(acts(s, 'hold').length, 2, 'either offered card can be held');
  E.applyAction(s, acts(s, 'hold').find((a) => a.pick === 0));
  assert.deepStrictEqual(s.players[0].hand, ['SA', 'S2', 'DA']);
  assert.deepStrictEqual(s.players[0].squadOffer, [], 'the other offered card is discarded');
  assert.deepStrictEqual(s.players[0].squadDiscard, ['D2']);
  s.players[0].squadOffer = ['D3'];
  assert.strictEqual(acts(s, 'hold').length, 0, 'hand is full');
  E.applyAction(s, acts(s, 'play').find((a) => a.hand === -1));
  assert.strictEqual(acts(s, 'play').length, 0, 'one squad card per turn');
  const s2 = fresh();
  s2.players[0].squadOffer = ['DA', 'D2'];
  E.applyAction(s2, acts(s2, 'play').find((a) => a.hand === -2));     // field the second offered card
  assert.strictEqual(s2.board[0].filter((u) => u && u.id === 'D2').length, 1);
  assert.deepStrictEqual(s2.players[0].squadDiscard, ['DA'], 'first offered card discarded');
}
{ // infantry offer: 3 cards, deploy one, recycle one to the bottom, discard the last
  const s = E.newGame(5);
  const pl = s.players[0], offer = pl.infOffer.slice(), before = pl.infDeck.length;
  assert.strictEqual(offer.length, 3, 'offered 3 infantry');
  assert.strictEqual(E.INF_DECK.length - before, 3, 'taken from the top of the deck');
  E.applyAction(s, E.legalActions(s).find((a) => a.t === 'deploy' && a.pick === 1));
  assert(s.board[0].some((u) => u && u.id === offer[1]), 'picked card deployed');
  assert.strictEqual(E.legalActions(s).filter((a) => a.t === 'deploy').length, 0, 'one deploy per turn');
  const rec = E.legalActions(s).filter((a) => a.t === 'recycle');
  assert.strictEqual(rec.length, 2, 'either remaining card can be recycled');
  const keep = pl.infOffer[0];
  E.applyAction(s, rec[0]);
  assert.strictEqual(pl.infDeck[0], keep, 'recycled card is at the bottom of the deck');
  assert.strictEqual(pl.infDeck.length, before + 1);
  assert.strictEqual(E.legalActions(s).filter((a) => a.t === 'recycle').length, 0, 'one recycle per turn');
  E.applyAction(s, { t: 'end' });
  assert.strictEqual(pl.infDiscard.length, 1, 'the third card is discarded for good');
  assert.strictEqual(pl.infOffer.length, 0);
  assert.strictEqual(s.players[1].infOffer.length, 3, 'next player is offered 3');
}
{ // the three reach shapes from the sketch (player 0 faces up the board, row+)
  const hits = (s) => acts(s, 'attack').map((a) => `${a.target.r},${a.target.c}`).sort();
  // melee: the 8 tiles around it
  const m = fresh();
  put(m, 0, 3, 3, 'iSword');
  for (const [r, c] of [[2,2],[2,3],[2,4],[3,2],[3,4],[4,2],[4,3],[4,4]]) put(m, 1, r, c, 'iSpear');
  put(m, 1, 5, 3, 'iSpear');
  assert.strictEqual(hits(m).length, 8, 'melee hits all 8 neighbours'); assert(!hits(m).includes('5,3'));
  // range: rows 2 and 3 ahead, 3 wide; blind spot right in front; nothing behind
  const r = fresh();
  put(r, 0, 3, 3, 'iArcher');
  for (const [rr, c] of [[4,3],[5,2],[5,3],[5,4],[5,5],[6,2],[6,4],[6,5],[2,3],[3,4]]) put(r, 1, rr, c, 'iSpear');
  assert.deepStrictEqual(hits(r), ['5,2','5,3','5,4','6,2','6,4'], 'range = 2nd and 3rd rows ahead, 3 wide');
  // defence: 3 in front plus left and right, never behind
  const d = fresh();
  put(d, 0, 3, 3, 'iPike');
  for (const [rr, c] of [[4,2],[4,3],[4,4],[3,2],[3,4],[2,3],[2,2],[5,3]]) put(d, 1, rr, c, 'iSpear');
  assert.deepStrictEqual(hits(d), ['3,2','3,4','4,2','4,3','4,4'], 'defence = front arc + sides');
  // player 1 faces down
  const q = fresh();
  put(q, 1, 5, 3, 'iArcher'); put(q, 0, 3, 3, 'iSpear'); put(q, 0, 7, 3, 'iSpear');
  E.applyAction(q, { t: 'end' });
  assert.deepStrictEqual(hits(q), ['2,3'.replace('2','3')], 'player 1 shoots down the board');
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
  put(s3, 0, 3, 3, 'iArcher'); put(s3, 1, 5, 3, 'iSword');
  attack(s3, { r: 3, c: 3 }, { r: 5, c: 3 });
  assert.strictEqual(s3.board[3][3].hp, 1, 'no retaliation against range');
  // a defender cannot strike back at an attacker standing behind it
  const s4 = fresh();
  put(s4, 0, 5, 3, 'iSword'); put(s4, 1, 4, 3, 'iShield');   // sword is behind the shield (shield faces down)
  attack(s4, { r: 5, c: 3 }, { r: 4, c: 3 });
  assert.strictEqual(s4.board[5][3].hp, 2, 'no retaliation from behind');
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
{ // damage boosts only work on enemies inside the reach of one of your units
  const s = fresh();
  put(s, 1, 7, 3, 'iSword');                       // far away
  s.players[0].hand = ['H9', 'H7'];                // Fire Arrows (targeted) and Volley (area)
  assert.strictEqual(acts(s, 'play').length, 0, 'nothing in reach, so neither boost can be played');
  put(s, 0, 5, 3, 'iArcher');                      // range reaches rows 7 and 8 -> row 7 target
  const pl = acts(s, 'play');
  assert(pl.some((a) => a.hand === 0 && a.target.r === 7), 'Fire Arrows can hit what the archer could');
  assert(pl.some((a) => a.hand === 1), 'Volley is playable with an enemy in reach');
  const s2 = fresh();
  put(s2, 1, 7, 3, 'iSword'); put(s2, 1, 4, 5, 'iSword'); put(s2, 0, 3, 3, 'iSpear');
  s2.players[0].hand = ['H9'];
  assert.strictEqual(acts(s2, 'play').length, 0, 'no unit of mine reaches either enemy');
}
{ // an empty deck is rebuilt from its own discard pile; running out is never a loss
  const s = fresh();
  s.players[1].deck = []; s.players[1].squadDiscard = ['DA', 'D2', 'D3'];
  s.players[1].infDeck = []; s.players[1].infDiscard = ['iSword', 'iBrute', 'iSpear', 'iArcher'];
  E.applyAction(s, { t: 'end' });
  assert.strictEqual(s.winner, null, 'no deck-out loss');
  assert.strictEqual(s.players[1].squadOffer.length, 2, 'squad offer rebuilt from the discard pile');
  assert.strictEqual(s.players[1].deck.length, 1);
  assert.strictEqual(s.players[1].infOffer.length, 3, 'infantry offer rebuilt from the discard pile');
  assert.strictEqual(s.players[1].infDiscard.length, 0);
  const s2 = fresh();
  s2.players[1].deck = []; s2.players[1].squadDiscard = []; s2.players[1].infDeck = []; s2.players[1].infDiscard = [];
  E.applyAction(s2, { t: 'end' });
  assert.strictEqual(s2.winner, null, 'even with nothing left, the game goes on');
  assert.strictEqual(s2.players[1].squadOffer.length + s2.players[1].infOffer.length, 0);
  assert(acts(s2, 'move').length >= 0);
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
