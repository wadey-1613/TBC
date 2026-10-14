/* Greedy one-ply AI: tries every legal action, keeps the one with the best static evaluation. */
(function (root) {
  'use strict';
  const E = typeof module !== 'undefined' && module.exports ? require('./engine.js') : root.TBC;
  const { CARDS, BOARD } = E;

  function sideScore(s, p) {
    const pl = s.players[p], foe = s.players[1 - p];
    let v = pl.hp * 1.5 + pl.hand.length * 1.5 - pl.mana * 0.4;
    for (let slot = 0; slot < BOARD; slot++) {
      const m = pl.board[slot];
      if (!m) continue;
      const atk = E.atkOf(s, p, slot);
      v += (atk + m.hp) * 1.2;
      if (m.ward) v += 1.5;
      if (E.hasKw(m, 'ranged')) v += 1.5;
      if (CARDS[m.id].aura) v += 2;
      if (!foe.board[slot]) v += atk * 0.4; // open lane = pressure on the hero
    }
    return v;
  }

  function evaluate(s, p) {
    if (s.winner === p) return 1e6;
    if (s.winner === 1 - p) return -1e6;
    if (s.winner === 2) return -1000;
    return sideScore(s, p) - sideScore(s, 1 - p);
  }

  function chooseAction(state) {
    const p = state.active;
    let best = { t: 'end' }, bestScore = evaluate(state, p) + 0.01;
    for (const a of E.legalActions(state)) {
      if (a.t === 'end') continue;
      const s = E.clone(state);
      E.applyAction(s, a);
      const sc = evaluate(s, p);
      if (sc > bestScore) { best = a; bestScore = sc; }
    }
    return best;
  }

  E.AI = { chooseAction, evaluate };
})(typeof window !== 'undefined' ? window : globalThis);
