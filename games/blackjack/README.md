# Whiskey Bend Blackjack

Rock Machines · Whiskey Bend Saloon  
Private felt mini-game for Jessey’s **Six-Shooters** campaign. Eldorite chips only.

## How to open

Keep `index.html`, `styles.css`, and `game.js` in the same folder, then open `index.html` in a browser (`file://` works — no server needed).

**Suggested Windows path:**

`R:\GAME DATA\1. NON-STEAM GAMES\SALOON BLACKJACK\`

Copy the folder contents there and double-click `index.html`.

## Play

1. **Set** or **Add** Eldorite chips (start at 0 — same table-play pattern as Oscar Slots / Dust Wheel).
2. Pick a **stake**: 5 / 10 / 25 / 50, custom amount, or **All In**.
3. **DEAL** — stake is deducted up front.
4. **Hit**, **Stand**, or **Double** (first two cards only, if balance covers another stake).
5. Dealer plays out; payouts credit to your stack.

## Rules (v1)

| Rule | Detail |
|------|--------|
| Deck | Standard 52; reshuffles when fewer than ~20 cards remain |
| Dealer | Hits until 17+, **stands on all 17s** (including soft 17) |
| Blackjack | Natural 21 on two cards pays **3:2** |
| Win | **1:1** (stake returned + equal win) |
| Push | Stake returned |
| Bust | Stake lost |
| Double | Doubles stake, one card, then stand |
| Insurance | **Skipped** in v1 |

Solo vs dealer only — no splits, no side bets.

## SFX

Mute toggle in the header. Soft deal ticks, chip clicks, win / blackjack chimes, lose thud, bust growl — all synthesized with Web Audio (no external files).

## Files

- `index.html` — layout & copy  
- `styles.css` — ochre/umber saloon table, green felt, parchment feel, Eldorite glow  
- `game.js` — buy-in, deck, hit/stand/double, payouts, audio  

Campaign tone only — not a real casino.
