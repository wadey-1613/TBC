// Replay a recorded game and print what happened.
//   node replay.js game.json            (a record document: { seed, actions: "<json string>", ... })
// The record only replays on the rules version that recorded it (see VERSION in engine.js).
const fs = require('fs');
const E = require('./engine.js');
const rec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const actions = typeof rec.actions === 'string' ? JSON.parse(rec.actions) : rec.actions;
if (rec.rules && rec.rules !== E.VERSION) console.log(`warning: recorded on rules ${rec.rules}, engine is ${E.VERSION}; the replay may not match`);
const s = E.newGame(rec.seed);
const glyph = (u) => {
  if (!u) return ' .  ';
  const c = E.CARDS[u.id];
  const ch = E.isKing(u) ? 'K' : c.inf ? ({ melee: 'm', ranged: 'r', defence: 'd', rogue: 'g' })[c.cls] : (c.suit + c.rank).slice(0, 2);
  return `${u.p ? 'x' : 'o'}${ch}${String(u.hp).padStart(2)}`.padEnd(4);
};
function board() {
  const rows = [];
  for (let r = E.ROWS - 1; r >= 0; r--) {
    let line = '';
    for (let c = 0; c < E.COLS; c++) {
      const t = E.trapAt(s, r, c);
      line += (s.board[r][c] ? glyph(s.board[r][c]) : t ? (t.p ? 'xT  ' : 'oT  ') : ' .  ') + ' ';
    }
    rows.push(line);
  }
  return rows.join('\n');
}
let shown = 0;
for (const a of actions) {
  const turnBefore = s.turn;
  E.applyAction(s, a);
  if (s.turn !== turnBefore) {
    console.log(s.log.slice(shown).join('\n')); shown = s.log.length;
    console.log(`\n=== end of turn ${turnBefore} | castles ${E.kingOf(s, 0).hp} / ${E.kingOf(s, 1).hp} | traps ${s.traps.filter((t) => !t.p).length} mine, ${s.traps.filter((t) => t.p).length} theirs ===\n${board()}\n`);
  }
}
console.log(s.log.slice(shown).join('\n'));
console.log(`\nresult: ${s.winner == null ? 'unfinished' : s.winner === 2 ? 'draw' : 'player ' + (s.winner + 1) + ' won'} on turn ${s.turn}. ${s.reason}`);
