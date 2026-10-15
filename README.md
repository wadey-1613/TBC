# TBC — King's Table (prototype)

War-sim card game on a shared 7x8 grid: march up the table and destroy the enemy castle (king).
Open `index.html` to play against the AI. `node test.js` runs rules tests and playouts.

## Board
7 wide x 8 deep. Your castle (king) is at the bottom, theirs at the top. New cards appear on your back row.
**Defence** units (▣ infantry and ♠ cards) can also be placed anywhere within 2 tiles of your king.

## Per turn
1. **Infantry pop-up (3 cards):** for each card choose **deploy** (free, you then place it on the board), **recycle** (to the bottom of the infantry deck, once a turn) or **hold** it in your hand. Anything you leave is **discarded**.
2. **Squad pop-up (2 cards):** **play** one now or **hold** it in your hand. The other is discarded.
   Your **hand** holds up to 3 cards (squad cards and infantry together) and is always shown under the board. You may play **one card from your hand per turn**. Playing the squad card you were just offered doesn't use that up, and neither does deploying infantry.
3. **Move up to 3 units**, one tile each (forward or sideways). Only units that were already on the board when your turn began can move; anything you place this turn is *new*. Rogues move 2 tiles. *Swift* units (Champion) don't use up one of the 3 moves.
4. **Attack:** every unit may attack once per turn, for free.

Anything left in your offers when you end the turn is discarded. When a deck runs out, its own discard pile is shuffled into a new deck. Running out is never a loss; the only win is destroying the enemy castle.

## Rogues and traps (infantry, 6 of the 36 cards)
Rogues have no attack, move up to 2 tiles, and may lay **one trap per turn** on an empty tile next to them. An enemy that steps onto a trap springs it (the trap is used up). You can't step on your own traps. Each player keeps at most 5 traps; the oldest vanishes.
| Rogue | Trap | Effect on the unit that triggers it |
|---|---|---|
| Poisoner | ☠ Poison | 1 damage at the start of each of its owner's next 2 turns |
| Trapper | 🕸 Sticky | can't move on its owner's next turn |
| Saboteur | ✦ Flash | can't attack on its owner's next turn |

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

## Opponent speed
The AI takes about 9 actions a turn and they are replayed one by one so you can follow them. The **Opponent speed** setting (Normal / Fast / Instant, remembered in your browser) controls the pacing, and **Skip opponent** finishes its turn at once. Normal is about 2 seconds a turn.

## Game records (for review)
The published page records every game as the random seed plus each action either side took, and saves it to the page's database (`games/<id>`) after each round and when the game ends. The side panel has a note box that is stored with the game.
`node replay.js game.json` replays a saved record and prints the log and a board after every turn. Records replay only on the rules version that made them (`VERSION` in `engine.js`; bump it whenever a rule or card changes).

## Files
`engine.js` rules + card tables · `ai.js` greedy AI · `ui.js`/`index.html` browser UI · `test.js` tests · `replay.js` game replayer
