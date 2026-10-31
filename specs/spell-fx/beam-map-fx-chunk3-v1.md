# SSDNS beam / rider map spell FX — Chunk 3 v1 (DRAFT, 2026-10-29)

**Status:** Jessey asked "Chunk 3?" after the Chunk 2 soft-lock; Coder brief `beam-map-fx-chunk3-brief.md`. Draft concepts. **Each number is already paired to the spell named here**, so Jessey only confirms the look or asks for a redo (e.g. "1 ok, 4 redo"). **Coder wires them later** in `map/ssdns-map-fx.js`; the Effects toggle, fog / hidden-caster rules, timing and sync stay with Coder. Locked damage-type looks, named overrides, AOE v1, Chunks 1–2 and the Spiritual Weapon / Flaming Sphere tokens are unchanged.

- Review sheet: `specs/spell-fx/beam-map-fx-chunk3-review-v1.png` (10 tiles, number badges, damage-type chips, motion/impact captions, gold TOKEN soft-lock flag on 6). Preview: `beam-chunk3-v1/beam-map-fx-chunk3-review-v1_preview.jpg`.
- Source tiles: `beam-chunk3-v1/tiles/01-call-lightning.jpg` … `10-smite-family.jpg`. Alternates / rejects: `beam-chunk3-v1/alts/` (`04a` saturated rainbow spray, `05a` only three meteors, `05b` four-panel meteor sequence).
- Rebuild: `cd specs/spell-fx/beam-chunk3-v1/build && python3 sheet_beam3.py` (GenerateImage tiles + PIL labels, same layout as Chunks 1–2).

## Token question for Jessey (soft-lock)
| slot | recommendation | why |
|---|---|---|
| **6. Guardian of Faith** | **Create-token (same pattern as Spiritual Weapon / Flaming Sphere)** — LEAN YES | It occupies a fixed space (Large, 2×2 squares) for 8 hours, doesn't move with the caster, and hurts foes that enter / start within 10 ft. The table needs a real piece for position + aura adjacency. Token art = spectral gold-white tin-star lawman (duster, hat, glowing halberd) on a gold rim, 2×2 footprint. Aura ring + radiant swipe = garnish FX. Not in initiative, no HP bar (RAW it has a 60-damage budget; track as a counter/note if Jessey wants), DM Clear removes it. Standalone 280×280 transparent token PNG can be painted on request (same flow as the Spiritual Weapon / Flaming Sphere tokens). |

No other Chunk 3 slot wants a token: 8 Produce Flame is **held FX** on the caster (like Flame Blade).

## Palette tie-in (reuses the locked looks)
| locked key / look | slots | how it's reused |
|---|---|---|
| `lightning` (jag) | 1, 7 lightning skin | glow 85,120,240 · core 232,236,255 · hot 255,255,255; 1 adds a storm-cloud cue (grey 70,72,80 + inner blue flicker) |
| `radiant` (mote/shaft) | 2, 6, 10 Branding | glow 230,175,70 · core 255,232,170 · hot 255,250,230; 2 is a flat lane shaft, 6 the guardian + swipe |
| `necrotic` (grave smoke) | 3, 10 Wrathful | plum glow 95,45,100 · black under 6,3,8 · bone core 185,170,180; 3 raise cue grey-green 140,160,130 at low alpha |
| `fire` (Fire Bolt ball/burst) | 5, 7, 8, 10 Searing | glow 200,60,15 · core 255,125,35 · hot 255,225,160; 5 = Fireball-family bloom ×4 |
| `cold` (frost shard) | 7, 9 Frost | glow 80,125,185 · core 200,225,250 · mist 150,185,225; 9 thinned to a needle + rime crust |
| `poison` (miasma) | 7, 9 Sickness | glow 150,140,70 · core 195,185,110; 9 thin olive ray + token tint |
| `acid`, `thunder` | 7 skins, 10 Thunderous | locked cores (acid 125,180,40 · thunder dust 95,80,60 / 235,215,170) |
| `force` / `psychic` | 10 Banishing / Staggering | teal 95,220,205 wink; dusty magenta 215,125,170 stun ring |
| new: prismatic | 4 | weathered 7-stop ramp: oxblood 140,40,35 · rust 190,95,40 · mustard 195,160,70 · sage 120,135,80 · steel 90,115,150 · indigo 60,60,110 · plum 110,60,100 + glass grit 230,225,210 (named override `prismatic-spray`) |
| blind-white | 2, 10 Blinding | 255,250,235 starburst |

Rules carried over: additive glows + normal-blend dark layer (smoke, ash, scorch). Persistent riders (6 aura, 9 rime/tint, 10 Branding mark) need a **low-alpha idle loop** so token portraits stay readable, and are DM-removable with the chip (same as Chunk 2 sticky marks).

## The 10 slots

### 1. Call Lightning — `lightning` (sky strike)
- **Vibe:** You call the prairie storm down onto a mark.
- **Motion:** No hand line. A dark storm-cloud swirl forms over the aimed square (inner blue-violet flicker); a thick jagged bolt drops straight down onto the point (~80 ms). Caster just points. Re-strikes on later rounds reuse the same drop under a lingering low-alpha cloud.
- **Impact:** White flash ring + branching black scorch on the ground. Distinct from Lightning Bolt (line from hand) and Chain Lightning (hops).

### 2. Sunbeam — `radiant` (line shaft)
- **Vibe:** A church-window shaft laid flat down a lane.
- **Motion:** Narrow, hot gold-white beam fires caster → end of range (60 ft line); re-fires each Action while concentrating. Idle: faint shaft-tip glow at the caster.
- **Impact:** Blind-flash starburst on each creature in the line; gold afterimage + dust motes on the lane for ~400 ms.

### 3. Finger of Death — `necrotic` (kill ray)
- **Vibe:** A pointing curse that empties a man.
- **Motion:** Thick plum-black ray with a bone-grey core, caster → target, near-instant. Heavier than Chill Touch, no bone hand.
- **Impact:** Inward collapse + ash spray. **On kill:** optional grey-green zombie-rise silhouette flash over the token (FX only; table rules stay Coder). Non-lethal = collapse only.

### 4. Prismatic Spray — prismatic fan
- **Vibe:** Saloon stained glass blown out of the fingertips.
- **Motion:** Short fan (~280 ms) of seven weathered colour streaks (oxblood → plum) with glass grit and kicked dust, from the caster's hand. A spray, not a beam.
- **Impact:** Each creature in the fan gets a random-colour flare (fire / acid / lightning / poison / cold / restrain-glitter / blind-white). Sun-bleached tintype colours, not a cartoon rainbow (bright version kept as alt `04a`).

### 5. Meteor Swarm — `fire` (sky meteors)
- **Vibe:** The sky falling in four powder kegs.
- **Motion:** Four burning rocks streak in from off-map (top edge) onto four aim points, staggered ~120 ms, each with a fire + black-smoke trail.
- **Impact:** Four Fireball-scale blooms + overlapping scorch craters. Distinct from Fireball (AOE slot 2) by count and sky origin.

### 6. Guardian of Faith — `radiant` (**soft-lock: create-token, lean yes**)
- **Vibe:** A giant tin-star ghost standing watch.
- **Motion:** On cast, a Large (2×2) token appears in an empty square: spectral gold-white lawman in a duster with a glowing halberd, gentle hover/shimmer idle. Does not follow the caster.
- **Impact:** Faint gold dashed 10-ft aura ring (low alpha). Foe enters / ends turn in it → radiant crescent swipe + gold sparks on that foe. Aura + swipe are garnish on the token. Vanishes with a gold dust pop when its damage budget is spent or the DM clears it.

### 7. Chromatic Orb — typed orb (six types)
- **Vibe:** A chosen-element marble you lob.
- **Motion:** Dense orb with short trail caster → target; colour matches the chosen type. Sheet shows fire / cold / acid; also lightning, poison, thunder from locked cores.
- **Impact:** Matching-type burst (fire flare, frost-shard spray, acid splash, jag flash, miasma puff, dust boom).

### 8. Produce Flame — `fire` (held mote + throw)
- **Vibe:** A campfire coal in the palm you can pitch.
- **Motion:** On cast, a small coal flame idles in the caster's hand (held FX, follows the caster, warm light pool). On throw: short Fire Bolt-family arc with a thin ember trail.
- **Impact:** Small fire burst + embers on hit. Dismiss / extinguish = mote pops. **Not a token.**

### 9. Ray of Frost / Ray of Sickness — `cold` / `poison`
- **Vibe:** A freezing needle, or a fever needle.
- **Motion:** Thin needle ray caster → target. Frost: icy blue-white with white core + a few frost cracks. Sickness: murky olive ray.
- **Impact:** Frost: rime crust on the token rim + slow chip until the caster's next turn. Sickness: short olive tint + miasma wisps (poisoned rider). Shared slot, two colour variants.

### 10. Smite family — on-hit rider strip
- **Vibe:** The swing lands, then the Lord's (or devil's) add-on blooms.
- **Motion:** No missile. On the hit that spends the smite: quick weapon-edge flash on the attacker, then a bloom on the target.
- **Variants (strip, left → right):** Searing (fire burst), **Branding (gold brand sigil, sticky until the spell ends — like Guiding Bolt)**, Thunderous (dust boom ring + push), Wrathful (purple fear wisps), Blinding (white starburst), Banishing (teal portal wink), Staggering (magenta stun ring). Each <300 ms except Branding.

## One-liners
1. Call Lightning: storm-cloud over the mark, bolt drops from above with scorch.
2. Sunbeam: narrow gold-white shaft down a lane, blind flashes on everyone in it.
3. Finger of Death: thick plum-black ray, collapse + ash, optional zombie-rise cue on kill.
4. Prismatic Spray: weathered seven-colour grit fan with random-colour flares.
5. Meteor Swarm: four sky meteors, Fireball-scale blooms and craters.
6. Guardian of Faith: Large tin-star ghost create-token with gold aura swipe (soft-lock).
7. Chromatic Orb: dense typed orb; six colour skins (fire/cold/acid shown).
8. Produce Flame: coal flame held in the palm, pitched as a small fire throw.
9. Ray of Frost / Sickness: thin icy or olive needle ray with rime or sick-tint rider.
10. Smites: weapon flash + per-smite bloom; Branding leaves a sticky gold brand.

## Open for Jessey
- Confirm or redo each slot.
- **Slot 6:** soft-lock create-token (recommended). Want a standalone token PNG painted next?
- Slot 4: approve the new `prismatic-spray` weathered colour ramp.
- Slot 3: keep the optional zombie-rise cue on kill, or collapse only?
