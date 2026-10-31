# SSDNS map spell FX — Chunk 4 v1 (DRAFT, 2026-10-29)

**Status:** Jessey asked "next chunk?" after the Chunk 3 / smite-shot locks; Coder brief `beam-map-fx-chunk4-brief.md`. Draft concepts. **Each number is already paired to the spell(s) named here**, so Jessey only confirms the look or asks for a redo (e.g. "1 ok, 6 redo"). **Coder wires them later** in `map/ssdns-map-fx.js`; the Effects toggle, fog / hidden-caster rules, timing and sync stay with Coder. Locked damage-type looks, named overrides, AOE v1 (incl. Wall of Fire, Cloudkill, Fireball), Chunks 1–3 (incl. Meteor Swarm, Sunbeam) and the create-tokens are unchanged.

- Review sheet: `specs/spell-fx/beam-map-fx-chunk4-review-v1.png` (10 tiles, number badges, damage-type chips, motion/impact captions, gold **STICKY · DM Clear** flags on 1, 2, 4, 5, 6, 10; skin labels on 1, 7, 8, 9, 10). Preview: `beam-chunk4-v1/beam-map-fx-chunk4-review-v1_preview.jpg`.
- Source tiles: `beam-chunk4-v1/tiles/01-walls-ice-thorns-blades.jpg` … `10-delayed-blast-fireball.jpg`. Alternates / rejects: `beam-chunk4-v1/alts/` (`01a` walls with baked-in text labels, `07a` Flame Strike without the gold radiant sheath).
- Rebuild: `cd specs/spell-fx/beam-chunk4-v1/build && python3 sheet_beam4.py` (GenerateImage tiles + PIL labels, same layout as Chunks 1–3).

## Sticky zones / marks (no new create-token)
| slot | kind | idle | removed by |
|---|---|---|---|
| 1 Walls (Ice / Thorns / Blade Barrier) | sticky zone (line) | low-alpha wall surface, still reads as blocking | duration end / DM Clear |
| 2 Hunger of Hadar | sticky zone (sphere) | near-black void, faint rim flecks | concentration end / DM Clear |
| 4 Cloud of Daggers | sticky zone (cube) | slow knife spin | concentration end / DM Clear |
| 5 Insect Plague | sticky zone (sphere) | low-alpha locust swirl | concentration end / DM Clear |
| 6 Incendiary Cloud | sticky zone (sphere) | ember-lit smoke, optional drift | concentration end / DM Clear |
| 10 Delayed Blast Fireball | sticky **mark** (one square) | ticking bead + pulse ring | detonation / DM Clear |

Freezing Sphere (8) optional held bead is mark-scale only, not a token. Idle loops stay low alpha so token portraits read (same rule as Chunk 2–3 sticky marks).

## Palette tie-in (reuses the locked looks)
| locked key / look | slots | how it's reused |
|---|---|---|
| `cold` (frost shard) | 1 Ice, 2 rim flecks, 8 | glow 80,125,185 · core 200,225,250 · mist 150,185,225; 1 = ice sheet + frost crust; 8 = orb + shard-spoke sphere + rime |
| `acid` (glob) | 2 rim flecks | core 125,180,40 / bloom 175,210,55 as sparse flecks only |
| new: void (Hadar) | 2, 3 | normal-blend black 6,3,8 @ ~0.9 body, soft smoky edge; tiny additive cold/acid flecks at rim; no purple swirl. Arms (3) = same void as tendrils |
| `necrotic` (grave smoke) | 3 chip, 9 Circle | plum glow 95,45,100 · black under 6,3,8 · bone core 185,170,180; 9 = expanding plum-black ring, ash collapsing inward |
| `fire` (Fire Bolt ball/burst) | 6, 7, 10 | glow 200,60,15 · core 255,125,35 · hot 255,225,160; 6 adds normal-blend charcoal smoke 40,34,30; 10 detonation = Fireball-family bloom (AOE slot 2) |
| `radiant` (mote/shaft) | 7 Flame Strike sheath, 9 Sunburst | glow 230,175,70 · core 255,232,170 · hot 255,250,230 + blind-white 255,250,235 |
| new: steel (slashing) | 1 Blade Barrier, 4 | gunmetal 90,95,105 blades, silver glint 220,225,235, slash sparks 255,190,110 |
| new: briar / swarm (piercing) | 1 Thorns, 5 | briar 70,62,38 / sage 110,120,70; locust bodies 70,50,30 @ low alpha, bite flare 200,60,40 |

Rules carried over: additive glows + normal-blend dark layer (smoke, void, swarm bodies, scorch).

## The 10 slots

### 1. Wall of Ice / Wall of Thorns / Blade Barrier — lasting walls (**sticky zone**)
- **Vibe:** A barrier you raise that stays on the map until it falls.
- **Motion:** On cast the wall paints along the aimed line (aim-then-cast). Three skins on one tile, top → bottom: **Ice** (translucent blue-white sheet with crystal posts + frost crust), **Thorns** (dense green-brown briar lattice with dust), **Blade Barrier** (row of upright steel blades on spinning hubs, gunmetal glints). Idle = low-alpha surface that still reads as blocking.
- **Impact:** Enter / end turn: cold shard (Ice), green-tinged thorn prick (Thorns), orange slash sparks (Blades). Sticky until duration ends or DM Clear. Straight solid barrier, clearly not the Wall of Fire flame ribbon.

### 2. Hunger of Hadar — void sphere (**sticky zone**)
- **Vibe:** A black prairie hole that drinks light and bites.
- **Motion:** A near-black void sphere blooms on the aim point and stays; soft smoky edge with dark crack-veins bleeding into the dirt.
- **Impact:** Sparse cold-blue and acid-green flecks only around the rim; tick flares on creatures at the edge. Not a purple portal; no swirl. Distinct from Cloudkill (olive gas) and Darkness (no flecks).

### 3. Arms of Hadar — void tentacles (burst)
- **Vibe:** Black tentacles lash out from under your feet.
- **Motion:** Self-centred: 6–8 black void tendrils whip outward from the caster across adjacent squares (~280 ms), then retract.
- **Impact:** Grasp/pinch flare on each hit token + brief black residual wisps. Same void palette as Hunger (tiny cold/acid glints in the tendrils), burst instead of a lasting zone.

### 4. Cloud of Daggers — spinning knife cube (**sticky zone**)
- **Vibe:** A cube of knives hanging in the air.
- **Motion:** A cluster of whirling bowie knives hovers on the aim square with faint motion-blur arcs; faint square outline on the ground marks the cube. Idle slow spin.
- **Impact:** Enter / start turn: steel slash-spark ticks on the token.

### 5. Insect Plague — locust swarm (**sticky zone**)
- **Vibe:** A boiling cloud of prairie locusts.
- **Motion:** A swirling sphere of brown-black locusts forms on the aim point; idle swirl is low alpha with a thinner centre so tokens stay readable.
- **Impact:** Red bite/sting tick flares on creatures inside. Bugs, not gas (Cloudkill) or fire fog (6).

### 6. Incendiary Cloud — furnace fog (**sticky zone**)
- **Vibe:** A rolling bank of furnace smoke that burns.
- **Motion:** A thick charcoal smoke bank fills the area, lit from within by orange-red ember veins; optional slow drift (else static idle).
- **Impact:** Small fire tick flares on tokens inside. Denser and darker than the Wall of Fire ribbon; a lasting cloud, not a Fireball bloom.

### 7. Flame Strike / Fire Storm — sky fire columns
- **Vibe:** Heaven (or hell) drops pillars of flame on the marks.
- **Motion:** **Flame Strike (left):** one thick fire column drops from above onto the aim point, wrapped in a gold radiant sheath with a few gold motes. **Fire Storm (right):** several thinner plain-fire columns rain onto scattered squares, staggered ~100 ms.
- **Impact:** Fire bloom + black scorch ring under each column; Flame Strike adds a gold halo ring. No rocks (Meteor Swarm), no ground sphere (Fireball).

### 8. Freezing Sphere — ice bomb
- **Vibe:** A packed snowball of death you lob, then it detonates cold.
- **Motion:** Dense ice orb streaks caster → aim point on a cold-mist trail (frost shard family), then detonates into a large frost sphere.
- **Impact:** Ice-shard spokes + mist + rime crust on the area (~400 ms). Optional: held orb = small idle ice bead on the square (mark-scale, not a token).

### 9. Sunburst / Circle of Death — huge radial bloom
- **Vibe:** A noon flash that blinds the range, or a grave circle that empties it.
- **Motion:** No missile. **Sunburst (left):** gold-white sun-flare core with long rays and an expanding gold ring. **Circle of Death (right):** plum-black necrotic ring with a bone-grey inner edge and rising grave smoke.
- **Impact:** Sunburst = white blind flash on everyone in it. Circle = inward ash collapse on each creature in the ring. Same scale, two colour skins.

### 10. Delayed Blast Fireball — ticking bead (**sticky mark**)
- **Vibe:** A powder-keg bead you leave ticking.
- **Motion:** A white-hot ember bead sits on the aim square with a pulsing orange ring + countdown shimmer (sticky mark, NOT a creature token; move / DM Clear rules stay with Coder).
- **Impact:** On detonation: full Fireball-family bloom with black smoke edge and scorch on that square (reuses AOE slot 2 look, scaled to the spell).

## One-liners
1. Walls (Ice / Thorns / Blade Barrier): ice sheet, briar lattice or spinning blade row on the aimed line; sticky until Clear.
2. Hunger of Hadar: near-black void sphere with cold/acid rim flecks; sticky.
3. Arms of Hadar: black void tendrils lash out from the caster and retract.
4. Cloud of Daggers: hovering cube of whirling knives; sticky slash ticks.
5. Insect Plague: low-alpha locust swarm sphere; sticky bite ticks.
6. Incendiary Cloud: ember-lit furnace-smoke bank; sticky fire ticks.
7. Flame Strike / Fire Storm: one thick gold-sheathed fire column, or many thin columns raining.
8. Freezing Sphere: lobbed ice orb → frost sphere + rime.
9. Sunburst / Circle of Death: huge gold-white flash or plum-black grave ring.
10. Delayed Blast Fireball: ticking ember bead mark → Fireball bloom.

## Open for Jessey
- Confirm or redo each slot.
- Slot 1: one tile / three skins OK, or want each wall on its own tile?
- Slot 3: tendrils carry tiny cold/acid glints to tie to Hunger — keep, or pure black?
- Slot 6: slow drift on Incendiary Cloud, or static?
- Slot 8: want the optional held ice bead, or just lob → detonate?
- Slot 10: bead ring could show a round counter later (Coder) — want that?

**Still later (Chunk 5):** Conjure Barrage / Volley, Lightning Arrow, Hail of Thorns, Contagion, Phantasmal Killer, Harm.
