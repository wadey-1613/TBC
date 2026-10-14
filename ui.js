(function () {
  'use strict';
  const E = window.TBC;
  const { CARDS, SYM, SUIT_ROLE, FRONT, BACK, KING_I, KING_HP, newGame, legalActions, applyAction, atkOf, sameRef, locEq, isKing, AI } = E;
  const ME = 0;
  const $ = (id) => document.getElementById(id);
  let state = null, pending = null, legal = [], aiRunning = false;

  // ------------------------------------------------------------ selection logic
  // pending = partial action: { hand?, from?, cell?, target? }. Legal actions are filtered by it.
  function fieldsMatch(a, pd) {
    return (pd.hand === undefined || a.hand === pd.hand) &&
      (pd.from === undefined || locEq(a.from, pd.from)) &&
      (pd.cell === undefined || locEq(a.cell, pd.cell)) &&
      (pd.target === undefined || sameRef(a.target, pd.target));
  }
  const remaining = () => legal.filter((a) => a.t !== 'end' && (!pending || fieldsMatch(a, pending)));
  const complete = (a, pd) => (a.cell === undefined || pd.cell !== undefined) && (a.target === undefined || pd.target !== undefined);
  const myTurn = () => state.active === ME && !aiRunning && state.winner == null;

  function tryExecute() {
    const rem = remaining();
    if (rem.length === 1 && complete(rem[0], pending)) {
      const a = rem[0];
      pending = null;
      applyAction(state, a);
      afterAction();
    } else render();
  }

  function onHand(i) {
    if (!myTurn()) return;
    if (!legal.some((a) => a.t === 'play' && a.hand === i)) { pending = null; return render(); }
    pending = pending && pending.hand === i ? null : { hand: i };
    render();
  }

  function onRef(ref) {
    if (!myTurn()) return;
    if (pending) {
      const rem = remaining();
      if (pending.cell === undefined && ref.p === ME && rem.some((a) => locEq(a.cell, ref))) {
        pending.cell = { r: ref.r, i: ref.i }; return tryExecute();
      }
      if (pending.target === undefined && rem.some((a) => a.target && sameRef(a.target, ref))) {
        pending.target = { p: ref.p, r: ref.r, i: ref.i }; return tryExecute();
      }
    }
    if (ref.p === ME && legal.some((a) => a.from && locEq(a.from, ref))) {
      pending = pending && pending.from && locEq(pending.from, ref) ? null : { from: { r: ref.r, i: ref.i } };
    } else pending = null;
    render();
  }

  // ------------------------------------------------------------ flow
  function afterAction() {
    render();
    if (state.winner != null) return showEnd();
    if (state.active !== ME) aiLoop();
  }

  function aiLoop() {
    aiRunning = true;
    const step = () => {
      if (state.winner != null || state.active === ME) { aiRunning = false; return render(); }
      applyAction(state, AI.chooseAction(state));
      render();
      if (state.winner != null) { aiRunning = false; return showEnd(); }
      setTimeout(step, 650);
    };
    setTimeout(step, 600);
  }

  function showEnd() {
    const w = state.winner;
    $('overlayBox').innerHTML = `<h1>${w === ME ? 'Victory!' : w === 2 ? 'Draw' : 'Defeat'}</h1><p>${state.reason} (turn ${state.turn})</p><button id="again">Play again</button>`;
    $('overlay').classList.add('show');
    $('again').onclick = start;
  }

  function showMenu() {
    $('overlayBox').innerHTML = `<h1>King's Table</h1>
      <p>52 cards each. Protect your king, break theirs.<br>
      ♠ Defence · ♣ Swarm · ♦ Siege · ♥ Long range</p><button id="go">Start game</button>`;
    $('overlay').classList.add('show');
    $('go').onclick = start;
  }

  function start() {
    state = newGame((Math.random() * 2 ** 31) | 0);
    pending = null; aiRunning = false;
    $('overlay').classList.remove('show');
    render();
  }

  // ------------------------------------------------------------ rendering
  const red = (suit) => suit === 'H' || suit === 'D';
  const kwText = (c) => c.kw.filter((k) => !['swarm', 'breach', 'ranged'].includes(k)).join(' · '); // suit keywords already shown as the role

  function barHtml(p) {
    const pl = state.players[p];
    return `<b>${p === ME ? 'You' : 'Opponent'}</b><span>Mana <b>${pl.mana}/${pl.maxMana}</b></span><span>Hand <b>${pl.hand.length}</b></span><span>Deck <b>${pl.deck.length}</b></span><span class="grow"></span>${state.active === p ? '<span class="active-badge">● Active</span>' : ''}`;
  }

  function cellHtml(p, r, i, rem) {
    const u = state.players[p].rows[r][i];
    const ref = { p, r, i };
    const isDest = p === ME && !u && pending !== null && pending.cell === undefined && rem.some((a) => locEq(a.cell, ref));
    const attrs = `class="cell${isDest ? ' dest' : ''}" data-p="${p}" data-r="${r}" data-i="${i}"`;
    if (!u) return `<div ${attrs}></div>`;
    const c = CARDS[u.id];
    const isTarget = pending !== null && pending.target === undefined && rem.some((a) => a.target && sameRef(a.target, ref));
    const ready = p === ME && !pending && myTurn() && legal.some((a) => a.from && locEq(a.from, ref));
    const sel = p === ME && pending && pending.from && locEq(pending.from, ref);
    const cls = ['unit', c.suit || '', isKing(u) ? 'king' : '', ready ? 'ready' : '', isTarget ? 'target' : '', sel ? 'selected' : ''].join(' ');
    const atk = atkOf(state, p, r, i);
    const title = `${c.name}${c.suit ? ' — ' + SUIT_ROLE[c.suit] : ''}${c.text ? ': ' + c.text : ''}`;
    const rk = isKing(u) ? '♔' : `<span class="rk ${red(c.suit) ? 'red' : ''}">${c.rank}${SYM[c.suit]}</span>`;
    const stats = isKing(u)
      ? `<span class="h ${u.hp < u.maxHp ? 'hurt' : ''}">♥${u.hp}</span>${u.armor ? `<span class="ar">🛡${u.armor}</span>` : '<span></span>'}`
      : `<span class="a ${atk > u.atk ? 'buffed' : ''}">⚔${atk}</span>${u.armor ? `<span class="ar">🛡${u.armor}</span>` : ''}<span class="h ${u.hp < u.maxHp ? 'hurt' : ''}">♥${u.hp}</span>`;
    return `<div ${attrs}><div class="${cls}" title="${title}">${rk}<div class="nm">${c.name}</div><div class="tg">${kwText(c)}</div><div class="st">${stats}</div></div></div>`;
  }

  function rowHtml(p, r) {
    const len = r === 0 ? FRONT : BACK;
    const pad = r === 1 ? '<div></div>' : '';           // centre the 5-slot back row under the 7-slot front row
    return pad + Array.from({ length: len }, (_, i) => cellHtml(p, r, i, pending ? remaining() : [])).join('') + pad;
  }

  function handHtml() {
    return state.players[ME].hand.map((id, i) => {
      const c = CARDS[id];
      const playable = myTurn() && legal.some((a) => a.t === 'play' && a.hand === i);
      const cls = ['card', c.suit, playable ? 'playable' : 'dim', pending && pending.hand === i ? 'selected' : ''].join(' ');
      return `<div class="${cls}" data-hand="${i}"><div class="cost">${c.cost}</div>
        <div class="top ${red(c.suit) ? 'red' : ''}">${c.rank}${SYM[c.suit]}</div><div class="nm">${c.name}</div>
        <div class="ty">${SUIT_ROLE[c.suit]}</div><div class="tags">${kwText(c)}</div><div class="tx">${c.text}</div>
        <div class="st"><span class="a">⚔${c.atk}</span>${c.armor ? `<span class="ar">🛡${c.armor}</span>` : ''}<span class="h">♥${c.hp}</span></div></div>`;
    }).join('');
  }

  function hint() {
    if (state.winner != null) return state.reason;
    if (state.active !== ME) return 'Opponent is thinking…';
    if (!pending) return 'Your turn — play a card, or select a green unit to attack / move.';
    if (pending.hand !== undefined) return pending.cell === undefined ? 'Choose an empty slot (front or back row).' : 'Choose a target.';
    return 'Choose a target to attack, or an empty slot to move into.';
  }

  function render() {
    legal = state.active === ME && state.winner == null ? legalActions(state) : [];
    $('foeBar').innerHTML = barHtml(1 - ME);
    $('myBar').innerHTML = barHtml(ME);
    $('foeBack').innerHTML = rowHtml(1 - ME, 1);
    $('foeFront').innerHTML = rowHtml(1 - ME, 0);
    $('myFront').innerHTML = rowHtml(ME, 0);
    $('myBack').innerHTML = rowHtml(ME, 1);
    $('hand').innerHTML = handHtml();
    $('hint').textContent = hint();
    $('endBtn').disabled = !myTurn();
    const logEl = $('log');
    logEl.innerHTML = state.log.map((l) => `<div>${l}</div>`).join('');
    logEl.scrollTop = logEl.scrollHeight;
  }

  // ------------------------------------------------------------ events
  document.addEventListener('click', (e) => {
    const hand = e.target.closest('[data-hand]');
    if (hand) return onHand(+hand.dataset.hand);
    const cell = e.target.closest('.cell');
    if (cell) return onRef({ p: +cell.dataset.p, r: +cell.dataset.r, i: +cell.dataset.i });
  });
  $('endBtn').onclick = () => {
    if (!myTurn()) return;
    pending = null;
    applyAction(state, { t: 'end' });
    afterAction();
  };
  const cancel = () => { pending = null; if (state) render(); };
  document.addEventListener('contextmenu', (e) => { e.preventDefault(); cancel(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cancel(); });

  showMenu();
  window.__tbc = { get state() { return state; }, render };
})();
