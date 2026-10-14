/* Greedy one-ply AI: tries every legal action, keeps the one with the best static evaluation. */
(function (root) {
  'use strict';
  const E = typeof module !== 'undefined' && module.exports ? require('./engine.js') : root.TBC;
  const { FRONT, BACK, KING_I } = E;

  function sideScore(s, p) {
    const pl = s.players[p], foe = s.players[1 - p];
    let v = pl.rows[1][KING_I].hp * 3 + pl.rows[1][KING_I].armor * 4 + pl.hand.length * 2 - pl.mana * 0.4;
    for (let r = 0; r < 2; r++) {
      const len = r === 0 ? FRONT : BACK;
      for (let i = 0; i < len; i++) {
        const u = pl.rows[r][i];
        if (!u || E.isKing(u)) continue;
        const atk = E.atkOf(s, p, r, i);
        v += atk * 1.2 + u.hp * 0.8 + u.armor * 1.5;
        if (E.hasKw(u, 'ranged')) { v += 1; if (r === 1) v += 1.5; }          // artillery is safest behind the line
        else if (r === 1) v -= 1.5;                                            // melee in the back is boxed in
        if (r === 0 && i >= 2 && i <= 4) v += (i === 3 ? 3 : 1.5) * (u.armor > 0 ? 1 : 0.5); // screen the king
        if (r === 0 && !foe.rows[0][i]) v += atk * 0.3;                         // open column = pressure
      }
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
