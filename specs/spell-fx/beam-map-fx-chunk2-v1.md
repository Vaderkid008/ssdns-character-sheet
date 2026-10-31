# SSDNS beam / rider map spell FX — Chunk 2 v1 (DRAFT, 2026-10-29)

**Status:** Jessey asked for Chunk 2 (via Coder brief `beam-map-fx-chunk2-brief.md`). Draft concepts. **Each number is already paired to the spell named here**, so Jessey only confirms the look or asks for a redo (e.g. "1 ok, 3 redo"). **Coder wires them later** in `map/ssdns-map-fx.js`; the Effects toggle, fog / hidden-caster rules, timing and sync stay with Coder. Locked damage-type looks, named overrides, AOE v1, Chunk 1 and the Spiritual Weapon token are unchanged.

- Review sheet: `specs/spell-fx/beam-map-fx-chunk2-review-v1.png` (10 tiles, number badges, damage-type chips, motion/impact captions, gold soft-lock flags on 5 and 6). Preview: `beam-chunk2-v1/beam-map-fx-chunk2-review-v1_preview.jpg`.
- Source tiles: `beam-chunk2-v1/tiles/01-hex-hunters-mark.jpg` … `10-ray-of-enfeeblement.jpg`. Alternates / rejects: `beam-chunk2-v1/alts/` (incl. `05a-flame-blade-float.jpg`, the floating-saber option).
- Rebuild: `cd specs/spell-fx/beam-chunk2-v1/build && python3 sheet_beam2.py` (GenerateImage tiles + PIL labels, same layout as Chunk 1).

## Token questions for Jessey (soft-lock)
| slot | recommendation | why |
|---|---|---|
| **5. Flame Blade** | **Caster-attached FX, NOT a create-token** (fallback: floating saber, alt `05a`) | RAW the blade is *in your hand*: it never leaves the caster, has no own square or BA move. A token would be a second object to drag around for no rules reason. Paint it as a held saber glow that follows the caster's token + slash arc on each melee spell attack. |
| **6. Flaming Sphere** | **Create-token (same pattern as Spiritual Weapon)** | It occupies a 5-ft square, is rammed around with a BA (30 ft), and damages whoever ends their turn within 5 ft — the table needs a real piece for position/adjacency. Token art = iron-banded powder-keg fire orb (tile 6); roll trail + scorch is optional garnish FX. Not in initiative, no HP (unless house-ruled). |

## Palette tie-in (reuses the locked looks)
| locked key / look | slots | how it's reused |
|---|---|---|
| `necrotic` (grave smoke) | 1 (Hex), 9, 10 | plum glow 95,45,100 · black under 6,3,8 · bone core 185,170,180; 10 is a thin desaturated ash-plum variant |
| `radiant` (mote) | 1 (Hunter's Mark) | glow 230,175,70 · core 255,232,170 · hot 255,250,230 — amber brand-star |
| `lightning` (jag) | 2 | glow 85,120,240 · core 232,236,255; shortened to a touch-range spark + cage ring |
| `fire` (Fire Bolt ball/burst) | 4, 5, 6, 7, 8 warm | glow 200,60,15 · core 255,125,35 · hot 255,225,160; 7 adds a forge orange-white + shimmer distortion |
| `cold` (frost shard) | 8 chill | locked cold shard/rime values; ice-shard snap-back |
| new: thorn (piercing) | 3 | suggested briar green-brown 90,95,45 / thorn tip 150,110,70 + dust 120,95,70 (named override `thorn-whip`) |
| new: siphon | 9 | suggested crimson 225,70,80 ribbon + rose heal pulse 255,150,160 (named override `vampiric-touch`) |

Rules carried over: additive glows + normal-blend dark layer (smoke, ash, scorch). Persistent riders (1 brand, 7 glow, 8 aura, 10 weakness mark) need a **low-alpha idle loop** so token portraits stay readable.

## The 10 slots

### 1. Hex / Hunter's Mark — `necrotic` / `radiant`
- **Vibe:** A curse brand or a bounty brand that sticks to the quarry.
- **Motion:** No missile — a short thin pulse caster → target (~120 ms).
- **Impact:** Persistent low-alpha mark ring on the target token. **Hex:** plum hex-sigil ring with curse glyphs and black smoke wisps. **Hunter's Mark:** amber branding-iron star at token center with a faint glyph ring and sparks. Re-flare on each extra-damage hit; pops off when concentration/rider ends. On move-the-mark, a quick pulse jumps to the new quarry.

### 2. Shocking Grasp — `lightning` (touch)
- **Vibe:** Sparks jump the last foot into somebody's iron.
- **Motion:** Touch only: a short jag spark from the caster's palm across into the adjacent square (~70 ms). No ranged beam.
- **Impact:** White flash on the target + a crackling blue spark cage around the token ring (the "no reactions" cue, fades at start of target's next turn). Brighter blue-white flare vs metal armor (advantage) if easy.

### 3. Thorn Whip — piercing vine
- **Vibe:** A briar lariat that drags a man in.
- **Motion:** A twisted thorny vine shoots caster → target, coils, then **yanks** the target up to 10 ft toward the caster (token slides with dust drag streaks; brief ghost afterimage at the start square).
- **Impact:** Thorn-prick splinter + red-brown dust burst on hit; vine snaps back into the hand. Earthy green-brown grit, no cute leaves.

### 4. Hellish Rebuke — `fire` (reaction)
- **Vibe:** You hit the preacher, the preacher's hellfire hits back.
- **Motion:** Instant (~200 ms). No missile: only a tiny ember flick off the hurt caster's rim, then fire blooms directly on the attacker.
- **Impact:** Fire Bolt-family burst engulfing the attacker token, embers, and a black scorched ring on the ground under them that fades over ~1 s.

### 5. Flame Blade — `fire` (**soft-lock: held FX vs token**)
- **Vibe:** A burning cavalry saber in the preacher's off-hand.
- **Motion:** On cast, a fire saber ignites from the caster's token rim (held, follows the caster, gentle ember idle). Each melee spell attack: a quick swing.
- **Impact:** Crescent fire slash arc across the target + embers + small scorch. **Recommendation: caster-attached FX, not a create-token** (see table). Floating-saber alt kept as `alts/05a-flame-blade-float.jpg`.

### 6. Flaming Sphere — `fire` (**soft-lock: create-token**)
- **Vibe:** A rolling powder keg of fire you shove around.
- **Motion:** Token appears in an empty square: iron-banded keg-hoop orb with roiling fire inside. On BA move it rolls with an ember trail and leaves a short scorch path.
- **Impact:** Small fire lick on a creature it rams (save) and on anyone who ends a turn within 5 ft. **Recommendation: create-token like Spiritual Weapon**; roll/scorch FX is garnish.

### 7. Heat Metal — `fire` on gear
- **Vibe:** Their iron goes forge-hot.
- **Motion:** No projectile — dotted ember glance caster → target, then a furnace glow blooms on the target's metal (weapon/armor cue at token).
- **Impact:** Orange-white forge glow + rising heat-shimmer ripples and a thin smoke curl while the spell lasts; bright pulse on each BA damage tick. No full-body fireball.

### 8. Fire Shield — `fire` (warm) / `cold` (chill)
- **Vibe:** A coat of flame or rime that bites back.
- **Motion:** Self aura shell on the caster — warm: licking flame ring; chill: frosted rime ring with crystals. Low-alpha idle loop.
- **Impact:** When a melee attacker within 5 ft hits the caster: a small fire burst (warm) or ice-shard snap (chill) on the attacker.

### 9. Vampiric Touch — `necrotic` + siphon
- **Vibe:** Grave smoke drinks a life and feeds it home.
- **Motion:** Chunk 1 necrotic bone hand clamps the adjacent target; plum grave smoke wraps it.
- **Impact:** Inward collapse + ash flakes on the target; a crimson siphon ribbon arcs back to the caster carrying red droplets and lands as a soft rose heal pulse on the caster's rim. (Tile ribbon loop is exaggerated for readability; live version should be a tighter arc.) Recast each turn = repeat clamp + siphon.

### 10. Ray of Enfeeblement — `necrotic`
- **Vibe:** A drain that leaves them soft-armed.
- **Motion:** Thin, straight ash-plum ray (no tendrils — distinct from Chill Touch) with grey motes drifting back toward the caster.
- **Impact:** Target portrait greys out (desaturation tint) + a small cracked-strength mark hovers over the token while the spell lasts; clears when they make the save.

## One-liners
1. Hex / Hunter's Mark: short pulse, then a sticky brand on the quarry — plum hex-sigil or amber brand-star.
2. Shocking Grasp: touch-range spark jag into the adjacent square, white flash + spark cage.
3. Thorn Whip: briar lariat coils the target and yanks it closer with dust-drag streaks.
4. Hellish Rebuke: no missile — hellfire blooms right on the attacker with a scorched ring.
5. Flame Blade: fire saber held by the caster, crescent fire slash on hits (lean held FX, not token).
6. Flaming Sphere: iron-banded fire-orb create-token that rolls with an ember trail and scorch.
7. Heat Metal: forge glow and heat shimmer on the target's metal, pulse each tick.
8. Fire Shield: low-alpha flame or rime aura that snaps fire/ice back at melee attackers.
9. Vampiric Touch: bone-hand clamp plus a crimson siphon ribbon healing the caster.
10. Ray of Enfeeblement: thin ash-plum ray, target greys out under a cracked-strength mark.

## Open for Jessey
- Confirm or redo each slot.
- **Slot 5:** held FX (recommended) vs floating saber vs create-token.
- **Slot 6:** soft-lock create-token (recommended); keep keg-hoop orb art or plain fire ball?
- Slot 1: OK as one shared slot with two colour variants?
- Slots 3 and 9: approve new named-override colours (thorn green-brown, siphon crimson).
