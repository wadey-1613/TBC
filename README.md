# TBC — King's Table (prototype)

Two-player tactical card game. Open `index.html` to play against the AI. `node test.js` runs rules tests and playouts.

## Two piles per player
- **Infantry deck (36)** — small melee / ranged / defence units. **Free.** Each turn you deploy the top card (it's face-up, so you can plan). The deck can run out.
- **Card deck (52, standard suits)** — drawn to your hand, cost mana. Big units, boosts and tactics.

## Board (per player)
```
back row:        [ ] [ ] [K] [ ] [ ]        king in the middle, 2 flank slots each side
front row:   [ ][ ][ ][ ][ ][ ][ ]          7 slots
```
Cards can be placed in any empty slot. Units may move one slot instead of attacking.

## Turn
1. Mana +1 (max 10), your units wake up, draw 1 card.
2. Deploy your next infantry (free, once per turn). The second player's first turn gets 2 deploys.
3. Play cards, attack, move. End turn.

## Combat
- Melee units in the front row hit the **first unit** (front, then the back row behind it) in their own or a neighbouring column. Back-row melee can't attack. Defenders strike back.
- **Armour** reduces every hit by N. **Breach** (siege) ignores armour, doubles vs ♠. **Ranged** hits any column, takes no retaliation, can't target the king.
- Win by destroying the enemy king (30 HP) or when the opponent must draw from an empty card deck.

## Infantry
| Class | Cards | Notes |
|---|---|---|
| ⚔ Melee | Swordsman 2/2, Brute 3/1, Spearman 1/3 | cheap damage |
| ➶ Ranged | Archer 2/1, Slinger 1/2 | pick off units from behind the line |
| ▣ Defence | Shieldman 1/3, Guard 0/4, Pikeman 2/2 | armour 1 |

## Hand deck suits
| Suit | Role |
|---|---|
| ♦ | **Siege** — big breach units (up to 12/10) and siege tactics |
| ♠ | **Defence** — fortresses with heavy armour, king healing, armour boosts |
| ♣ | **Offence** — infantry boosts, extra deploys, conscription, commanders |
| ♥ | **Long range** — artillery, volleys, card draw |

## Files
`engine.js` rules + card tables · `ai.js` greedy AI · `ui.js`/`index.html` browser UI · `test.js` tests
