# TBC — King's Table (prototype)

War-sim card game on a shared 7x9 grid: march up the table and destroy the enemy castle (king).
Open `index.html` to play against the AI. `node test.js` runs rules tests and playouts.

## Per turn
1. **Infantry offer (3 cards):** deploy one (free, it appears on your back row), **recycle** one to the bottom of the infantry deck, and the third is **discarded** for good.
2. **Squad offer (2 cards):** use one, either **play** it (units appear on your back row, boosts take effect) or **hold** it in your hand (max 3). The other is discarded. You can play **one** squad card per turn, the offered one or one from your hand.
3. **Move up to 3 units**, one tile each, forward or sideways. Only units that were already on the board when your turn began can move; anything you place this turn is *new* and has to wait. (*Swift* units, like the Champion, don't use up one of the 3 moves.)
4. **Attack:** every unit may attack once per turn, for free.

Anything left in your offers when you end the turn is discarded. When a deck runs out, its own discard pile is shuffled into a new deck, so discarding means "not this lap" and nothing is lost for good. Running out of cards is never a loss; the only win is destroying the enemy castle.

## Reach (three shapes, from the design sketch)
Forward is toward the enemy castle.
```
MELEE      RANGE       DEFENCE
x x x      x x x       x x x
x M x      x x x       x D x
x x x      - - -
             R
```
- **Melee:** all 8 tiles around the unit.
- **Range:** the 2nd and 3rd rows ahead, 3 tiles wide. The row right in front is a blind spot.
- **Defence:** the 3 tiles ahead plus left and right, never behind.
- A unit **strikes back** only if the attacker is adjacent and inside the defender's own shape. Range attackers are never hit back.
- **Armour** reduces every hit. **Breach** (♦ siege) ignores armour and does double to ♠.
- Damage boosts only hit enemies that one of *your* units could attack. Nothing hits across the whole board.

| Cards | Shape |
|---|---|
| Infantry melee; ♣ commanders; ♦ rams and heavy siege | Melee |
| Infantry archers/slingers; all ♥ archers; ♦ catapults (Mangonel, Catapult, Trebuchet); Marksman | Range |
| Infantry defence; all ♠ fortresses | Defence |

## Win
Destroy the enemy king (30 HP) on their back row. (A game that reaches turn 300 is a stalemate.)

## Cards
- **Infantry (36):** melee (Swordsman 2/2, Brute 3/1, Spearman 1/3), ranged (Archer 2/1, Slinger 1/2), defence (Shieldman 1/3, Guard 0/4, Pikeman 2/2, armour 1).
- **Squad deck (52, standard suits):** ♦ Siege · ♠ Defence · ♣ Offence · ♥ Long range. Units and boosts mixed.

## Files
`engine.js` rules + card tables · `ai.js` greedy AI · `ui.js`/`index.html` browser UI · `test.js` tests
