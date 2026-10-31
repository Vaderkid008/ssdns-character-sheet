**Soft-lock:** Jessey locked these looks on 2026-10-29, including Hypnotic Pattern v2 (`09-hypnotic-pattern.jpg`, weird organic pattern, no cube). Any DRAFT banner in this file is stale.

# SSDNS map spell FX — Chunk 9 v1 (DRAFT, BOOK-SIDE HALF-CHUNK, 2026-10-29)

**Status:** Chunk 9 — **book-side (half) · not in 85 yet**. Coder brief `beam-map-fx-chunk9-brief.md`. 5 slots only. These spells are **not in the live 85 cast-catalog**: **soft-lock paint only**, players cannot Cast them until Jessey expands the catalog; Coder wires on Press after catalog admit. Draft concepts, **not locked**. Each number is pre-paired to its spell, so Jessey only confirms the look or asks for a redo (e.g. "1 ok, 4 redo"). Locked looks, AOE v1, Chunks 1–8, named overrides and create-tokens are unchanged. **No video this pass.**

- Review sheet: `specs/spell-fx/beam-map-fx-chunk9-review-v1.png` (5-tile strip like Chunk 6; title + rust **SOFT-LOCK PAINT ONLY · NOT LIVE CAST** banner; per-tile **BOOK-SIDE** tag; teal **WRAP** / gold **ZONE** / **SHOT** / **IDLE** kind badges; type chips; motion/impact captions; skin labels). Preview: `beam-chunk9-v1/beam-map-fx-chunk9-review-v1_preview.jpg`.
- Source tiles: `beam-chunk9-v1/tiles/01-stinking-cloud.jpg` … `05-polymorph.jpg`. No alts/rejects this pass (all first takes).
- Rebuild: `cd specs/spell-fx/beam-chunk9-v1/build && python3 sheet_beam9.py`.

## Kind per slot
| slot | kind | notes |
|---|---|---|
| 1 Stinking Cloud | **ZONE** (+ opt. **WRAP**) | olive-brown/mustard gut fog, idle drift, DM Clear; optional sickly-olive poisoned wrap + green retch ticks. Not Cloudkill (death fog) / Incendiary (fire fog) |
| 2 Wind Wall | **ZONE** (barrier) | aim-then-cast line; tall dust/grit gale ribbon, gold base edge; projectiles bend + spark + wink out; DM Clear. Not Wall of Fire/Ice/Thorns/Blade |
| 3 Banishment | **SHOT** | teal/void rift swallows target (full swallow; Banishing Smite = on-hit flash only); empty-square teal shimmer while gone; reverse wink on return |
| 4 Black Tentacles | **ZONE** + **WRAP** + **IDLE** | thick oily black tentacles boil from cracked dirt, idle writhe; grappled/restrained = tentacle coil wrap on rim. Thicker/lasting vs Arms of Hadar lash; tentacles not Hunger void fog |
| 5 Polymorph | **SHOT** | green-gold/amber morph bloom; silhouette → beast (coyote shown); hat/boots/gunbelt dust puff; new form = Coder token swap, no lingering FX |

**Token wraps** hug the token rim, low alpha so the portrait reads; can carry Coder's turn counter. **Idle-loop candidates** (later transparent overlays, like Chunk 4): **4 tentacle writhe** (primary), plus 1 fog drift, 2 gale stream.

Tile notes for Coder: 3's tile shows the target mid-swallow (portrait sinking into the rift, not a round token) — in-engine the token art warps/shrinks into the rift, then the square gets the teal shimmer ring (small teal mark left of the rift on the tile). 4's teal rim glow under the coils = WRAP slot for the turn counter.

## Palette
| look | slots | colours |
|---|---|---|
| gut fog | 1 | olive-brown 120,105,60 · mustard 165,150,70 · retch green 140,200,60 · zone gold edge 255,215,120 |
| dust gale | 2 | dust 200,185,160 · grit 150,120,85 · deflect spark 255,190,110 · gold base 214,160,72 |
| void wink | 3 | Eldorite teal 95,220,205 · void black 10,12,18 · star fleck 220,240,240 |
| black tentacles | 4 | obsidian 25,20,28 · purple sheen 90,60,110 · wrap teal 95,220,205 · zone gold 255,215,120 |
| morph bloom | 5 | green-gold 170,200,110 · amber 230,160,70 · dust puff 170,140,100 |

## The 5 slots
1. **Stinking Cloud** — olive-brown gut fog bank; poisoned tokens get a sickly retch wrap; sticky zone.
2. **Wind Wall** — standing dust gale along the aimed line; bullets bend and wink out; sticky barrier.
3. **Banishment** — teal void rift swallows the target; shimmer square while gone; reverse wink on return.
4. **Black Tentacles** — lasting tentacle zone with coil wraps on grappled tokens (idle writhe loop lean).
5. **Polymorph** — morph bloom turns the outlaw into a coyote, clothes left in the dust.
