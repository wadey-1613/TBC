/* TBC rules engine. Pure state + actions, no DOM. Works in browser (window.TBC) and node (require). */
(function (root) {
  'use strict';

  const BOARD = 5, HAND_MAX = 7, MAX_MANA = 10, START_HP = 25;

  // ---------------------------------------------------------------- cards
  // Minion keywords: swift (can act the turn it's played), ward (blocks the next damage),
  //                  ranged (attacks any lane, takes no retaliation)
  // aura 'adjAtk': adjacent allied minions get +1 attack.
  // target kinds: enemyMinion | allyMinion | anyMinion | anyCharacter
  // effect 'to': target | enemyHero | ownHero | enemyMinions | allyMinions | allMinions | adjacentAllies
  const M = (id, name, cost, atk, hp, extra) => Object.assign({ id, name, type: 'minion', cost, atk, hp, kw: [], text: '' }, extra);
  const S = (id, name, cost, extra) => Object.assign({ id, name, type: 'spell', cost, kw: [], text: '' }, extra);

  const list = [
    M('squire', 'Squire', 1, 1, 3),
    M('cutpurse', 'Cutpurse', 1, 2, 1, { kw: ['swift'] }),
    M('initiate', 'Warded Initiate', 2, 1, 2, { kw: ['ward'] }),
    M('slinger', 'Slinger', 2, 1, 2, { kw: ['ranged'] }),
    M('martyr', 'Martyr', 2, 2, 2, { text: 'Last Words: draw a card.', onDeath: [{ op: 'draw', n: 1 }] }),
    M('bearer', 'Standard Bearer', 3, 2, 3, { aura: 'adjAtk', text: 'Adjacent allies have +1 attack.' }),
    M('medic', 'Field Medic', 3, 2, 3, { target: 'anyCharacter', text: 'Play: restore 3 health.', effects: [{ op: 'heal', n: 3, to: 'target' }] }),
    M('knight', 'Knight', 3, 3, 3),
    M('raider', 'Raider', 3, 3, 2, { kw: ['swift'] }),
    M('sharpshooter', 'Sharpshooter', 4, 3, 3, { kw: ['ranged'] }),
    M('pyromancer', 'Pyromancer', 4, 3, 2, { target: 'enemyMinion', text: 'Play: deal 2 damage to an enemy minion.', effects: [{ op: 'damage', n: 2, to: 'target' }] }),
    M('warden', 'Warden', 4, 2, 5, { kw: ['ward'] }),
    M('drillmaster', 'Drillmaster', 5, 4, 4, { text: 'Play: adjacent allies get +1/+1.', effects: [{ op: 'buff', atk: 1, hp: 1, to: 'adjacentAllies' }] }),
    M('stormcaller', 'Stormcaller', 5, 3, 3, { kw: ['swift'], text: 'Play: deal 1 damage to all enemy minions.', effects: [{ op: 'damage', n: 1, to: 'enemyMinions' }] }),
    M('ogre', 'Ogre', 5, 5, 5),
    M('wyrm', 'Wyrm', 7, 6, 6, { kw: ['ranged'] }),
    M('colossus', 'Colossus', 8, 8, 8),

    S('spark', 'Spark', 1, { target: 'enemyMinion', text: 'Deal 2 damage to an enemy minion.', effects: [{ op: 'damage', n: 2, to: 'target' }] }),
    S('fortify', 'Fortify', 1, { target: 'allyMinion', text: 'Give a minion +0/+3 and Ward.', effects: [{ op: 'buff', atk: 0, hp: 3, to: 'target' }, { op: 'ward', to: 'target' }] }),
    S('mend', 'Mend', 2, { target: 'anyCharacter', text: 'Restore 5 health.', effects: [{ op: 'heal', n: 5, to: 'target' }] }),
    S('rally', 'Rallying Cry', 2, { text: 'Your minions get +1/+1.', effects: [{ op: 'buff', atk: 1, hp: 1, to: 'allyMinions' }] }),
    S('insight', 'Insight', 2, { text: 'Draw 2 cards.', effects: [{ op: 'draw', n: 2 }] }),
    S('bolt', 'Bolt', 2, { target: 'anyCharacter', text: 'Deal 3 damage.', effects: [{ op: 'damage', n: 3, to: 'target' }] }),
    S('volley', 'Volley', 3, { text: 'Deal 2 damage to all enemy minions.', effects: [{ op: 'damage', n: 2, to: 'enemyMinions' }] }),
    S('assassinate', 'Assassinate', 4, { target: 'enemyMinion', text: 'Destroy an enemy minion.', effects: [{ op: 'damage', n: 99, to: 'target' }] }),
    S('fireball', 'Fireball', 4, { target: 'anyCharacter', text: 'Deal 5 damage.', effects: [{ op: 'damage', n: 5, to: 'target' }] }),
  ];
  const CARDS = {};
  list.forEach((c) => { CARDS[c.id] = c; });

  const two = (ids) => ids.flatMap((id) => [id, id]);
  const DECKS = {
    vanguard: { name: 'Vanguard (aggro)', cards: two(['cutpurse', 'squire', 'raider', 'knight', 'bearer', 'slinger', 'spark', 'bolt', 'rally', 'drillmaster', 'stormcaller', 'sharpshooter', 'fireball', 'martyr', 'ogre']) },
    bastion: { name: 'Bastion (control)', cards: two(['initiate', 'martyr', 'medic', 'warden', 'pyromancer', 'fortify', 'mend', 'insight', 'volley', 'assassinate', 'sharpshooter', 'bearer', 'ogre', 'wyrm', 'colossus']) },
  };

  // ---------------------------------------------------------------- helpers
  function rand(state) { // mulberry32
    state.rng = (state.rng + 0x6D2B79F5) | 0;
    let t = state.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffle(state, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand(state) * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  const sameRef = (a, b) => !!a && !!b && a.p === b.p && a.hero === b.hero && a.slot === b.slot;
  const clone = (state) => { const l = state.log; state.log = null; const c = JSON.parse(JSON.stringify(state)); state.log = l; return c; };
  function log(state, msg) { if (state.log) { state.log.push(msg); if (state.log.length > 80) state.log.shift(); } }

  const minionAt = (state, p, slot) => (slot >= 0 && slot < BOARD ? state.players[p].board[slot] : null);
  function atkOf(state, p, slot) {
    const m = minionAt(state, p, slot);
    if (!m) return 0;
    let a = m.atk;
    for (const d of [-1, 1]) {
      const n = minionAt(state, p, slot + d);
      if (n && CARDS[n.id].aura === 'adjAtk') a += 1;
    }
    return a;
  }
  const hasKw = (m, kw) => CARDS[m.id].kw.includes(kw);
  const refName = (state, r) => (r.hero ? `Player ${r.p + 1}` : CARDS[state.players[r.p].board[r.slot].id].name);

  // ---------------------------------------------------------------- game setup / flow
  function newGame(seed, deckIds) {
    const state = { rng: seed | 0, turn: 1, active: 0, winner: null, uid: 0, log: [], players: [] };
    for (let p = 0; p < 2; p++) {
      state.players.push({ hp: START_HP, mana: 0, maxMana: 0, fatigue: 0, deck: shuffle(state, DECKS[deckIds[p]].cards.slice()), hand: [], board: new Array(BOARD).fill(null) });
    }
    for (let i = 0; i < 3; i++) draw(state, 0);
    for (let i = 0; i < 4; i++) draw(state, 1);
    startTurn(state);
    return state;
  }

  function draw(state, p) {
    const pl = state.players[p];
    if (!pl.deck.length) {
      pl.fatigue++;
      pl.hp -= pl.fatigue;
      log(state, `Player ${p + 1} is out of cards and takes ${pl.fatigue} fatigue damage.`);
      return;
    }
    const id = pl.deck.pop();
    if (pl.hand.length >= HAND_MAX) log(state, `Player ${p + 1}'s hand is full; ${CARDS[id].name} is discarded.`);
    else pl.hand.push(id);
  }

  function startTurn(state) {
    const pl = state.players[state.active];
    pl.maxMana = Math.min(MAX_MANA, pl.maxMana + 1);
    pl.mana = pl.maxMana;
    pl.board.forEach((m) => { if (m) m.ready = true; });
    draw(state, state.active);
    log(state, `— Turn ${state.turn}: Player ${state.active + 1} —`);
    cleanup(state);
  }

  function dealDamage(state, ref, n) {
    if (n <= 0) return;
    if (ref.hero) { state.players[ref.p].hp -= n; return; }
    const m = minionAt(state, ref.p, ref.slot);
    if (!m) return;
    if (m.ward) { m.ward = false; return; }
    m.hp -= n;
  }

  function cleanup(state) {
    for (let guard = 0; guard < 30; guard++) {
      let died = false;
      for (let p = 0; p < 2; p++) {
        for (let s = 0; s < BOARD; s++) {
          const m = state.players[p].board[s];
          if (m && m.hp <= 0) {
            state.players[p].board[s] = null;
            died = true;
            log(state, `${CARDS[m.id].name} dies.`);
            const c = CARDS[m.id];
            if (c.onDeath) runEffects(state, c.onDeath, { p, slot: s });
          }
        }
      }
      if (!died) break;
    }
    if (state.winner == null) {
      const d0 = state.players[0].hp <= 0, d1 = state.players[1].hp <= 0;
      if (d0 && d1) state.winner = 2;
      else if (d0) state.winner = 1;
      else if (d1) state.winner = 0;
      if (state.winner != null) log(state, state.winner === 2 ? 'Draw!' : `Player ${state.winner + 1} wins!`);
    }
  }

  function resolveTargets(state, to, ctx) {
    const refs = [];
    const mins = (p) => state.players[p].board.forEach((m, slot) => { if (m) refs.push({ p, slot }); });
    switch (to) {
      case 'target': if (ctx.target) refs.push(ctx.target); break;
      case 'enemyHero': refs.push({ p: 1 - ctx.p, hero: true }); break;
      case 'ownHero': refs.push({ p: ctx.p, hero: true }); break;
      case 'enemyMinions': mins(1 - ctx.p); break;
      case 'allyMinions': mins(ctx.p); break;
      case 'allMinions': mins(0); mins(1); break;
      case 'adjacentAllies':
        for (const d of [-1, 1]) if (minionAt(state, ctx.p, ctx.slot + d)) refs.push({ p: ctx.p, slot: ctx.slot + d });
        break;
      default: break;
    }
    return refs;
  }

  function runEffects(state, effects, ctx) {
    for (const e of effects) {
      if (e.op === 'draw') { for (let i = 0; i < e.n; i++) draw(state, ctx.p); continue; }
      for (const ref of resolveTargets(state, e.to, ctx)) {
        if (e.op === 'damage') dealDamage(state, ref, e.n);
        else if (e.op === 'heal') {
          if (ref.hero) state.players[ref.p].hp = Math.min(START_HP, state.players[ref.p].hp + e.n);
          else { const m = minionAt(state, ref.p, ref.slot); if (m) m.hp = Math.min(m.maxHp, m.hp + e.n); }
        } else if (e.op === 'buff') {
          const m = minionAt(state, ref.p, ref.slot);
          if (m) { m.atk += e.atk; m.hp += e.hp; m.maxHp += e.hp; }
        } else if (e.op === 'ward') {
          const m = minionAt(state, ref.p, ref.slot);
          if (m) m.ward = true;
        }
      }
    }
  }

  // ---------------------------------------------------------------- legal actions
  function validTargets(state, p, kind) {
    const refs = [];
    const mins = (q) => state.players[q].board.forEach((m, slot) => { if (m) refs.push({ p: q, slot }); });
    if (kind === 'enemyMinion') mins(1 - p);
    else if (kind === 'allyMinion') mins(p);
    else if (kind === 'anyMinion') { mins(p); mins(1 - p); }
    else if (kind === 'anyCharacter') { mins(p); mins(1 - p); refs.push({ p, hero: true }, { p: 1 - p, hero: true }); }
    return refs;
  }

  function attackTargets(state, p, slot) {
    const m = minionAt(state, p, slot);
    const out = [];
    const foe = 1 - p;
    if (hasKw(m, 'ranged')) {
      state.players[foe].board.forEach((e, s) => { if (e) out.push({ p: foe, slot: s }); });
    } else {
      for (const d of [-1, 0, 1]) if (minionAt(state, foe, slot + d)) out.push({ p: foe, slot: slot + d });
    }
    if (!minionAt(state, foe, slot)) out.push({ p: foe, hero: true });
    return out;
  }

  function legalActions(state) {
    if (state.winner != null) return [];
    const p = state.active, me = state.players[p], acts = [];
    const empty = [];
    me.board.forEach((m, s) => { if (!m) empty.push(s); });

    me.hand.forEach((id, i) => {
      const c = CARDS[id];
      if (c.cost > me.mana) return;
      const targets = c.target ? validTargets(state, p, c.target) : [];
      if (c.type === 'minion') {
        for (const cell of empty) {
          if (targets.length) targets.forEach((target) => acts.push({ t: 'play', hand: i, cell, target }));
          else acts.push({ t: 'play', hand: i, cell });
        }
      } else if (c.target) {
        targets.forEach((target) => acts.push({ t: 'play', hand: i, target }));
      } else {
        acts.push({ t: 'play', hand: i });
      }
    });

    me.board.forEach((m, from) => {
      if (!m || !m.ready) return;
      if (atkOf(state, p, from) > 0) attackTargets(state, p, from).forEach((target) => acts.push({ t: 'attack', from, target }));
      for (const d of [-1, 1]) if (minionAt(state, p, from + d) === null && from + d >= 0 && from + d < BOARD) acts.push({ t: 'move', from, cell: from + d });
    });

    acts.push({ t: 'end' });
    return acts;
  }

  // ---------------------------------------------------------------- apply
  function applyAction(state, a) {
    const key = JSON.stringify(a);
    if (!legalActions(state).some((x) => JSON.stringify(x) === key)) throw new Error('Illegal action ' + key);
    const p = state.active, me = state.players[p];

    if (a.t === 'end') {
      state.active = 1 - p;
      state.turn++;
      startTurn(state);
      return state;
    }

    if (a.t === 'play') {
      const id = me.hand[a.hand], c = CARDS[id];
      me.hand.splice(a.hand, 1);
      me.mana -= c.cost;
      if (c.type === 'minion') {
        me.board[a.cell] = { uid: ++state.uid, id, atk: c.atk, hp: c.hp, maxHp: c.hp, ward: c.kw.includes('ward'), ready: c.kw.includes('swift') };
        log(state, `Player ${p + 1} plays ${c.name} in lane ${a.cell + 1}.`);
        if (c.effects) runEffects(state, c.effects, { p, slot: a.cell, target: a.target });
      } else {
        log(state, `Player ${p + 1} casts ${c.name}${a.target ? ' on ' + refName(state, a.target) : ''}.`);
        runEffects(state, c.effects, { p, target: a.target });
      }
    } else if (a.t === 'move') {
      me.board[a.cell] = me.board[a.from];
      me.board[a.from] = null;
      me.board[a.cell].ready = false;
      log(state, `${CARDS[me.board[a.cell].id].name} shifts to lane ${a.cell + 1}.`);
    } else if (a.t === 'attack') {
      const att = me.board[a.from], atkVal = atkOf(state, p, a.from);
      att.ready = false;
      if (a.target.hero) {
        log(state, `${CARDS[att.id].name} hits Player ${a.target.p + 1} for ${atkVal}.`);
        dealDamage(state, a.target, atkVal);
      } else {
        const defVal = atkOf(state, a.target.p, a.target.slot);
        log(state, `${CARDS[att.id].name} attacks ${refName(state, a.target)}.`);
        dealDamage(state, a.target, atkVal);
        if (!hasKw(att, 'ranged')) dealDamage(state, { p, slot: a.from }, defVal);
      }
    }
    cleanup(state);
    return state;
  }

  const api = { BOARD, HAND_MAX, MAX_MANA, START_HP, CARDS, DECKS, newGame, legalActions, applyAction, clone, atkOf, hasKw, sameRef, minionAt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TBC = api;
})(typeof window !== 'undefined' ? window : globalThis);
