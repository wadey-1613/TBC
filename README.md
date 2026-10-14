# TBC — Lane Cards (prototype)

A two-player card strategy game, Hearthstone-style but with more positional depth. No build step.

- **Play:** open `index.html` in a browser (you vs. a simple AI).
- **Test:** `node test.js` (random/AI playouts with invariant checks).

## Rules
- 25 HP each, 30-card decks, mana +1 per turn (max 10), hand limit 7, fatigue when the deck is empty.
- Minions sit on a 5-lane board. A minion may attack an enemy minion in its **own or an adjacent lane**,
  or the enemy hero **only when the opposing lane is empty**. Melee attackers take retaliation damage.
- Instead of attacking, a minion may **shift** one lane sideways into an empty slot.
- Keywords: **Swift** (acts the turn it's played), **Ward** (blocks the next damage), **Ranged** (any lane, no retaliation).
- Position effects: *Standard Bearer* buffs adjacent allies; *Drillmaster* buffs neighbours on play.

## Layout
- `engine.js` — pure rules engine (state, legal actions, apply). Card data lives at the top.
- `ai.js` — greedy AI that scores each legal action.
- `ui.js`, `index.html` — browser UI.
