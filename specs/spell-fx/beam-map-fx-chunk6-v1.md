# SSDNS map spell FX — Chunk 6 v1 (DRAFT, 2026-10-29)

**Status:** Jessey said "next chunk?" after the Chunk 5 lock (2026-10-29 ~9:53 PM CT). Coder brief: `beam-map-fx-chunk6-brief.md`. **This is the last chunk: only 3 cast-catalog spells were left, all heals.** These are draft concepts. Each number is already paired with its spell, so Jessey only has to OK the look or ask for a redo (for example "1 ok, 3 redo"). **Coder wires them later** in `map/ssdns-map-fx.js`. Coder also owns the Effects toggle, fog / hidden-caster rules, timing, target-count, HP math and sync. Not soft-locked; no video this pass.

> **This ends the 85 cast-catalog FX queue.** AOE v1 + Chunks 1–6 + named overrides now cover every spell in the cast catalog. More FX only if Jessey adds spells to the catalog (or asks for optional non-catalog utility polish).

- Review sheet: `specs/spell-fx/beam-map-fx-chunk6-review-v1.png` (3 big tiles in one strip: number badges, **SHOT** kind badges, HEAL/RADIANT chips, motion/impact captions, in-tile labels). Preview: `beam-chunk6-v1/beam-map-fx-chunk6-review-v1_preview.jpg`.
- Source tiles: `beam-chunk6-v1/tiles/01-mass-healing-word.jpg`, `02-mass-cure-wounds.jpg`, `03-heal.jpg`.
- Rebuild: `cd specs/spell-fx/beam-chunk6-v1/build && python3 sheet_beam6.py` (GenerateImage tiles + PIL labels, same family as Chunks 1–5, 3-wide layout).

## Kind per slot
| slot | kind | why |
|---|---|---|
| 1 Mass Healing Word | **SHOT** (multi) | staggered motes, gone in ~600 ms |
| 2 Mass Cure Wounds | **SHOT** (multi, heavier) | washes + bloom, brief afterglow |
| 3 Heal | **SHOT** (single, biggest) | column + bloom + afterglow (~900 ms) |

**Not token wraps.** Jessey's token wraps are for sticky conditions (Chunk 5 marks etc.). Heals are instant, so they get one-shot pulses with no DM Clear and no turn counter.

## Palette tie-in (reuses the locked looks)
| locked key / look | slots | how it's reused |
|---|---|---|
| named-v1 `healing_word` (green-gold pulse + rising warm motes) | 1, 2 | mote core 255,232,170 · green-gold tint 205,220,140 · warm motes rise 300–450 ms |
| `bless` gold ring | 1 | caster pulse ring = Bless foot-ring gold 230,175,70 @ low alpha |
| `radiant` (mote + shaft) | 2, 3 | glow 230,175,70 · core 255,232,170 · hot 255,250,230. Heal uses a scaled-up radiant shaft as the column |
| Eldorite teal | 3 (optional) | condition-clear sparkles 95,220,205 @ ~0.6, small, drift up and fade |

Same rules as before: additive glows. Keep heal alpha low on the token centre so the portrait stays readable. **Scale/count is the difference:** 1 = many small motes, 2 = several warm washes, 3 = one big column.

## The 3 slots

### 1. Mass Healing Word — multi heal motes (**SHOT**)
- **Vibe:** A short prayer that tops up the whole posse at once.
- **Motion:** A soft gold-white pulse ring expands off the caster (~150 ms). Thin gold threads then carry one small heal mote to **each chosen ally** (up to the spell's target count), arriving about 200 ms apart.
- **Impact:** A small green-gold glow plus a few rising warm motes on each tagged token, low alpha. This is the named-v1 Healing Word mote, multiplied; there's no beam. Distinct from single Healing Word (one mote, no ring).

### 2. Mass Cure Wounds — warm multi wash (**SHOT**)
- **Vibe:** Hands of light washing over the wounded.
- **Motion:** Warm amber "hands of light" washes fan from the caster to each chosen ally (short travel, ~300 ms). They're soft flowing bands, not hard beams.
- **Impact:** A stronger warm gold halo blooms over each ally's rim (Cure Wounds family), then a brief afterglow (~400 ms). More touch-wash than word-mote. Coder can thin the hand shapes to plain ribbons if they read too literal at token scale.

### 3. Heal — church-window restore (**SHOT**)
- **Vibe:** One ally gets the whole church window.
- **Motion:** A faint gold thread runs from the caster to **one** ally. Then a brilliant gold-white column drops on them (~150 ms), and a church-window ray pattern (amber pane spokes) pools on the dirt around the token.
- **Impact:** Big white-core flash, expanding halo rings, and a brief afterglow on the token (~600 ms). **Optional garnish:** Eldorite-teal condition-clear sparkles drift up (FX only; the actual condition / disease clear stays in Coder's table logic). It's heavier than Mass Cure through single-target scale. It's not Sacred Flame's attack drop or Sunbeam's line.

## Hand-off notes for Coder
- All three are new named heal overrides: `mass_healing_word`, `mass_cure_wounds`, `heal`. They sit next to named-v1 `healing_word` / `cure_wounds`.
- Multi-target (1, 2): one emitter on the caster, then per-target arrivals with stagger ~120–200 ms.
- No sticky state, no create-token, no token wrap, no turn counter.
- **Queue status:** cast-catalog FX coverage is complete (85/85). Open items elsewhere: create-tokens soft-locked (Spiritual Weapon, Flaming Sphere, Guardian of Faith), optional IDLE? overlays for the Chunk 5 sticky marks, token wraps for sticky conditions, turn counters.
