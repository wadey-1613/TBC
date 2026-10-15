# TBC — King's Table (prototype)

War-sim card game on a shared 7x9 grid: march up the table and destroy the enemy castle (king).
Open `index.html` to play against the AI. `node test.js` runs rules tests and playouts.

## Per turn
1. **Deploy 1 infantry** (free, top of your infantry deck). It appears on your back row.
2. **Reveal a squad card** (top of your 52-card deck). Play it (units appear on your back row, boosts take effect) or **hold** it in your hand (max 3). You may play **one** squad card per turn, the revealed one or one from hand. An unused revealed card is discarded.
3. **Move 1 unit** one tile, forward or sideways. (Champion/Scout-style *swift* units move without using your move.)
4. **Attack:** every unit may attack once per turn, for free.

## Reach
- **Melee** (infantry, defence, siege): the 8 tiles around it. The target strikes back.
- **➶ Ranged** (archers, slingers): up to 2 tiles away, in front or beside, never behind. No retaliation.
- **♥ Artillery**: up to 2 tiles away in **any** direction. No retaliation.
- **Armour** reduces every hit. **Breach** (♦ siege) ignores armour and does double to ♠.

## Win
Destroy the enemy king (30 HP) on their back row, or the opponent runs out of squad cards.

## Cards
- **Infantry (36):** melee (Swordsman 2/2, Brute 3/1, Spearman 1/3), ranged (Archer 2/1, Slinger 1/2), defence (Shieldman 1/3, Guard 0/4, Pikeman 2/2, armour 1).
- **Squad deck (52, standard suits):** ♦ Siege · ♠ Defence · ♣ Offence · ♥ Long range. Units and boosts mixed.

## Files
`engine.js` rules + card tables · `ai.js` greedy AI · `ui.js`/`index.html` browser UI · `test.js` tests
