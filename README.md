# TBC — King's Table (prototype)

War-sim card game on a shared 7x8 grid: march up the table and destroy the enemy castle (king).
Open `index.html` to play against the AI. `node test.js` runs rules tests and playouts.

## Board
7 wide x 8 deep. Your castle (king) is at the bottom, theirs at the top. New cards appear on your back row.
**Defence** units (▣ infantry and ♠ cards) can also be placed anywhere within 2 tiles of your king.

## Per turn
1. **Draw** 1 squad card. You start with 5 cards and hold up to 8 (a card drawn into a full hand goes to the bottom of the deck, so nothing is lost). The first player skips the draw on turn 1.
2. **Mana** is 1 on your first turn, 2 on your second, and so on up to 10. Unspent mana doesn't carry over.
3. **Play cards** from your hand: as many as your mana pays for (the number in the card's corner is its cost). Units go on the board, boosts take effect and go to the discard pile.
4. **Free infantry:** one infantry card is dealt to you each turn. Place it straight away for free, or pay **1 mana once a turn to swap** it for the next one. An unplaced infantry goes to the bottom of its deck.
5. **Move up to 3 units**, one tile each (forward or sideways). Only units that were already on the board when your turn began can move; anything you place this turn is *new*. Hidden rogues move 2 tiles in any direction. *Swift* units (Champion) don't use up one of the 3 moves.
6. **Attack:** every unit may attack once per turn, for free.

**Where cards go:** new units appear on your back row. Defence units (▣ and ♠ cards) may also go anywhere within 2 tiles of your king, and archers may go into a friendly Siege Tower. If every usual tile for a card is full, it may use any empty tile on your first two rows.
When a deck runs out, its own discard pile is shuffled into a new deck. Running out is never a loss; the only win is destroying the enemy castle.

## Armour, walls and counters
- **Armour is a pool of plates.** A normal hit removes `ceil(attack / 2)` plates and leaves health alone. Once the plates are gone, hits go to health at full strength (no spill-over). **Breach** (♦ siege), poison and bombs ignore armour; boosts that deal damage do too.
- **Walls** (all ♠ unit cards, the ♦ **Siege Tower**) have no attack and never counter. **Defence infantry** (▣) have no attack either, but **counter** an adjacent melee hit from the front or sides for `floor(attack / 2)` if they survive the hit. Ranged attackers are never countered.
- Anything with the defence shape takes **double damage from behind** (and doesn't counter that hit).
- Other units strike back at adjacent attackers inside their own shape, as before.
- **Siege Tower** (53rd card): a wall that holds **one archer**. Place an archer card straight into it, or step an archer in. The archer shoots from inside (using its own reach) and can't be targeted. If the tower is destroyed the archer drops out onto that tile.

## Rogues (8 of the 38 infantry cards)
Rogues start **hidden**: they can't be targeted by attacks or boosts, and bomb blasts miss them. A hidden rogue **moves 2 tiles in any direction** and has **one** special action. Using it (or making a sneak attack) **reveals it for good**, and it fights on as a plain melee unit (1 attack, 2 armour, moves 1 forward or sideways).
- **Stealth rogues** (Poisoner, Trapper, Saboteur, 2 each) lay **one trap** on an empty tile next to them: ☠ **Poison** 1 damage at the start of each of its owner's next 2 turns · 🕸 **Sticky** can't move on its owner's next turn · ✦ **Flash** can't attack on its owner's next turn. An enemy that steps on the trap springs it. You can't step on your own traps.
- **Bombers** (2) throw **one bomb** at a tile exactly 2 away: 1 damage (ignoring armour) to that tile and every tile around it, **friends and castles too**.
- **Sneak attack:** a hidden rogue's attack does **double damage**. Trap, bomb and sneak attack are alternatives; it only gets one of them.

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
- **Defence:** the 3 tiles ahead plus left and right, never behind. Walls and defence infantry don't attack; this shape decides where they counter and what counts as "behind".
- A unit **strikes back** only if the attacker is adjacent and inside the defender's own shape. Range attackers are never hit back.
- Damage boosts only hit enemies that one of *your* units could attack. Nothing hits across the whole board.

| Cards | Shape |
|---|---|
| Infantry melee; ♣ commanders; ♦ rams and heavy siege | Melee |
| Infantry archers/slingers; all ♥ archers; ♦ catapults (Mangonel, Catapult, Trebuchet); Marksman | Range |
| Infantry defence; all ♠ walls; ♦ Siege Tower | Defence (no attack) |

## Win
Destroy the enemy king (30 HP) on their back row. (A game that reaches turn 300 is a stalemate.)

## Cards
- **Infantry (38)**, stats are attack / armour plates / health:
  - ⚔ Melee ×10 (Swordsman, Brute, Spearman): 2 / 1 / 2
  - ➶ Ranged ×10 (Archer, Slinger): 1 / 1 / 2
  - ▣ Defence ×10 (Shieldman, Guard, Pikeman): 0 / 3 / 3, counters
  - 🗡 Rogues ×8 (Poisoner, Trapper, Saboteur, Bomber ×2 each): 1 / 2 / 2, hidden
- **Squad deck (53):** ♦ Siege (+ Siege Tower) · ♠ Defence walls (4 to 6 health, armour 1 to 4, no attack) · ♣ Offence · ♥ Long range. Units and boosts mixed.

## Opponent pacing
The AI takes about 9 actions a turn and they are replayed one by one so you can follow them. Before it moves it **thinks for a random 1-10 seconds** (a 💭 indicator shows). The side panel's **Opponent** settings (remembered in your browser) choose the pacing: *speed* (Normal / Fast / Instant) and *thinking* (once per turn, before every action, or off). **Skip opponent** ends the thinking and finishes its turn at once.

## Game records (for review)
The published page records every game as the random seed plus each action either side took, and saves it to the page's database (`games/<id>`) after each round and when the game ends. The side panel has a note box that is stored with the game.
`node replay.js game.json` replays a saved record and prints the log and a board after every turn. Records replay only on the rules version that made them (`VERSION` in `engine.js`; bump it whenever a rule or card changes).

## Files
`engine.js` rules + card tables · `ai.js` greedy AI · `ui.js`/`index.html` browser UI · `test.js` tests · `replay.js` game replayer
