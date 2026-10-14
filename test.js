// Run: node test.js
const assert = require('assert');
const E = require('./engine.js');
require('./ai.js');

function checkInvariants(s) {
  const uids = new Set();
  for (const pl of s.players) {
    assert(pl.hand.length <= E.HAND_MAX, 'hand overflow');
    assert(pl.mana >= 0 && pl.mana <= pl.maxMana, 'mana out of range');
    assert.strictEqual(pl.board.length, E.BOARD);
    for (const m of pl.board) {
      if (!m) continue;
      assert(m.hp > 0, 'dead minion left on board');
      assert(!uids.has(m.uid), 'duplicate uid');
      uids.add(m.uid);
    }
  }
}

function play(seed, pick) {
  const decks = Object.keys(E.DECKS);
  const s = E.newGame(seed, [decks[seed % 2], decks[(seed + 1) % 2]]);
  for (let step = 0; s.winner == null; step++) {
    assert(step < 5000, 'game did not terminate (seed ' + seed + ')');
    const a = pick(s);
    E.applyAction(s, a);
    checkInvariants(s);
  }
  return s;
}

const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
let wins = [0, 0, 0];
for (let seed = 1; seed <= 150; seed++) {
  const r = rng(seed);
  const s = play(seed, (st) => { const acts = E.legalActions(st); return acts[Math.floor(r() * acts.length)]; });
  wins[s.winner]++;
}
console.log('random vs random (150 games) wins P1/P2/draw:', wins.join('/'));

wins = [0, 0, 0];
for (let seed = 1; seed <= 40; seed++) {
  const s = play(seed, (st) => E.AI.chooseAction(st));
  wins[s.winner]++;
}
console.log('AI vs AI (40 games) wins P1/P2/draw:', wins.join('/'));

// AI should crush a random player
let aiWins = 0;
for (let seed = 1; seed <= 40; seed++) {
  const r = rng(seed + 999);
  const aiSide = seed % 2;
  const s = play(seed, (st) => {
    if (st.active === aiSide) return E.AI.chooseAction(st);
    const acts = E.legalActions(st); return acts[Math.floor(r() * acts.length)];
  });
  if (s.winner === aiSide) aiWins++;
}
console.log('AI vs random (40 games): AI won', aiWins);
assert(aiWins >= 34, 'AI should beat random play');

// Rules spot checks
{
  const s = E.newGame(7, ['vanguard', 'bastion']);
  s.players[0].hand = ['knight']; s.players[0].mana = 5;
  E.applyAction(s, { t: 'play', hand: 0, cell: 2 });
  assert.strictEqual(E.legalActions(s).filter((a) => a.t === 'attack').length, 0, 'no summoning-sick attacks');
  s.players[0].board[2].ready = true;
  const atk = E.legalActions(s).filter((a) => a.t === 'attack');
  assert(atk.length === 1 && atk[0].target.hero, 'open lane attacks hero');
}
console.log('All tests passed.');
