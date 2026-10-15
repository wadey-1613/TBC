# TBC — King's Table (prototype)

War-sim card game on a shared 7x9 grid: march up the table and destroy the enemy castle (king), or own more land when the rounds run out.
Open `index.html` to play against the AI. `node test.js` runs rules tests and playouts.

## Board and land (compact rules, r16)
5 wide x 7 deep. Each **king sits off the grid, one row behind your back row** (rows 0 and 8 hold only the kings). New cards appear on your back row (the first row of play).
**Defence** units (▣ infantry and ♠ cards) can also go in your first two rows. You hit a king with melee from the enemy's back row (any of the 3 tiles in front of it) or with range from 2-3 rows out.
- **Land:** your 3 back rows start as yours, the enemy's 3 as theirs, the middle row is neutral (16 tiles each incl. the king's, 5 neutral). **Landing on a tile claims it** and it stays yours until an enemy lands on it. Hidden rogues claim nothing.
- **♣ Land Grab** (3 mana): claim the 3x3 around a tile that touches your land. Tiles holding enemy units are not taken.
- **Outposts ⚑:** 2 marked tiles, a mirrored pair near the middle. A unit that has stood on one since your previous turn lets you build there (free): **🏹 Lookout** (a ranged unit on it shoots one tile further), **⛺ Bunker** (+1 free infantry each turn, placeable around it), **⛏ Gold Mine** (+1 mana each turn). They work for whoever stands on them.
- **King's Legend ★:** summon it next to your king. Level 1/2/3 by tiles owned (under 19 / 19-22 / 23+) sets its stats and cost (1/2/3 mana). Roughly twice a normal unit (level 1: 4 attack, 3 armour, 6 health). Its move of up to 3 tiles costs **one action** and claims every tile it lands on. One at a time; after it falls you wait as many turns as it cost.
- **Time limit:** 15 rounds each. If nobody has taken a castle, whoever owns more tiles wins (a tie goes to the healthier castle).
- Future idea: bigger boards for a longer tactical mode (the size lives in a few constants in `engine.js`).

## Per turn
1. **Draw** 1 squad card. You start with 4 cards and hold up to 6 (a card drawn into a full hand goes to the bottom of the deck, so nothing is lost). The first player skips the draw on turn 1.
2. **Mana** is 1 on your first turn, 2 on your second, and so on up to 10. Unspent mana doesn't carry over.
3. **Play cards** from your hand: as many as your mana pays for (the number in the card's corner is its cost). Units go on the board, boosts take effect and go to the discard pile.
4. **Free infantry:** one infantry card is dealt to you each turn. Place it straight away for free; an unplaced infantry goes to the bottom of its deck.
5. **3 actions:** every move (one step forward or sideways; hidden rogues two, any direction; only units that were on the board when your turn began) and every attack (once per unit) uses one action. Rogue traps and bombs use one too. *Swift* units (Champion) move for free. Playing cards uses mana, not actions.

**Where cards go:** new units appear on your back row. Defence units (▣ and ♠ cards) may also go in your first two rows, and archers may go into a friendly Siege Tower. If every usual tile for a card is full, it may use any empty tile on your first two rows.
When a deck runs out, its own discard pile is shuffled into a new deck. Running out is never a loss; a game is won by destroying the enemy castle or by owning more land when time runs out.

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
Destroy the enemy king (30 HP) on their back row, or own more tiles when the 40 rounds run out.

## Cards
- **Infantry (38)**, stats are attack / armour plates / health:
  - ⚔ Melee ×10 (Swordsman, Brute, Spearman): 2 / 1 / 2
  - ➶ Ranged ×10 (Archer, Slinger): 1 / 1 / 2
  - ▣ Defence ×10 (Shieldman, Guard, Pikeman): 0 / 3 / 3, counters
  - 🗡 Rogues ×8 (Poisoner, Trapper, Saboteur, Bomber ×2 each): 1 / 2 / 2, hidden
- **Squad deck (40):** ♦ Siege (+ Siege Tower) · ♠ Defence walls (4 to 6 health, armour 1 to 4, no attack) · ♣ Offence · ♥ Long range. Units and boosts mixed, plus a Land Grab.

## Arrives and On fall
Squad units can carry an **Arrives** effect (when played) and an **On fall** bonus (when they die, including from poison or bombs; bonuses can chain).
- Arrives: **claim** the 8 tiles around it (Ladder Crew, Siege Engine, Colossus) · **shove** adjacent enemies back a tile (Juggernaut, Behemoth, Crossbow Battery) · **reveal** hidden enemies within 2 (Longbowmen, Siege Archers) · **draw** (Heavy Crossbow, Siege Archers) · **heal king** (Citadel) · **Sticky Trap** next to it (Master Archer).
- On fall: **1 damage** to adjacent enemies (Mangonel, Siege Engine, Behemoth, Colossus) · **poison** them (Ballista Cart, Behemoth) · **Poison Trap** on its tile (Catapult) · **Skeleton** 1/0/1 on its tile (Trebuchet, Juggernaut, Colossus) · adjacent friends **+1 armour** (Bulwark, Citadel) · **land stays yours** (Fortress, Warlord) · **+1 mana** next turn (General).
- Card art comes from the Eternal Legion sheet (`art/sq/`); the art's tier is the card's rarity label for now (cosmetic).

## Opponent pacing
The AI takes about 9 actions a turn and they are replayed one by one so you can follow them. Before it moves it **thinks for a random 1-10 seconds** (a 💭 indicator shows). The side panel's **Opponent** settings (remembered in your browser) choose the pacing: *speed* (Normal / Fast / Instant) and *thinking* (once per turn, before every action, or off). **Skip opponent** ends the thinking and finishes its turn at once.

## Game records (for review)
The published page records every game as the random seed plus each action either side took, and saves it to the page's database (`games/<id>`) after each round and when the game ends. The side panel has a note box that is stored with the game.
`node replay.js game.json` replays a saved record and prints the log and a board after every turn. Records replay only on the rules version that made them (`VERSION` in `engine.js`; bump it whenever a rule or card changes).

## Files
`engine.js` rules + card tables · `ai.js` greedy AI · `ui.js`/`index.html` browser UI · `test.js` tests · `replay.js` game replayer
