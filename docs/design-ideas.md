# King's Table — design ideas shelf

Researched from Hearthstone, Magic, Pokémon, Yu-Gi-Oh, Flesh and Blood, Legends of Runeterra, Marvel Snap, Lorcana, Gwent, KeyForge, Star Realms, Slay the Spire, Clash Royale, TFT, Duelyst/Faeria, Into the Breach, Gloomhaven, Memoir '44, XCOM, Advance Wars, Wargroove, Fire Emblem, Total War, Warhammer 40k, Bolt Action, Stratego, Heroes of Might and Magic, plus general wargame systems (zones of control, terrain, supply, morale).

Nothing here is built. Each entry says what the idea is in the original game, then **our twist**, written for our board (7x8 grid, armour plates, hidden rogues, hand + mana, three reach shapes). Nothing is copied: names, text and exact numbers are ours.

Rating: **Fit** (how well it suits us) / **Cost** (S = an evening, M = a day, L = a big change).

---

## A. Resources and turn flow

### 1. Spend a card as mana instead of playing it
*Seen in:* Flesh and Blood (pitching), Lorcana (inkwell). Any card can become a resource.
**Our twist: "Requisition".** Once per turn, bin a squad card from hand to gain +2 mana this turn (the card goes to the *bottom of the deck*, not the discard, so it comes back later). Fixes dead hands and lets the player choose between a big card now or two small ones. Infantry can't be requisitioned, they're free already.
Fit: high / Cost: S

### 2. Mana that banks a little
*Seen in:* Legends of Runeterra (unspent mana feeds a spell-only pool).
**Our twist: "Stores".** Unspent mana is lost, but each unspent point instead fills a *supply meter* (max 3) that can only pay for **boosts**, never units. Turns the 50% mana the AI wastes into a real decision, and rewards holding back to bluff a trick.
Fit: high / Cost: S

### 3. One big action per turn, rest are small
*Seen in:* Flesh and Blood action points, Gloomhaven two-card turns.
**Our twist: "Orders".** Besides 3 moves, you get 1 **order** a turn from a fixed menu: Forced March (move 2 units twice), Hold the Line (all your defence units gain +1 armour plate until next turn), Rally (revive one fallen infantry from your discard to the back row at 1 HP). Choose one: a regular small decision with no extra cards.
Fit: high / Cost: M

### 4. Alternate who attacks first
*Seen in:* Legends of Runeterra attack token.
**Our twist: "Initiative".** Instead of alternating turns, the player who has *lost more plates last round* holds initiative, and acts first in the next round (units attack in alternating bursts of one unit each). Needs big rework of turn structure, so park it, but it's a clean comeback tool.
Fit: medium / Cost: L

### 5. First player handicap
*Seen in:* Pokémon (first player can't attack turn 1), Hearthstone's "coin".
**Our twist:** the second player starts with 6 cards and a free "Reserve" token worth 1 mana once. Already roughly handled by the first player skipping their draw, so test before adding.
Fit: medium / Cost: S

---

## B. Hand and deck

### 6. Cards that change from the discard
*Seen in:* Yu-Gi-Oh (graveyard recursion), Magic (flashback).
**Our twist: "Scrap value".** Every unit card in your discard pile can be *scavenged* once for 1 mana to put 1 armour plate on any friendly unit. Dead units still matter, and it softens being behind.
Fit: high / Cost: S

### 7. Deck thinning and relics
*Seen in:* Slay the Spire (remove cards, relics for passive bonuses).
**Our twist: "Veterans".** After a game with N turns survived, a unit that never died earns a banner; at game start (or deck building later) you may attach up to 3 banners to cards giving +1 armour or -1 cost. Mostly useful if the game gets a meta layer and persistent decks.
Fit: medium / Cost: L

### 8. Unique decks per player
*Seen in:* KeyForge (every deck unique, no deck building).
**Our twist: "Draft the Table".** Before the match, both players draft the 53-card squad deck from shared packs, 5 picks of 3 from the 52-card base. Keeps card pool the same, adds identity.
Fit: medium / Cost: M

### 9. Shared market row
*Seen in:* Star Realms trade row, Dominion supply.
**Our twist: "The Quartermaster".** Three face-up squad cards in the middle. Pay *+1 mana* to take one into hand instead of drawing from your deck. Both players raid it, so there's tension about what to leave for the enemy.
Fit: high / Cost: M

### 10. Draw choices without pop-ups
*Seen in:* Hearthstone "Discover".
**Our twist:** only on specific cards (e.g. Scout, ♣). When played, look at the top 3, take 1 to hand, others go to the bottom. Not an every-turn pop-up, so flow is kept.
Fit: high / Cost: S

---

## C. Board, movement and terrain

### 11. Terrain tiles
*Seen in:* Commands & Colors, XCOM cover, Advance Wars terrain stars.
**Our twist: "Ground cards".** Start with 4 neutral tiles dealt at random in the middle rows: **Wood** (blocks range shots *through* it, doesn't block melee), **Rubble** (units standing here get +1 plate but move at half speed), **Ford** (first unit onto it can't attack that turn), **Hill** (range units here reach one tile further). Both players see them from turn 1.
Fit: very high / Cost: M

### 12. Flanking beats armour
*Seen in:* XCOM (flank negates cover), Total War (rear/flank penalties), Wargroove (critical hits from positioning).
**Our twist: "Pinned".** Already half in: we double damage from behind for defence shapes. Extend: *any* unit attacked from two opposite sides in one turn loses its armour plates against the second hit. Rewards multi-unit coordination.
Fit: high / Cost: S

### 13. Zones of control
*Seen in:* hex wargames (ZOC stops movement next to enemies).
**Our twist: "Locked".** A unit that starts its move adjacent to an enemy melee unit can only move *sideways or backwards*, not forwards, until that enemy dies. Walls and defence infantry then hold lanes. Rogues are exempt while hidden.
Fit: high / Cost: S

### 14. Overwatch
*Seen in:* XCOM, Warhammer.
**Our twist: "Hold fire".** An archer that doesn't attack on its turn is *set*: during the enemy's turn it shoots the first unit that walks into its reach. Converts "all units can attack" into a defensive choice, but costs the 1 attack.
Fit: high / Cost: M

### 15. Elevation and the back row
*Seen in:* Advance Wars, Heroes of Might and Magic.
**Our twist: "Parapet".** Units on your own back row get +1 plate while there's still a unit in front of them. Tiny reward for keeping a second line.
Fit: medium / Cost: S

### 16. Capturable objectives
*Seen in:* Advance Wars (capture for income), 40k (hold the objective).
**Our twist: "Outposts".** Two outpost tiles, one on each side of the middle row. Standing on one with a unit at the start of your turn gives +1 mana *this turn only* (not banked). Gives the middle a purpose beyond just walking past it.
Fit: very high / Cost: M

### 17. Supply lines
*Seen in:* grand-strategy wargames.
**Our twist: "Beaten path".** A unit needs a friendly unit within 2 tiles behind it, or it counts as *out of supply* and attacks for 1 less. Cutting off a lone advanced unit becomes a way to win trades.
Fit: medium / Cost: M

---

## D. Hidden information and bluffing

### 18. Face-down cards
*Seen in:* Yu-Gi-Oh (set cards), Stratego (hidden ranks).
**Our twist: "Ambush cards".** Some squad cards can be *set* face-down on a back-row tile for the normal cost. It acts as a "?" token the enemy can attack (hit does 1 damage, it flips). On flipping it becomes the real card for free. Bluffing with cheap decoys is allowed (Decoys cost 1).
Fit: very high / Cost: M

### 19. Bomb tokens and scouts
*Seen in:* Stratego.
**Our twist:** let a **Scout** infantry reveal one hidden rogue or face-down card in a 2-tile radius when it ends its move. Rogues stay powerful but have a counter other than blind luck.
Fit: high / Cost: S

### 20. Telegraphed attacks
*Seen in:* Into the Breach, Slay the Spire intents.
**Our twist: "Marked tile".** Siege units (♦) must *mark* a target tile at the end of the turn; the strike lands at the start of their next turn and hits whoever is on the tile. Big damage but the enemy can move away, so siege becomes a movement puzzle, not a dice roll.
Fit: very high / Cost: M

### 21. Open information about the decks
*Seen in:* Into the Breach (perfect information).
**Our twist:** show the *count* of each suit left in both decks. Cheap, builds skill rather than luck.
Fit: high / Cost: S

---

## E. Commanders and powers

### 22. A hero with a power
*Seen in:* Hearthstone hero powers, Wargroove commanders, Advance Wars CO powers.
**Our twist: "The King's Decree".** Each king has a once-per-game decree, picked at start from three: **Muster** (place 2 free infantry), **Fortify** (every defence unit +2 plates), **Edict of Silence** (the enemy plays no boosts next turn). Kings can't act but their decree gives them identity. Choosing is a small, early skill moment.
Fit: very high / Cost: M

### 23. Power meter that fills when you take damage
*Seen in:* Advance Wars (taking losses charges your power).
**Our twist: "Fury gauge".** Each point of king damage fills the gauge by 1; at 10 you may spend it for the Decree above a second time. Comeback tool that costs the leader nothing.
Fit: high / Cost: S

### 24. Commander death ends the game, and commanders fight
*Seen in:* Wargroove, Commander (Magic).
**Our twist:** already true. A cheaper twist: let the king fire back (1 damage, ranged, onto a tile 2 away) once per turn. Stops rush-ins where the king is an immobile bag, but needs balancing against the 30 HP.
Fit: medium / Cost: S

---

## F. Units, keywords and synergy

### 25. Entry and death triggers
*Seen in:* Hearthstone battlecry/deathrattle.
**Our twist: "On arrival / On fall".** Add two printed keywords to some squad units: "On arrival: …" (heals the king 2, or pushes an adjacent enemy one tile) and "On fall: …" (drops one trap on its tile, or gives an adjacent friend 1 plate). Players can read what a dead unit will do.
Fit: very high / Cost: M

### 26. Rock-paper-scissors between shapes
*Seen in:* Fire Emblem weapon triangle.
**Our twist: "Shape bonus".** Melee does +1 vs. range (they're easy to chase), range does +1 vs. defence shapes (hits them where armour is thin: 'over the shield'), defence units *halve* melee they counter. Each reach shape gets one clear favourite and one nightmare matchup.
Fit: very high / Cost: S

### 27. Merge three copies
*Seen in:* TFT (three-of-a-kind upgrades).
**Our twist: "Veteran squad".** If you have 3 adjacent identical infantry (e.g. three Swordsmen touching), you may spend 1 mana to merge them into one **Guard Captain** with the sum of stats minus 1. Thins the board and creates a dangerous target.
Fit: high / Cost: M

### 28. Units upgrade over the existing unit
*Seen in:* Lorcana (shift), Fire Emblem (promotion).
**Our twist: "Field promotion".** A squad unit can be played *over* a friendly infantry that already stands on the board: the infantry becomes the squad unit, keeping its remaining plates and damage taken. Cost reduced by 1. Cheap infantry get a purpose beyond meat.
Fit: very high / Cost: M

### 29. Quest or exert choice
*Seen in:* Lorcana (quest vs challenge).
**Our twist: "Dig in".** Instead of attacking, a unit may *dig in*: it can't move or attack until your next turn, gains 1 plate, and the tile counts as a mini-wall (counts as defence shape from the front). Option for tank play with any unit.
Fit: high / Cost: S

### 30. Morale and routing
*Seen in:* Total War, Memoir '44 retreat on flags.
**Our twist: "Shaken".** A unit that has lost all armour plates *and* is now at half health or less becomes **shaken**: its owner chooses to retreat it (it moves 1 back automatically each turn) or let it fight at -1 attack. Lets players save wounded units without extra cards.
Fit: high / Cost: M

### 31. Charge bonus
*Seen in:* Total War, Fire Emblem cavalry.
**Our twist:** a melee unit that moves *two or more tiles in a straight line* before attacking gets +1 attack and ignores one plate. Reinforces the existing Champion (swift), and rewards open-ground play.
Fit: medium / Cost: S

### 32. Combo chains
*Seen in:* Flesh and Blood (go again), Hearthstone combo.
**Our twist: "Follow-through".** The second consecutive attack by the same suit in a turn gains +1 damage (♦ then ♦). Hand management and ordering matter.
Fit: medium / Cost: S

### 33. Tokens with a short fuse
*Seen in:* Clash Royale (spawns), Hearthstone (tokens).
**Our twist: "Militia".** Some boosts create **2 Militia** (1/0/1) that vanish after 3 turns. They fill front rows and block ranged lanes, then disappear without cleanup.
Fit: high / Cost: S

---

## G. Interaction and reactions

### 34. Instant-speed responses
*Seen in:* Magic (instants), Yu-Gi-Oh (traps), Netrunner.
**Our twist: "Counter-orders".** Four squad boosts can be played on the *enemy's* turn if you kept the mana open (e.g. "Hold!" cancels one enemy move, "Reflect" returns a poison trap's effect). Keeping mana unspent finally has value, and so does bluffing.
Fit: very high / Cost: L (the UI needs interrupts)

### 35. Reaction on being attacked
*Seen in:* Flesh and Blood (defend with cards), Gloomhaven.
**Our twist: "Shield from hand".** When your king would take damage, discard a ♠ card from hand to cancel 3 damage. Your hand becomes a health bar, not just a menu, and the AI needs to choose when to push the king.
Fit: high / Cost: M

### 36. Redirect and push
*Seen in:* Into the Breach (push), Duelyst.
**Our twist: "Shove".** Some attacks (shields, rams) push the target one tile away. Pushing a unit onto a trap, into a bomb blast, or out of reach is very satisfying.
Fit: very high / Cost: M

### 37. Weather on the whole board
*Seen in:* Gwent (weather rows), Marvel Snap (location rules).
**Our twist: "Front rows".** At the start of every 5th round a neutral **Event card** is flipped: Fog (ranged units can't shoot beyond 2 tiles), Rain (poison deals no damage), Muster (both players deploy 1 free infantry), Frost (no moves for units on row 3–4). Both play around the known upcoming event.
Fit: very high / Cost: M

---

## H. Structure, modes and comebacks

### 38. Round and pass
*Seen in:* Gwent (pass and win rounds).
**Our twist:** skip. Our win is the king, so rounds would fight the core idea.

### 39. Short games
*Seen in:* Marvel Snap (6 turns), Clash Royale (3 minutes).
**Our twist: "Blitz mode".** 5x6 board, king 16 HP, 7 starting cards, mana jumps 2 per turn. About 10 turns. Good for quick online rounds and for testing balance.
Fit: high / Cost: M

### 40. Two-front lanes
*Seen in:* Artifact (three lanes), Marvel Snap (three locations).
**Our twist:** the board already splits into three vertical lanes of 2-3 columns each. Add a **lane bonus** (win the lane by occupying more tiles in it at turn end to gain 1 mana next turn). Makes positioning matter, not just kills.
Fit: high / Cost: M

### 41. Punishing the leader gently
*Seen in:* Mario Kart blue shell, comeback mechanics research (opportunity, not punishment).
**Our twist:** the player *behind on king health* gets a **second free infantry** each turn. Never a penalty, only more material.
Fit: high / Cost: S

### 42. Campaign carry-over
*Seen in:* Heroes of Might and Magic (hero levelling with two random skill picks), Slay the Spire (run structure).
**Our twist: "Campaign of Marches".** After a win, the king gains a perk (pick 1 of 2 random: +2 HP, +1 mana on turn 1, a Decree swap). Persisted in the page database. Gives the solo player a reason to keep going.
Fit: medium / Cost: L

### 43. Daily or seeded puzzle
*Seen in:* Into the Breach, Slay the Spire dailies.
**Our twist: "Siege puzzle".** A fixed board and hand; "win the game in one turn" or "survive two turns". Our deterministic seeds make this cheap to author and share.
Fit: high / Cost: M

### 44. Spectator and replays
*Seen in:* every digital card game.
**Our twist:** the recorder already stores seeded games. Add a *share link* that replays a game inside the page. Very low cost for us.
Fit: very high / Cost: S

---

## I. Rogue and stealth deepening

### 45. Hidden counters as bluff pieces
*Seen in:* Stratego, Yu-Gi-Oh.
**Our twist:** allow any back-row infantry to be placed **in the shadows** (hidden like a rogue, but with no special) for 1 mana. The enemy can't tell a real rogue from a decoy.
Fit: very high / Cost: S

### 46. Trap detection
*Seen in:* XCOM, tabletop RPG skill checks.
**Our twist:** after a unit has been poisoned, stuck or flashed by a trap, the *whole table* sees that trap type's tile as revealed. Teaches what's possible and stops pure luck.
Fit: high / Cost: S

### 47. Disarming
*Seen in:* Pokémon status cures, XCOM.
**Our twist:** a unit may spend its attack to *disarm* an adjacent trap, removing it safely. Gives melee a use against rogue spam.
Fit: very high / Cost: S

---

# Our shortlist

If I had to pick the six that most strengthen "a card game with tactical, warlike features" with the least rewrite:

1. **Terrain tiles (11)** with **Outposts (16)** — gives the board reasons to be fought over.
2. **Telegraphed siege (20)** — makes ♦ cards a movement puzzle instead of a click.
3. **King's Decree (22)** — identity and a skill moment for each player.
4. **Shape bonus (26)** — makes the three reach shapes a readable triangle.
5. **Field promotion (28)** — gives infantry a point past being fodder.
6. **Counter-orders (34)** — the biggest payoff for holding mana, but the most UI work.

Quick wins, an evening each: Requisition (1), Stores (2), Locked (13), Dig in (29), Scout (19), Shape bonus (26), Disarming (47).
