**Soft-lock:** Jessey locked these looks on 2026-10-29, including Hypnotic Pattern v2 (`09-hypnotic-pattern.jpg`, weird organic pattern, no cube). Any DRAFT banner in this file is stale.

# SSDNS map spell FX — Chunk 8 v1 (DRAFT, BOOK-SIDE, 2026-10-29)

**Status:** Soft-locked by Jessey 2026-10-29: slots 1–8 and 10. **Slot 9 redone (v2 weird pattern) — pending Jessey's look.** Chunk 8 — **book-side (not in 85 yet)**. Coder brief `beam-map-fx-chunk8-brief.md`. These spells are **not in the live 85 cast-catalog**: **soft-lock paint only**, players cannot Cast them until Jessey expands the catalog; Coder wires on Press after catalog admit. Draft concepts, **not locked**. Each number is pre-paired to its spell, so Jessey only confirms the look or asks for a redo (e.g. "1 ok, 6 redo"). Locked looks, AOE v1, Chunks 1–7, named overrides and create-tokens are unchanged. **No video this pass.**

- Review sheet: `specs/spell-fx/beam-map-fx-chunk8-review-v1.png` (10 tiles; title + rust **SOFT-LOCK PAINT ONLY · NOT LIVE CAST** banner; per-tile **BOOK-SIDE** tag; teal **WRAP** / gold **ZONE** / **SHOT** / **HELD SELF** / **IDLE** kind badges; type chips; motion/impact captions; skin labels). Preview: `beam-chunk8-v1/beam-map-fx-chunk8-review-v1_preview.jpg`.
- Source tiles: `beam-chunk8-v1/tiles/01-spike-growth.jpg` … `10-fly.jpg`.
- Alts/rejects (`beam-chunk8-v1/alts/`): `01a-spike-growth-briar-rejected.jpg` (read as Entangle briars), `05a-counterspell-rope-rejected.jpg` (target looked lassoed = Hold Person), `07-08a-haste-slow-shared-strip-alt.jpg` (Haste/Slow on one split tile, side-on token — kept as the shared-strip option), `08a-slow-dark-horseshoe-rejected.jpg` (dark-red goo + Bane horseshoe leak), `10a-fly-weak-altitude-rejected.jpg` (no readable altitude shadow), `09a-hypnotic-pattern-cube-rejected.jpg` (v1 spiral cube — Jessey: less cube, more weird pattern).
- Rebuild: `cd specs/spell-fx/beam-chunk8-v1/build && python3 sheet_beam8.py`.

## Kind per slot
| slot | kind | notes |
|---|---|---|
| 1 Spike Growth | **ZONE** | cholla bed-of-nails, DM Clear; red pierce tick flares on move-through (no grab — distinct from Entangle) |
| 2 Mirror Image | **HELD SELF** | 1–3 tintype ghost duplicates follow/orbit caster (not create-tokens); pop = dust + silver glint |
| 3 Blur | **HELD SELF** | heat-mirage shell while concentrating; miss = bullet swish through haze |
| 4 Silence | **ZONE** | clear hush dome, rim shimmer only, dust frozen inside; optional mute icon; DM Clear |
| 5 Counterspell | **SHOT** | ~150 ms teal force snap → target's violet rune circle shatters + snuffed-match smoke |
| 6 Fear | **SHOT** → **WRAP** | violet terror cone (Phantasmal/Dissonant family); flee WRAP with streaks pointing away from caster |
| 7 Haste | **WRAP** | brass + Eldorite-teal stopwatch ring; afterimage trail on move; optional extra-action flash |
| 8 Slow | **WRAP** | golden-amber molasses ring + drips/drag smears; opposite of Haste (shared family; split-strip alt in alts/) |
| 9 Hypnotic Pattern | **ZONE** + **WRAP** + **IDLE** | weird irregular organic swirl pattern (wobbling whorls, moire ripples, ragged smoky edges — **no cube/box/prism frame**) around pocket-watch glint; glazed swirl wrap on fails; DM Clear / broken |
| 10 Fly | **HELD SELF** + **SHOT** | lift ring dust puff on cast; offset shrunken shadow = altitude cue; dust swoop trail on dash; no wings |

**Token wraps** hug the token rim, low alpha so the portrait reads; can carry Coder's turn counter. **Idle-loop candidates** (later transparent overlays, like Chunk 4): **9 pattern swirl** (primary), plus 1 spike glint, 2 duplicate drift, 3 haze shimmer, 7 speed trail.

Tile notes for Coder: 9's tile (redo v2) shows the pattern as an irregular organic stain on the floor, not a cube; glazed-wrapped tokens sit inside/at its edge. In-engine, clip the pattern to the 30 ft area as a soft, ragged-edge decal (no hard square frame); the wrap sits on whoever failed inside. 7/8 tiles drawn separately for the 10-slot grid; the split Haste|Slow strip is in alts if you want one shared tile.

## Palette
| look | slots | colours |
|---|---|---|
| cholla pierce | 1 | spine straw-gold 215,190,130 · zone gold edge 255,215,120 · pierce tick 220,40,30 |
| tintype ghost | 2 | silver 200,205,205 @ low alpha · dust pop grey 190,190,185 |
| heat haze | 3 | warm amber refraction 230,180,110 (distortion, low alpha) |
| hush | 4 | glass rim 190,190,180 · faint gold rim 214,160,72 · interior desaturate |
| force snap / fizzle | 5 | snap white 245,250,245 · Eldorite teal 95,220,205 · fizzle violet 170,90,220 · smoke 120,110,100 |
| psychic fear | 6 | violet 150,70,170 · magenta wisp 215,125,170 · dust 170,140,100 |
| brass speed | 7 | brass 220,180,90 · Eldorite teal 95,220,205 · spark 255,220,150 |
| molasses | 8 | amber 225,160,60 · dark amber 150,90,30 |
| mesmer | 9 | dusty rose 210,150,170 · faded gold 214,180,110 · faded teal 110,170,165 · watch glint 240,225,190 |
| wind grit | 10 | dust 200,185,160 · wind grey 190,190,185 · shadow 30,24,18 @ 50% |

## The 10 slots
1. **Spike Growth** — cholla spine-balls carpet the area like a bed of nails; red pierce ticks on move-through; sticky zone.
2. **Mirror Image** — three tintype ghost copies orbit the caster; a hit image pops in dust + silver glint.
3. **Blur** — heat-mirage shell over the gunfighter; misses swish through the haze.
4. **Silence** — near-invisible hush dome; dust hangs still; optional mute icon; sticky zone.
5. **Counterspell** — sharp teal force snap; the target's violet rune circle shatters and snuffs out.
6. **Fear** — violet terror cone with smoke skulls; failed saves get a flee wrap pointing away.
7. **Haste** — brass stopwatch ring wrap with afterimage speed trail.
8. **Slow** — golden molasses ribbon; amber drip ring wrap on affected tokens.
9. **Hypnotic Pattern** — weird irregular mesmer pattern (organic swirls/whorls, no cube) around a pocket-watch glint (idle loop); glazed swirl wraps on fails. *Redo v2 per Jessey — less cube, more weird pattern; awaiting his look.*
10. **Fly** — lift-off dust ring; hovering token with offset shadow and wind-coat swoop trail.
