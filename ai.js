/* Greedy one-ply AI: tries every legal action, keeps the one with the best static evaluation. */
(function (root) {
  'use strict';
  const E = typeof module !== 'undefined' && module.exports ? require('./engine.js') : root.TBC;
  const { ROWS, COLS, KING_C } = E;

  function sideScore(s, p) {
    const pl = s.players[p], king = E.kingOf(s, p), foeKing = E.kingOf(s, 1 - p);
    let v = king.hp * 3 + king.armor * 4 + pl.hand.length * 2 + pl.infDeck.length * 0.2;
    const home = E.backRow(p), foeRow = E.backRow(1 - p);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const u = s.board[r][c];
        if (!u || u.p !== p || E.isKing(u)) continue;
        v += u.atk * 1.2 + u.hp * 0.8 + u.armor * 1.5;
        v -= u.poison * 1.2 + u.stuck * 1 + u.blind * 1.5;                     // trapped units are worth less
        if (E.CARDS[u.id].trap) v += 3 + Math.abs(r - home) * 0.5;             // rogues: lay traps further up the board
        if (u.atk > 0) {
          const adv = Math.abs(r - home);
          const distKing = Math.max(Math.abs(r - foeRow), Math.abs(c - KING_C));
          v += adv * 1.6 * Math.min(u.atk, 4) / 2;                 // march up the table
          v += Math.max(0, 5 - distKing) * Math.min(u.atk, 5) * 1.2; // press the castle
          if (E.inRange(u, { r, c }, { r: foeRow, c: KING_C })) v += u.atk * 1.5;
        } else if (Math.abs(r - home) <= 2) v += 1.5;              // walls hold the line near home
      }
    }
    for (const t of s.traps) {                                                   // own traps near the enemy are valuable
      if (t.p !== p) continue;
      let d = 4;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const u = s.board[r][c];
        if (u && u.p !== p && !E.isKing(u)) d = Math.min(d, Math.max(Math.abs(r - t.r), Math.abs(c - t.c)));
      }
      v += 2.5 + Math.max(0, 4 - d) * 0.6;
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
