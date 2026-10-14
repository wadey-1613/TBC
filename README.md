# TBC — King's Table (prototype)

Two-player tactical card game played with a standard 52-card deck. Open `index.html` to play against the AI.
`node test.js` runs the rules tests and AI/random playouts.

## Board (per player)
```
back row:        [ ] [ ] [K] [ ] [ ]        king in the middle, 2 flank slots each side
front row:   [ ][ ][ ][ ][ ][ ][ ]          7 slots
```
Any card can go in any empty slot. Units may move one slot (sideways, or between rows) instead of attacking.

## Rules
- Win by destroying the enemy king (30 HP), or when the opponent must draw from an empty deck.
- Mana: +1 per turn up to 10. Every card is a unit with a mana cost. Hand limit 8.
- Melee units in the front row hit the **first unit** (front row, then the back row behind it) in their own or a neighbouring column. Melee units in the back row can't attack. Defenders strike back.
- The king can only be reached when the column in front of it is open.

## Suits
| Suit | Role | Trait |
|---|---|---|
| ♠ | Defence | Armour: every hit is reduced by N. Place in front of the king. |
| ♣ | Small offence | Swarm: +1 attack per adjacent club. Cheap, overloads the table; useless against armour. |
| ♦ | Large offence | Breach: ignores armour, double damage to ♠. Expensive. |
| ♥ | Long range | Hits any column, no retaliation, can't target the king. Fragile; safest in the back row. |

Face cards (J/Q/K) and some others have play effects (heal king, summon, area damage, draw...).

## Files
`engine.js` rules + card table · `ai.js` greedy AI · `ui.js`/`index.html` browser UI · `test.js` tests
