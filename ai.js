/* Greedy one-ply AI: tries every legal action, keeps the one with the best static evaluation. */
(function (root) {
  'use strict';
  const E = typeof module !== 'undefined' && module.exports ? require('./engine.js') : root.TBC;
  const { ROWS, COLS, KING_C } = E;

  function sideScore(s, p) {
    const pl = s.players[p], king = E.kingOf(s, p), foeKing = E.kingOf(s, 1 - p);
    let v = king.hp * 3 + king.armor * 4 + pl.hand.length * 2 - pl.mana * 0.6;     // unspent mana is wasted, so spend it
    const home = E.kingRow(p), foeRow = E.kingRow(1 - p);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const u = s.board[r][c];
        if (!u || u.p !== p || E.isKing(u)) continue;
        v += u.atk * 1.2 + u.hp * 0.8 + u.armor * 2;                           // armour plates soak 2 damage each
        v -= u.poison * 1.2 + u.stuck * 1 + u.blind * 1.5;                     // trapped units are worth less
        if (u.ammo > 0) v += 3 + Math.abs(r - home) * 0.5;                      // rogues keep their one-shot, further up the board is better
        if (u.stealth) v += 1;
        if (u.garrison) v += u.garrison.atk * 1.2 + u.garrison.hp * 0.8 + u.garrison.armor * 2 + 2;  // an archer safe inside a tower
        if (u.atk > 0) {
          const adv = Math.abs(r - home);
          const distKing = Math.max(Math.abs(r - foeRow), Math.abs(c - KING_C));
          v += adv * 1.6 * Math.min(u.atk, 4) / 2;                 // march up the table
          v += Math.max(0, 5 - distKing) * Math.min(u.atk, 5) * 1.2; // press the castle
          if (E.inRange(u, { r, c }, { r: foeRow, c: KING_C })) v += u.atk * 1.5;
        } else if (Math.abs(r - home) <= 2) v += 1.5;              // walls hold the line near home
      }
    }
    v += E.tileCount(s, p) * 0.9;                                              // land is score (and the tie-break at the turn limit)
    for (const o of s.outposts) {                                              // hold outposts, and build on them
      const holder = s.board[o.r][o.c];
      if (!holder || holder.p !== p) continue;
      v += o.kind === 'mine' ? 4 : o.kind === 'bunker' ? 3 : o.kind === 'lookout' ? 2 : 2 + (holder.since < pl.turns ? 1.5 : 0);
    }
    if (E.legendOf(s, p)) v += 3;
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
      if (a.t === 'end' || a.t === 'swapInf') continue;       // the AI never swaps its infantry
      const s = E.clone(state);
      E.applyAction(s, a, true);
      const sc = evaluate(s, p);
      if (sc > bestScore) { best = a; bestScore = sc; }
    }
    return best;
  }

  E.AI = { chooseAction, evaluate };
})(typeof window !== 'undefined' ? window : globalThis);
