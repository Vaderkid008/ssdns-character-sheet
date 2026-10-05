# Dust Wheel — Whiskey Bend Roulette

Rock Machines · Whiskey Bend Saloon  
Private table mini-game for Jessey’s **Six-Shooters** campaign. Eldorite chips only.

## How to open

Keep `index.html`, `styles.css`, and `game.js` in the same folder, then open `index.html` in a browser (`file://` works — no server needed).

**Suggested Windows path:**

`R:\GAME DATA\1. NON-STEAM GAMES\SALOON ROULETTE\`

Copy the folder contents there and double-click `index.html`.

## Play

1. **Set** or **Add** Eldorite chips (start at 0 — same table-play pattern as Oscar Slots).
2. Pick a **stake**: 5 / 10 / 25 / 50, custom amount, or **All In**.
3. Pick a **bet type**: Red, Black, Odd, Even, Green (0), or Straight (then pick 0–12).
4. **SPIN** — one bet per spin.

Stake is deducted when you spin. Wins credit the **full payout** (stake × multiplier), so a 10 stake at 2× returns 20 to the stack.

## Wheel

Compact western layout: **13 pockets, 0–12**.

| Pocket | Color |
|--------|--------|
| 0 | Eldorite green |
| 1, 3, 5, 7, 9, 11 | Deep red |
| 2, 4, 6, 8, 10, 12 | Charcoal black |

Result is chosen fairly at random first; the wheel then animates to that pocket.

## Payouts

| Bet | Pays | Notes |
|-----|------|-------|
| Red / Black | **2×** | Even money; **0 loses** |
| Odd / Even | **2×** | **0 loses** |
| Green (0) | **12×** | Same as straight on 0 |
| Straight (any single number 0–12) | **12×** | Includes stake in the credit |

## SFX

Mute toggle in the header. Ball clacks while spinning, soft land, win chime / western hit, lose thud — all synthesized with Web Audio (no external files).

## Files

- `index.html` — layout & copy  
- `styles.css` — ochre/umber saloon table, parchment feel, Eldorite glow  
- `game.js` — buy-in, bets, canvas wheel, payouts, audio  

Campaign tone only — not a real casino.
