# SSDNS map spell FX — Chunk 5 v1 (DRAFT, 2026-10-29)

**Status:** Jessey asked "next chunk?" after the Chunk 4 lock + transparent idle overlays, and said to use best judgment on animated idle vs sticky vs one-shot (2026-10-29 ~9:36 PM CT). Coder brief `beam-map-fx-chunk5-brief.md`. Draft concepts. **Each number is already paired to the spell(s) named here**, so Jessey only confirms the look or asks for a redo (e.g. "1 ok, 6 redo"). **Coder wires them later** in `map/ssdns-map-fx.js`; the Effects toggle, fog / hidden-caster rules, timing, turn counters and sync stay with Coder. Locked damage-type looks, named overrides, AOE v1 (incl. frost cone), Chunks 1–4 and the create-tokens are unchanged. **No video this pass.**

- Review sheet: `specs/spell-fx/beam-map-fx-chunk5-review-v1.png` (10 tiles, number badges, damage-type chips, motion/impact captions, gold **STICKY MARK · DM Clear** on 4, 5, 6; **SHOT** / **HELD CUE** / teal **IDLE?** kind badges; skin labels on 1, 2, 5, 8, 10). Preview: `beam-chunk5-v1/beam-map-fx-chunk5-review-v1_preview.jpg`.
- Source tiles: `beam-chunk5-v1/tiles/01-conjure-barrage-volley.jpg` … `10-vicious-mockery-dissonant-whispers.jpg`. Alternates / rejects: `beam-chunk5-v1/alts/` (`03a` Hail of Thorns with a stray stone ring + red token rims, `10a` Mockery/Whispers blended into one scene — grittier but the two skins don't read apart; `10b-before-notes` Mockery without music notes, pre-Jessey note request).
- Rebuild: `cd specs/spell-fx/beam-chunk5-v1/build && python3 sheet_beam5.py` (GenerateImage tiles + PIL labels, same layout as Chunks 1–4).

## Kind per slot (Art Bot's call, per Jessey "use your best judgment")
| slot | kind | why |
|---|---|---|
| 1 Conjure Barrage / Volley | **SHOT** | ~280 ms fan or staggered rain, then gone |
| 2 Lightning Arrow | **HELD CUE** → **SHOT** | small charge shimmer on the weapon until the next ranged hit (held-FX like Flame Blade), then a one-shot bolt + splash |
| 3 Hail of Thorns | **SHOT** | burst on the hit only |
| 4 Ensnaring Strike | **STICKY MARK** + **IDLE?** | vine wrap stays while restrained; good candidate for a slow vine-creak / tighten idle loop |
| 5 Contagion | **STICKY MARK** + **IDLE?** (light) | brand ring stays while Contagion runs; a slow fever pulse loop would be cheap and readable |
| 6 Phantasmal Killer | **STICKY MARK** + **IDLE?** (best candidate) | low-alpha specter that drifts / breathes over the token; magenta pulse on each tick |
| 7 Harm | **SHOT** | collapse only |
| 8 Destructive Wave | **SHOT** | ~300 ms ring |
| 9 Cone of Cold | **SHOT** | cone + rime fades (rime may linger ~600 ms, no sticky) |
| 10 Vicious Mockery / Dissonant Whispers | **SHOT** | <300 ms; Mockery's slash-crack cue is brief, not a sticky |

**IDLE? = later transparent overlays, like the Chunk 4 Cloud of Daggers / Insect Plague alpha WebMs** (no map ground baked in, low alpha so portraits read). Not cut this pass. Suggested order if Jessey wants them: 6 Phantasmal specter → 4 Ensnaring vines → 5 Contagion pulse. Sticky marks could carry Coder's turn counter ("3 turns left") on the mark.

## Palette tie-in (reuses the locked looks)
| locked key / look | slots | how it's reused |
|---|---|---|
| new: steel/lead ammo (piercing) | 1 | gunmetal 90,95,105 shafts, silver glint 220,225,235, spark hits 255,190,110, faint `force` teal 95,220,205 ghost trail |
| `lightning` (jag) | 2 | glow 85,120,240 · core 232,236,255 · hot 255,255,255; charge shimmer = same glow at low alpha on the weapon |
| briar (Thorn Whip / Chunk 4 Thorns) | 3, 4 | briar 70,62,38 / 90,95,45 · sage 110,120,70 · thorn tip 150,110,70 · dust 120,95,70; green prick flare |
| `poison` (miasma) | 5 | glow 150,140,70 · core 195,185,110 · dark 40,42,18; brand ring adds pox dots 200,170,70 |
| psychic (dusty magenta, Staggering Smite) | 6, 10 | 215,125,170 core, pale violet wisp 190,170,225 for Whispers; specter body normal-blend grey 70,68,72 @ ~0.35 |
| `necrotic` (grave smoke) | 5 chip, 7, 8 sheath | plum glow 95,45,100 · black 6,3,8 · bone 185,170,180 |
| `thunder` (dust boom) | 8 | glow 200,170,110 · core 235,215,170 · dust 95,80,60; radiant alt sheath 230,175,70 |
| `cold` (frost shard) / AOE frost cone | 9 | glow 80,125,185 · core 200,225,250 · mist 150,185,225; heavier blown snow + full rime crust |

Rules carried over: additive glows + normal-blend dark layer (smoke, vines, specter body, scorch).

## The 10 slots

### 1. Conjure Barrage / Conjure Volley — spectral ammo (**SHOT**)
- **Vibe:** You empty a magazine of spectral lead into a cone or a patch of ground.
- **Motion:** **Barrage (left):** short cone of iron-tip spectral arrows fans from the caster (~280 ms). **Volley (right):** arrows rain steeply onto a round aim patch, staggered impacts.
- **Impact:** Dust puffs + orange spark hits on creatures in the shape. Gunmetal ammo with a faint Eldorite-teal ghost trail; no glitter.

### 2. Lightning Arrow — charged shot (**HELD CUE → SHOT**)
- **Vibe:** The next arrow you loose is a lightning rod.
- **Motion:** On cast: blue-white charge shimmer crackles on the held bow / rifle. On the hit: jagged lightning bolt leaps weapon → target.
- **Impact:** White-blue flash on the primary, short arc forks jump to nearby creatures. Not Lightning Bolt (line) or Call Lightning (sky drop).

### 3. Hail of Thorns — briar grenade (**SHOT**)
- **Vibe:** The shot blooms into a briar grenade.
- **Motion:** No cast missile: the ranged shot lands, then a thorn-burst sphere blooms on the target (~300 ms).
- **Impact:** Thorn spikes + dust radiate; green-tinged prick flares on creatures next to the target. Thorn Whip briar family. (Tile reads browner than Thorn Whip — Coder can push sage green on the spikes.)

### 4. Ensnaring Strike — vine pin (**STICKY MARK · IDLE?**)
- **Vibe:** The hit sprouts vines that pin them.
- **Motion:** On the weapon hit: vines burst from the target square, crack the dirt and wrap the token rim.
- **Impact:** Restrained vine wrap stays while the spell lasts (low alpha so the portrait reads); DM Clear removes it. Pin, not pull. IDLE?: slow vine creak / tighten loop.

### 5. Contagion — fever brand (**STICKY MARK · IDLE?**)
- **Vibe:** A sickly clamp that leaves a fever brand.
- **Motion:** Touch: ghostly olive-yellow miasma hand clamps the adjacent target (left half of tile).
- **Impact:** Sickly pox-sigil brand ring + fever flush on the token (right half), sticky while Contagion runs; DM Clear. Not a goo flood. IDLE?: slow brand pulse.

### 6. Phantasmal Killer — fear specter (**STICKY MARK · IDLE?**)
- **Vibe:** Their private nightmare stands on their shoulder.
- **Motion:** Cast: thin dusty-magenta psychic wisp caster → target. Then a low-alpha gaunt undertaker specter (long coat, wide hat, hollow eyes) looms over the token.
- **Impact:** Magenta pulse ring on the token each tick; specter stays until the save clears / spell ends; DM Clear. Grim ghost, not a jump-scare. In-engine the specter should be smaller and lower alpha than the tile (about 1.5 squares). Best IDLE? candidate (slow drift / breathe).

### 7. Harm — necrotic collapse (**SHOT**)
- **Vibe:** A curse that empties the body without killing the soul.
- **Motion:** Thick plum-black grave-smoke pulse caster → target, heavier than Inflict Wounds; not Finger of Death's ray.
- **Impact:** Inward collapse + ashen bone-grey flash; token drains grey for a beat (sickly afterimage). HP floor / max-HP rules are Coder.

### 8. Destructive Wave — prairie stomp (**SHOT**)
- **Vibe:** You stomp and the prairie rings.
- **Motion:** No missile: caster stomps, a radial dust shockwave ring expands across the radius (~300 ms) with a plum necrotic sheath riding its edge.
- **Impact:** Cracked-earth dust flares + knock-askew on every creature in the ring. Second skin: gold radiant sheath (same ring, `radiant` colours). Not Thunderwave (cube) or Circle of Death (aim-centred).

### 9. Cone of Cold — blizzard cone (**SHOT**)
- **Vibe:** A blizzard shoved out of your hands.
- **Motion:** Wide frost cone from the caster: blowing snow + ice shards — refines the AOE v1 frost cone (same shape, heavier weather).
- **Impact:** Rime crust coats the whole cone; white-blue cold hit flares on creatures inside. Not Freezing Sphere (lobbed) or Ray of Frost (thin ray).

### 10. Vicious Mockery / Dissonant Whispers — psychic verbal (**SHOT**, two skins)
- **Vibe:** A cutting word, or a whisper that makes them run.
- **Motion:** **Mockery (top):** sharp jagged magenta shout lines cut caster → target, garnished with tumbling weathered parchment/gunmetal music notes (eighths, beamed pairs, a small clef) with a faint magenta rim — no neon, no balloons. **Whispers (bottom):** thin pale-violet whisper wisps drift to the target.
- **Impact:** Magenta psychic flash on the target. Mockery = brief slash crack on the rim (disadvantage cue). Whispers = dust skid shoving it away from the caster (flee nudge). No speech balloons, no letters (music-note glyphs on Mockery only).

## One-liners
1. Conjure Barrage / Volley: cone of spectral iron arrows, or steep arrow rain on a patch.
2. Lightning Arrow: charge on the weapon, then a lightning bolt + arc splash on the hit.
3. Hail of Thorns: briar-thorn grenade bloom on the ranged hit.
4. Ensnaring Strike: vines burst up and wrap the token — sticky restrained mark (IDLE?).
5. Contagion: olive miasma hand clamp → sticky pox-sigil brand (IDLE? pulse).
6. Phantasmal Killer: magenta wisp → sticky low-alpha undertaker specter (IDLE? best candidate).
7. Harm: thick plum-black smoke pulse that collapses inward, token drains grey.
8. Destructive Wave: caster-centred dust shockwave ring with a necrotic (or radiant) sheath.
9. Cone of Cold: heavier blizzard version of the AOE frost cone with full rime crust.
10. Vicious Mockery / Dissonant Whispers: jagged magenta shout lines garnished with tumbling gritty parchment/gunmetal music notes, or pale whisper wisps + flee skid.

## Open for Jessey
- Confirm or redo each slot.
- Kind calls OK? (SHOT on 1–3, 7–10; held cue on 2; STICKY on 4–6.) Want IDLE? overlays cut for 6 / 4 / 5 next (transparent, like Chunk 4)?
- Slot 6: specter this big, or keep it shoulder-sized / fainter?
- Slot 8: necrotic sheath as default with radiant as the alt, or the other way round?
- Slot 10: neon-ish zig-zag shout OK, or the grittier blended alt `10a`?

**Catalog leftovers:** Mass Cure Wounds / Mass Healing Word lean named heal multi later (not a new map missile).
