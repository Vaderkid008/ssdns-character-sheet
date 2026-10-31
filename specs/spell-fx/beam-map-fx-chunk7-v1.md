**Soft-lock:** Jessey locked these looks on 2026-10-29, including Hypnotic Pattern v2 (`09-hypnotic-pattern.jpg`, weird organic pattern, no cube). Any DRAFT banner in this file is stale.

# SSDNS map spell FX — Chunk 7 v1 (DRAFT, BOOK-SIDE, 2026-10-29)

**Status:** Chunk 7 — **book-side (not in 85 yet)**. Coder brief `beam-map-fx-chunk7-brief.md`. These spells are on Calling lists in MASTER-SPELL-NAMES but **not in the live 85 cast-catalog**: **soft-lock paint only**, players cannot Cast them until Jessey expands the catalog; Coder wires on Press after catalog admit. Draft concepts, **not locked**. Each number is pre-paired to its spell, so Jessey only confirms the look or asks for a redo (e.g. "1 ok, 6 redo"). Locked looks, AOE v1, Chunks 1–6, named overrides and create-tokens are unchanged. **No video this pass.**

- Review sheet: `specs/spell-fx/beam-map-fx-chunk7-review-v1.png` (10 tiles; title + rust **SOFT-LOCK PAINT ONLY · NOT LIVE CAST** banner; per-tile **BOOK-SIDE** tag; teal **WRAP** / gold **ZONE** / **SHOT** / **HELD SELF** kind badges; type chips; motion/impact captions; skin labels on 1, 5, 9, 10). Preview: `beam-chunk7-v1/beam-map-fx-chunk7-review-v1_preview.jpg`.
- Source tiles: `beam-chunk7-v1/tiles/01-entangle.jpg` … `10-web.jpg`. Alts/rejects: `beam-chunk7-v1/alts/05a-armor-of-agathys-both-iced-rejected.jpg` (attacker also wore the shell, retaliate read muddy).
- Rebuild: `cd specs/spell-fx/beam-chunk7-v1/build && python3 sheet_beam7.py`.

## Kind per slot
| slot | kind | notes |
|---|---|---|
| 1 Entangle | **ZONE** + **WRAP** | briar zone (DM Clear, idle sway); restrained = vine wrap on token rim |
| 2 Faerie Fire | **WRAP** | foxfire outline (low alpha, smoky violet + Eldorite teal) = advantage cue |
| 3 Sleep | **SHOT** | soft dust bloom; brief Z / dim on dropped tokens |
| 4 Bane | **WRAP** | iron band + broken-horseshoe jinx brand; dark mirror of gold Bless |
| 5 Armor of Agathys | **HELD SELF** → **SHOT** | ice shell on caster while temp HP holds; cold-snap burst onto melee attacker |
| 6 Color Spray | **SHOT** | ~200 ms limelight fan; white blind flash |
| 7 Darkness | **ZONE** | opaque black-hat void silhouette, DM Clear; real occlusion = Lighting v2 / Phase 4 |
| 8 Hold Person | **WRAP** | spectral lasso cinch + knot, still sheen; rope-strain shake on saves |
| 9 Misty Step | **SHOT** | dust pop origin → dest, no beam |
| 10 Web | **ZONE** + **WRAP** | barn cobweb zone (DM Clear, fire-burn clear garnish optional); restrained = silk wrap |

**Token wraps** (Jessey likes these): hug the token rim, low alpha so the portrait reads; can carry Coder's turn counter. **Idle-loop candidates** (later transparent overlays, like Chunk 4): 1 briar sway, 2 foxfire flicker, 7 void smoke edge, 10 strand drift.

## Palette
| look | slots | colours |
|---|---|---|
| briar (Thorn Whip / Ensnaring family) | 1 | briar 70,62,38 / 90,95,45 · sage 110,120,70 · thorn tip 150,110,70 · grab flare 170,210,110 |
| foxfire | 2 | smoky violet 150,120,170 @ low alpha · Eldorite teal 95,220,205 edge · ember 230,190,120 |
| chloroform dust | 3 | lavender-grey 190,175,210 · Z grit = parchment 226,212,182 |
| jinx | 4 | oxblood 120,30,30 · tarnished iron 70,72,76 · dull plum glow 150,60,90 |
| `cold` (frost shard) | 5 | glow 80,125,185 · core 200,225,250 · mist 150,185,225 |
| limelight | 6 | faded amber 220,170,90 · dusty rose 200,140,140 · faded teal 110,170,165 · flash 255,250,235 |
| void | 7 | black 6,5,4 · smoky edge umber 45,35,28 (normal blend, no glow) |
| spectral rope | 8 | hemp 150,140,110 · Eldorite teal 95,220,205 glow |
| dust pop | 9 | grey-silver 190,190,185 · teal glints 95,220,205 |
| silk | 10 | dusty off-white 220,215,200 · shadow 120,110,95 |

## The 10 slots
1. **Entangle** — briars + sage scrub erupt across the aim square and sway; restrained creatures get a thorny vine wrap + green grab flares.
2. **Faerie Fire** — short spark scatter; failed-save targets wear a smoky foxfire outline wrap (grit, not cartoon neon).
3. **Sleep** — gentle lavender-grey dust bloom; motes settle on the lowest-HP tokens, which dim with a brief Z.
4. **Bane** — crooked oxblood jinx flicks to each target; iron band + broken-horseshoe brand wrap while concentrating.
5. **Armor of Agathys** — frost-plate shell on the caster (held); a melee hit triggers a cold-snap shard burst onto the attacker.
6. **Color Spray** — faded limelight flashbang fan in powder smoke; white blind flash on caught creatures. (Tile base is a touch rainbow-ish near the hand; Coder can desaturate.)
7. **Darkness** — opaque black-hat void with a smoky felt edge; sticky zone + DM Clear; silhouette only.
8. **Hold Person** — teal-glow spectral lasso cinches the target; coiled rope + knot wrap while held.
9. **Misty Step** — dust puff at origin, matching puff at destination; no beam.
10. **Web** — barn-cobweb sheets fill the cube; restrained = silk wrap on the token rim.
