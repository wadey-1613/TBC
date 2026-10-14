(function () {
  'use strict';
  const { CARDS, DECKS, BOARD, START_HP, newGame, legalActions, applyAction, atkOf, sameRef, AI } = window.TBC;
  const ME = 0;
  const $ = (id) => document.getElementById(id);
  let state = null, pending = null, legal = [], aiRunning = false;

  // ------------------------------------------------------------ selection logic
  function fieldsMatch(a, pd) {
    return (pd.hand === undefined || a.hand === pd.hand) &&
      (pd.from === undefined || a.from === pd.from) &&
      (pd.cell === undefined || a.cell === pd.cell) &&
      (pd.target === undefined || sameRef(a.target, pd.target));
  }
  const remaining = () => legal.filter((a) => a.t !== 'end' && (!pending || fieldsMatch(a, pending)));
  const complete = (a, pd) => (a.cell === undefined || pd.cell !== undefined) && (a.target === undefined || pd.target !== undefined);

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
    if (state.active !== ME || aiRunning || state.winner != null) return;
    if (!legal.some((a) => a.t === 'play' && a.hand === i)) { pending = null; return render(); }
    pending = pending && pending.hand === i ? null : { hand: i };
    if (pending) tryExecute(); else render();
  }

  function onRef(ref) {
    if (state.active !== ME || aiRunning || state.winner != null) return;
    if (pending) {
      const rem = remaining();
      if (pending.cell === undefined && ref.p === ME && ref.slot !== undefined && rem.some((a) => a.cell === ref.slot)) {
        pending.cell = ref.slot; return tryExecute();
      }
      if (pending.target === undefined && rem.some((a) => a.target && sameRef(a.target, ref))) {
        pending.target = ref; return tryExecute();
      }
    }
    if (ref.p === ME && ref.slot !== undefined && legal.some((a) => a.from === ref.slot)) {
      pending = pending && pending.from === ref.slot ? null : { from: ref.slot };
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
      setTimeout(step, 700);
    };
    setTimeout(step, 600);
  }

  function showEnd() {
    const w = state.winner;
    const box = $('overlayBox');
    box.innerHTML = `<h1>${w === ME ? 'Victory!' : w === 2 ? 'Draw' : 'Defeat'}</h1><p>Turn ${state.turn}</p><button id="again">Play again</button>`;
    $('overlay').classList.add('show');
    $('again').onclick = showMenu;
  }

  function showMenu() {
    const box = $('overlayBox');
    box.innerHTML = '<h1>TBC — Lane Cards</h1><p>Choose your deck</p>' +
      Object.keys(DECKS).map((k) => `<button data-deck="${k}">${DECKS[k].name}</button>`).join('');
    $('overlay').classList.add('show');
    box.querySelectorAll('button').forEach((b) => { b.onclick = () => start(b.dataset.deck); });
  }

  function start(deckKey) {
    const keys = Object.keys(DECKS);
    const foe = keys.filter((k) => k !== deckKey)[0];
    state = newGame((Math.random() * 2 ** 31) | 0, [deckKey, foe]);
    pending = null; aiRunning = false;
    $('overlay').classList.remove('show');
    render();
  }

  // ------------------------------------------------------------ rendering
  const kwText = (c) => c.kw.join(' · ');

  function heroHtml(p) {
    const pl = state.players[p];
    return `<span class="name">${p === ME ? 'You' : 'Opponent'}</span>
      <span class="hp ${pl.hp <= 8 ? 'low' : ''}">♥ ${pl.hp}/${START_HP}</span>
      <span class="meta">Mana ${pl.mana}/${pl.maxMana}</span>
      <span class="meta">Hand ${pl.hand.length}</span><span class="meta">Deck ${pl.deck.length}</span>
      <span class="grow"></span>${state.active === p ? '<span class="active-badge">● Active</span>' : ''}`;
  }

  function cellHtml(p, slot, rem) {
    const m = state.players[p].board[slot];
    const ref = { p, slot };
    const isTarget = pending !== null && pending.target === undefined && rem.some((a) => a.target && sameRef(a.target, ref));
    const isDest = p === ME && !m && pending !== null && pending.cell === undefined && rem.some((a) => a.cell === slot);
    let cls = 'cell' + (isDest ? ' dest' : '');
    if (!m) return `<div class="${cls}" data-p="${p}" data-slot="${slot}"></div>`;
    const c = CARDS[m.id], atk = atkOf(state, p, slot);
    const ready = p === ME && !pending && state.active === ME && legal.some((a) => a.from === slot);
    const mc = ['minion', m.ward ? 'ward' : '', ready ? 'ready' : '', isTarget ? 'target' : '', pending && pending.from === slot && p === ME ? 'selected' : ''].join(' ');
    return `<div class="${cls}" data-p="${p}" data-slot="${slot}"><div class="${mc}" title="${c.text}">
      <div class="nm">${c.name}</div><div class="tags">${kwText(c)}</div><div class="tx">${c.text}</div>
      <div class="st"><span class="a ${atk > c.atk ? 'buffed' : ''}">⚔${atk}</span><span class="h ${m.hp < m.maxHp ? 'hurt' : ''}">♥${m.hp}</span></div></div></div>`;
  }

  function handHtml() {
    const me = state.players[ME];
    return me.hand.map((id, i) => {
      const c = CARDS[id];
      const playable = state.active === ME && !aiRunning && legal.some((a) => a.t === 'play' && a.hand === i);
      const cls = ['card', playable ? 'playable' : 'dim', pending && pending.hand === i ? 'selected' : ''].join(' ');
      return `<div class="${cls}" data-hand="${i}"><div class="cost">${c.cost}</div><div class="nm">${c.name}</div>
        <div class="ty">${c.type}</div><div class="tags">${kwText(c)}</div><div class="tx">${c.text}</div>
        <div class="st">${c.type === 'minion' ? `<span class="a">⚔${c.atk}</span><span class="h">♥${c.hp}</span>` : ''}</div></div>`;
    }).join('');
  }

  function hint() {
    if (state.active !== ME) return 'Opponent is thinking…';
    if (!pending) return 'Your turn — play a card or select a glowing minion.';
    if (pending.hand !== undefined) {
      const c = CARDS[state.players[ME].hand[pending.hand]];
      if (c.type === 'minion' && pending.cell === undefined) return 'Choose a lane to place it in.';
      return 'Choose a target.';
    }
    return 'Choose a target to attack, or an adjacent empty lane to shift into.';
  }

  function render() {
    legal = state.active === ME && state.winner == null ? legalActions(state) : [];
    const rem = pending ? remaining() : [];
    const heroTarget = (p) => pending && pending.target === undefined && rem.some((a) => a.target && sameRef(a.target, { p, hero: true }));
    for (const [id, p] of [['foeHero', 1 - ME], ['myHero', ME]]) {
      $(id).innerHTML = heroHtml(p);
      $(id).className = 'hero' + (heroTarget(p) ? ' target' : '');
      $(id).dataset.hero = p;
    }
    $('foeBoard').innerHTML = Array.from({ length: BOARD }, (_, s) => cellHtml(1 - ME, s, rem)).join('');
    $('myBoard').innerHTML = Array.from({ length: BOARD }, (_, s) => cellHtml(ME, s, rem)).join('');
    $('hand').innerHTML = handHtml();
    $('hint').textContent = hint();
    $('endBtn').disabled = state.active !== ME || aiRunning || state.winner != null;
    const logEl = $('log');
    logEl.innerHTML = state.log.map((l) => `<div>${l}</div>`).join('');
    logEl.scrollTop = logEl.scrollHeight;
  }

  // ------------------------------------------------------------ events
  document.addEventListener('click', (e) => {
    const hand = e.target.closest('[data-hand]');
    if (hand) return onHand(+hand.dataset.hand);
    const cell = e.target.closest('.cell');
    if (cell) return onRef({ p: +cell.dataset.p, slot: +cell.dataset.slot });
    const hero = e.target.closest('.hero');
    if (hero) return onRef({ p: +hero.dataset.hero, hero: true });
  });
  $('endBtn').onclick = () => {
    if (state.active !== ME || aiRunning) return;
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
