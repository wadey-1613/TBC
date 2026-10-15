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
    assert(pl.hand.length <= E.HAND_MAX, 'hand over 3');
    assert(pl.deploys >= 0 && pl.moves >= 0 && pl.handLeft >= 0);
  }
}

function play(seed, pick) {
  const s = E.newGame(seed);
  for (let step = 0; s.winner == null; step++) {
    assert(step < 12000, 'game did not terminate (seed ' + seed + ')');
    E.applyAction(s, pick(s));
    checkInvariants(s);
  }
  return s;
}

const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const randomPick = (r) => (st) => { const acts = E.legalActions(st); return acts[Math.floor(r() * acts.length)]; };

// --- decks
assert.strictEqual(E.DECK.length, 53, '52 standard cards + the Siege Tower');
assert.strictEqual(new Set(E.DECK).size, 53);
assert.strictEqual(E.INF_DECK.length, 38, '36 + 2 extra rogues');
const cls = (c) => E.INF_DECK.filter((id) => E.CARDS[id].cls === c).length;
assert.deepStrictEqual([cls('melee'), cls('ranged'), cls('defence'), cls('rogue')], [10, 10, 10, 8]);
for (const id of E.INF_DECK) { const c = E.CARDS[id]; if (c.cls === 'melee') assert.deepStrictEqual([c.atk, c.armor], [2, 1]); if (c.cls === 'ranged') assert.deepStrictEqual([c.atk, c.armor], [1, 1]); if (c.cls === 'defence') assert.deepStrictEqual([c.atk, c.armor], [0, 3]); if (c.cls === 'rogue') assert.deepStrictEqual([c.atk, c.armor], [1, 2]); }

// --- helpers
function fresh() {
  const s = E.newGame(1);
  for (const pl of s.players) { pl.hand = []; pl.squadOffer = []; pl.deploys = 1; pl.moves = 3; pl.handLeft = 1; pl.recycles = 1; pl.fresh = 0; }
  s.log = [];
  return s;
}
const put = (s, p, r, c, id) => {
  const k = E.CARDS[id];
  return (s.board[r][c] = { uid: ++s.uid, id, p, atk: k.atk, hp: k.hp, maxHp: k.hp, armor: k.armor, maxArmor: k.armor, attacked: false, moved: false, fresh: false, trapped: false, stealth: !!k.rogue, ammo: k.rogue ? 1 : 0, garrison: null, poison: 0, stuck: 0, blind: 0, immobile: false, disarmed: false });
};
const acts = (s, t) => E.legalActions(s).filter((a) => a.t === t);
const attack = (s, from, target, extra) => E.applyAction(s, Object.assign({ t: 'attack', from, target }, extra));
const hits = (s) => acts(s, 'attack').map((a) => `${a.target.r},${a.target.c}`).sort();

// --- spawning and the turn structure
{
  const s = fresh();
  const nonDef = (st, p) => acts(st, 'deploy').filter((a) => E.CARDS[st.players[p].infOffer[a.pick]].reach !== 'defence' && E.CARDS[st.players[p].infOffer[a.pick]].reach !== 'range');
  assert(nonDef(s, 0).every((a) => a.cell.r === 0), 'p0 spawns on row 0');
  E.applyAction(s, { t: 'end' });
  assert(nonDef(s, 1).every((a) => a.cell.r === E.ROWS - 1), 'p1 spawns on its own back row');
}
{ // one deploy per turn; up to 3 moves, one step per unit, never backward for ordinary units
  const s = fresh();
  E.applyAction(s, acts(s, 'deploy')[0]);
  assert.strictEqual(acts(s, 'deploy').length, 0, 'one infantry per turn');
  for (let c = 0; c < 4; c++) put(s, 0, 2, c, 'iSword');
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
  s.players[0].hand = ['C8'];
  E.applyAction(s, { t: 'play', hand: 0 });
  assert.strictEqual(acts(s, 'move').length, 0, 'conscripted units cannot move either');
  E.applyAction(s, { t: 'end' }); E.applyAction(s, { t: 'end' });
  assert(acts(s, 'move').length > 0, 'they can move on your next turn');
}

// --- squad offer, holding, hand rules
{
  const s = fresh();
  s.players[0].squadOffer = ['DA', 'D2']; s.players[0].hand = ['SA', 'S2']; s.players[0].fresh = 0;
  assert.strictEqual(acts(s, 'hold').length, 2, 'either offered card can be held');
  E.applyAction(s, acts(s, 'hold').find((a) => a.pick === 0));
  assert.deepStrictEqual(s.players[0].hand, ['SA', 'S2', 'DA']);
  assert.deepStrictEqual(s.players[0].squadOffer, [], 'the other offered card is discarded');
  assert.deepStrictEqual(s.players[0].squadDiscard, ['D2']);
  s.players[0].squadOffer = ['D3'];
  assert.strictEqual(acts(s, 'hold').length, 0, 'hand is full');
  E.applyAction(s, acts(s, 'play').find((a) => a.hand === -1));
  assert(acts(s, 'play').some((a) => a.hand >= 0), 'playing the offered card does not use up the hand play');
  E.applyAction(s, acts(s, 'play').find((a) => a.hand >= 0));
  assert.strictEqual(acts(s, 'play').length, 0, 'but only one card from hand per turn');
  const s2 = fresh();
  s2.players[0].squadOffer = ['DA', 'D2'];
  E.applyAction(s2, acts(s2, 'play').find((a) => a.hand === -2));
  assert.strictEqual(s2.board[0].filter((u) => u && u.id === 'D2').length, 1);
  assert.deepStrictEqual(s2.players[0].squadDiscard, ['DA'], 'first offered card discarded');
}
{ // infantry can be held in hand; a card put in your hand this turn can't be played until next turn
  const s = E.newGame(5);
  const pl = s.players[0], offer = pl.infOffer.slice();
  E.applyAction(s, E.legalActions(s).find((a) => a.t === 'holdInf' && a.pick === 2));
  assert.deepStrictEqual(pl.hand, [offer[2]]);
  assert(!E.legalActions(s).some((a) => a.t === 'play' && a.hand >= 0), 'a card held this turn cannot be played this turn');
  E.applyAction(s, E.legalActions(s).find((a) => a.t === 'holdInf' && a.pick === 0));
  pl.hand.push('S2');
  assert(!E.legalActions(s).some((a) => a.t === 'holdInf'), 'a full hand cannot hold more infantry');
  E.applyAction(s, { t: 'end' }); E.applyAction(s, { t: 'end' });
  const plays = E.legalActions(s).filter((a) => a.t === 'play' && a.hand === 0);
  assert(plays.length > 0, 'held infantry can be played from hand on a later turn');
  const dep = pl.deploys;
  E.applyAction(s, plays[0]);
  assert.strictEqual(pl.deploys, dep, 'playing it from hand does not use the deploy');
  assert(!E.legalActions(s).some((a) => a.t === 'play' && a.hand >= 0), 'one hand play per turn');
}
{ // infantry offer: 3 cards, deploy one, recycle one to the bottom, discard the last
  const s = E.newGame(5);
  const pl = s.players[0], offer = pl.infOffer.slice(), before = pl.infDeck.length;
  assert.strictEqual(offer.length, 3);
  E.applyAction(s, E.legalActions(s).find((a) => a.t === 'deploy' && a.pick === 1));
  assert(s.board.flat().some((u) => u && u.id === offer[1]), 'picked card deployed');
  const rec = E.legalActions(s).filter((a) => a.t === 'recycle');
  assert.strictEqual(rec.length, 2);
  const keep = pl.infOffer[0];
  E.applyAction(s, rec[0]);
  assert.strictEqual(pl.infDeck[0], keep, 'recycled card is at the bottom of the deck');
  assert.strictEqual(pl.infDeck.length, before + 1);
  E.applyAction(s, { t: 'end' });
  assert.strictEqual(pl.infDiscard.length, 1, 'the third card is discarded');
}
{ // an empty deck is rebuilt from its own discard pile; running out is never a loss
  const s = fresh();
  s.players[1].deck = []; s.players[1].squadDiscard = ['DA', 'D2', 'D3'];
  s.players[1].infDeck = []; s.players[1].infDiscard = ['iSword', 'iBrute', 'iSpear', 'iArcher'];
  E.applyAction(s, { t: 'end' });
  assert.strictEqual(s.winner, null);
  assert.strictEqual(s.players[1].squadOffer.length, 2); assert.strictEqual(s.players[1].infOffer.length, 3);
  const s2 = fresh();
  s2.players[1].deck = []; s2.players[1].squadDiscard = []; s2.players[1].infDeck = []; s2.players[1].infDiscard = [];
  E.applyAction(s2, { t: 'end' });
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
  d.players[0].hand = ['iArcher']; d.players[0].fresh = 0;
  put(d, 0, 1, 3, 'DT');
  const into2 = acts(d, 'play').filter((a) => a.hand === 0 && a.cell.r === 1 && a.cell.c === 3);
  assert(into2.length === 1, 'an archer card can be placed straight into the tower');
  E.applyAction(d, into2[0]);
  assert.strictEqual(d.board[1][3].garrison.id, 'iArcher');
  const n = fresh(); n.players[0].hand = ['iSword']; n.players[0].fresh = 0; put(n, 0, 1, 3, 'DT');
  assert(!acts(n, 'play').some((a) => a.cell && a.cell.r === 1 && a.cell.c === 3), 'only archers go in towers');
}

// --- boosts, zones
{ // Rally buffs infantry only; Conscription deploys 3 now; Reinforcements is a second infantry offer
  const s = fresh();
  put(s, 0, 0, 2, 'iSword'); put(s, 0, 0, 5, 'S3');
  s.players[0].hand = ['CA'];
  E.applyAction(s, { t: 'play', hand: 0 });
  assert.strictEqual(s.board[0][2].atk, 3); assert.strictEqual(s.board[0][5].atk, 0, 'walls are not infantry');
  const s2 = fresh();
  s2.players[0].hand = ['C8'];
  E.applyAction(s2, { t: 'play', hand: 0 });
  assert.strictEqual(s2.board[0].filter((u) => u && !E.isKing(u)).length, 3);
  const s3 = E.newGame(9), pl = s3.players[0], before = pl.infOffer.length;
  pl.hand = ['C7']; pl.fresh = 0;
  E.applyAction(s3, { t: 'play', hand: 0 });
  assert.strictEqual(pl.infOffer.length, before + 3); assert.strictEqual(pl.deploys, 2); assert.strictEqual(pl.recycles, 2);
}
{ // armour boosts raise the plate pool; Reinforce restores it
  const s = fresh();
  const w = put(s, 0, 1, 3, 'S2');
  s.players[0].hand = ['S7']; s.players[0].fresh = 0;
  E.applyAction(s, acts(s, 'play').find((a) => a.target.r === 1));
  assert.deepStrictEqual([w.armor, w.maxArmor, w.hp], [3, 3, 8]);
  w.armor = 0; w.hp = 1;
  s.players[0].hand = ['S9']; s.players[0].fresh = 0; s.players[0].handLeft = 1;
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
{ // defence units may be placed anywhere around the king; others only on the back row
  const s = fresh();
  s.players[0].hand = ['S4', 'D4'];
  const fort = acts(s, 'play').filter((a) => a.hand === 0).map((a) => `${a.cell.r},${a.cell.c}`);
  assert(fort.includes('1,3') && fort.includes('2,2') && fort.includes('0,1'));
  assert(!fort.includes('3,3') && !fort.includes('2,0'));
  assert(acts(s, 'play').filter((a) => a.hand === 1).every((a) => a.cell.r === 0));
  const s2 = E.newGame(5);
  s2.players[0].infOffer = ['iShield', 'iSword', 'iArcher'];
  const dep = (pick) => acts(s2, 'deploy').filter((a) => a.pick === pick).map((a) => a.cell.r);
  assert(dep(0).some((r) => r > 0)); assert(dep(1).every((r) => r === 0) && dep(2).every((r) => r === 0));
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
