# Art slots

Named slots for Old West art. Games work with this folder empty (CSS-gradient fallbacks in `games/saloon-theme.css`). Art Bot drops the files here. Webp, sRGB, each ≤ 250 KB. Total per game ≤ 1.5 MB.

Paths are relative to `games/_art/`. CSS urls in `saloon-theme.css` are `_art/…` (that file lives in `games/`).

| Slot | File | Size | Used by | Notes |
|------|------|------|---------|-------|
| Table wood frame | `wood-rail.webp` | 1024×256, tileable H | all | Dark oiled walnut/oak rail, brass tacks. `--art-wood` on `.table` |
| Background wall | `saloon-wall.webp` | 1024×1024 tileable | all | Plank wall or faded damask. `--art-wall` on `body` |
| Felt (blackjack) | `felt-green.webp` | 512×512 tileable | blackjack | Worn green baize. `--art-felt-green` on `.felt` |
| Felt (roulette) | `felt-red.webp` | 512×512 tileable | roulette | Oxblood baize. `--art-felt-red` on `.wheel-stage` |
| Card back | `card-back.webp` | 250×350 | blackjack | Period lithograph back. `--art-card-back` on `.card.back` |
| Card faces | `cards/{A,2..10,J,Q,K}{S,H,D,C}.webp` | 250×350 × 52 | blackjack | Optional. Fall back to current CSS faces. |
| Chips | `chip-{1,5,10,25,50,100}.webp` | 128×128 transparent | all | Reserved for Art Bot. Stake buttons stay text, so there is no chip CSS variable. |
| Roulette wheel | `wheel-0-12.webp` | 768×768 transparent | roulette | 13 pockets matching `drawWheel` order. Optional; the canvas still draws the wheel. |
| Wheel rim | `wheel-rim.webp` | 768×768 transparent | roulette | Overlay on the canvas. `--art-wheel-rim` |
| Slot cabinet | `slot-cabinet.webp` | 720×960 | slots | Cast-iron and oak. `--art-slot-cabinet` on `.machine` |
| Reel symbols | `sym-{id}.webp` | 160×160 transparent | slots | One per symbol id in `buildReelPool`. Optional; crystals stay CSS. |
| Paper / parchment | `parchment.webp` | 512×512 tileable | all | Paytable, under a dark scrim so the type stays readable. `--art-parchment` |
| Brass plate | `brass-plate.webp` | 600×120 | all | Balance plate. `--art-brass` on `.balance-bar` |

With `_art/` empty the games look like the gradient fallbacks and throw no errors. With the art present it renders at 390 px and 1280 px.
