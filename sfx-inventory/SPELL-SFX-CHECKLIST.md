# Spell SFX Checklist (chunks of 10)

**Chunk 1:** `spell-sfx-checklist-chunk1.html` (seed: `spell-sfx-checklist-chunk1-seed.json`)  
**Chunk 2:** `spell-sfx-checklist-chunk2.html` · **Chunk 3:** `spell-sfx-checklist-chunk3.html` (seed: `spell-sfx-checklist-chunk3-seed.json`) · **Chunk 4:** `spell-sfx-checklist-chunk4.html` (seed: `spell-sfx-checklist-chunk4-seed.json`) · **Chunk 6:** `spell-sfx-checklist-chunk6.html` (seed: `spell-sfx-checklist-chunk6-seed.json`) · **Chunk 7 / Rest:** `spell-sfx-checklist-chunk7.html` (seed: `spell-sfx-checklist-chunk7-seed.json`) · Chunk 5 skipped (folded into Rest)

## Open it
Open `file:///workspace/sfx-inventory/spell-sfx-checklist-chunk1.html` in the browser. Keep it in this folder so the "play current" buttons can find `final/magic/*.mp3`. To use it on your own PC, copy the HTML file together with the `final/magic/` folder.

## Use it
1. **▶ play current** plays what the spell uses today.
2. To swap a sound, drop an audio file on the row (or click **Choose file**), then **▶ play drop** to hear it. **✕ use current** removes your drop.
3. Add notes if you want, then check **Done**.
4. Filters: **All / Gaps** (DEFAULT + GAP rows) / **Not done**. The progress bar shows N/10 (N/35 on the Rest pack).

Notes, Done checks, and dropped filenames are saved in browser localStorage (`ssdns-spell-sfx-chunk1`). Dropped audio clears when you refresh. Drop the file again if you want to hear it.

## Send it to Art Bot
- **Export JSON** or **Export CSV** downloads `ssdns-spell-sfx-chunk1-<time>.json/.csv`. Drop that file in chat. Or:
- **Copy summary** copies a numbered list of the Done picks. Paste it in chat.

The export only has filenames. If you want a dropped sound in the game, send the audio file too.

Export fields: `n, spell, assigned_file` (your drop or the current file), `source` (drop/current), `done, notes, current_cue, current_file, current_status, dropped_file`.

## Where the data comes from
- **Spell order:** `specs/N81-SPELL-GAP-SCORES-2026-10-28.csv`, the 85 catalog spells ordered by level then A–Z. Chunk 1 is rows 1–10, all cantrips.
- **Current sound:** `final/manifest.md` (magic/*) plus the live sheet routing `SSDNSAudio.spellCue()` (heal → electric → lightning-ultimate → ice-storm → lightning → teleport → Pact-Seeker calling → attack = spellshot → spellcast). spellshot = `final/magic/spellcast-alt-01.mp3` (SPELL ATTACK source).
- Badges: ASSIGNED = has its own family sound. DEFAULT = generic spellcast or spellshot fallback, counted as a gap. GAP = plays nothing.

## Chunk 1 locked (2026-10-29 ~11:05 PM CT)

Jessey export: `spell-assignments/chunk1-export.json` (+ `.csv`). 10/10 done.

| Spell | Assigned | Source | Notes |
|---|---|---|---|
| Acid Splash | booming_acid_splash_#2-1793331961394.mp3 | drop | |
| Chill Touch | Leviathan_Blizzard._-1793332769355.mp3 | drop | |
| Eldritch Blast | final/magic/pactshot.mp3 | keep | |
| Fire Bolt | Booming_fire_bolt_sp_#3-1793332098869.mp3 | drop | |
| Poison Spray | booming_poison_spray_#4-1793332166374.mp3 | drop | |
| Produce Flame | Booming,_Thunderous_-1793332313087.mp3 | drop | **may need trim** |
| Ray of Frost | Sci-fi_ice_freeze_ra-1793332884098.mp3 | drop | |
| Sacred Flame | “Holy_fire_spell_imp-1793332463662.mp3 | drop | |
| Shocking Grasp | Sudden,_sharp_electr_#4-1793332495303.mp3 | drop | replaces electric.mp3 |
| Thorn Whip | Generate_an_organic_-1793332521409.mp3 | drop | |

Audio files themselves were browser-local drops — Jessey still has the source files; filenames above are the assignment keys for Coder until we ingest the binaries.

---

## Chunk 2: spells 11–20 (built 2026-10-29 ~11:10 PM CT)

**Files:** `spell-sfx-checklist-chunk2.html` (seed: `spell-sfx-checklist-chunk2-seed.json`), localStorage `ssdns-spell-sfx-chunk2`. Pack: `spell-sfx-checklist-chunk2.tar.gz` → `spell-sfx-c2/` (html + `final/magic/` + empty `drops/`).

**New in Chunk 2: preassigned rows.** Jessey okayed reusing Chunk 1 picks by family. A PREASSIGNED row (teal badge) shows the source spell ("↳ from Fire Bolt"). It isn't counted as a gap. On each one you can:
- **▶ play preassign**: plays the Chunk 1 drop file. Those binaries are on Jessey's PC, not here. To hear them, put them in `drops/` next to the HTML, or click **📂 Load my drop files** and multi-select them (dragging a batch onto the header works too).
- **✕ use current** turns the preassign off (export falls back to the current game cue). **↺ restore preassign** turns it back on.
- Dropping a new file on the row beats the preassign.
- New filter: **Preassigned**. Gaps still shows only DEFAULT/GAP.
- Any reuse of Produce Flame's file gets a ✂ "may need trim" badge. No Chunk 2 row uses it (Burning Hands got the Fire Bolt burst).

Export adds `preassigned_from, preassigned_file, preassign_kept`. `source` is now `drop | preassigned | current`.

| # | Spell | Status | Plays / preassign | From |
|---|---|---|---|---|
| 11 | Vicious Mockery | DEFAULT (gap) | magic/spellcast.mp3 | — psychic, no family yet |
| 12 | Arms of Hadar | PREASSIGNED necrotic | Leviathan_Blizzard._-1793332769355.mp3 | Chill Touch (file is "Blizzard", may read icy) |
| 13 | Burning Hands | PREASSIGNED fire | Booming_fire_bolt_sp_#3-1793332098869.mp3 | Fire Bolt |
| 14 | Chromatic Orb | DEFAULT (gap) | magic/spellcast-alt-01.mp3 (spellshot) | — element picked on cast, so no single family |
| 15 | Cure Wounds | ASSIGNED heal | magic/heal.mp3 | named cue |
| 16 | Dissonant Whispers | DEFAULT (gap) | magic/spellcast.mp3 | — psychic (share with #11?) |
| 17 | Ensnaring Strike | PREASSIGNED vine/thorn | Generate_an_organic_-1793332521409.mp3 | Thorn Whip (added family) |
| 18 | Guiding Bolt | PREASSIGNED radiant | “Holy_fire_spell_imp-1793332463662.mp3 | Sacred Flame |
| 19 | Hail of Thorns | PREASSIGNED vine/thorn | Generate_an_organic_-1793332521409.mp3 | Thorn Whip (added family) |
| 20 | Healing Word | ASSIGNED heal | magic/heal.mp3 | named cue |

Family map used (from `spell-assignments/chunk1-export.json`): fire→Fire Bolt (Produce Flame for sustained flame), cold→Ray of Frost, acid→Acid Splash, poison→Poison Spray, lightning→Shocking Grasp, radiant→Sacred Flame, necrotic→Chill Touch, force/pact→pactshot, plus **vine/thorn→Thorn Whip** (added in Chunk 2). Named final/magic cues (heal, electric, lightning, ice-storm, teleport) win over family reuse.

## Chunk 2 locked (2026-10-29 ~11:46 PM CT)

Export: `spell-assignments/chunk2-export.json`. 10/10 done.

| # | Spell | Assigned | Notes |
|---|---|---|---|
| 11 | Vicious Mockery | A_booming_spell_cast_#3-1793333920165.mp3 | drop |
| 12 | Arms of Hadar | Loud_Dark_tendrils_o_#3-1793334035455.mp3 | drop (replaced Chill Touch preassign) |
| 13 | Burning Hands | a_powerful_loud_flam_#1-1793334142354.mp3 | drop |
| 14 | Chromatic Orb | loud_Magical_orb_of__#2-1793334219151.mp3 | drop |
| 15 | Cure Wounds | loud_Cure_wounds_hea_#4-1793334376889.mp3 | drop · **increase volume if possible** |
| 16 | Dissonant Whispers | A_booming_spell_cast_#4-1793334253020.mp3 | drop |
| 17 | Ensnaring Strike | multiple_loud_whippi_#2-1793335559415.mp3 | drop |
| 18 | Guiding Bolt | “Holy_fire_spell_imp-1793332463662.mp3 | keep preassign from Sacred Flame |
| 19 | Hail of Thorns | a_volley_of_sharp_wo_#2-1793334864977.mp3 | drop |
| 20 | Healing Word | Soft_harp_arpeggios__#3-1793335401961.mp3 | drop · **revisit — not in love** |

---

## Chunk 3: spells 21–30 (built 2026-10-29 ~11:55 PM CT)

**Files:** `spell-sfx-checklist-chunk3.html` (seed: `spell-sfx-checklist-chunk3-seed.json`), localStorage `ssdns-spell-sfx-chunk3`. Pack: `spell-sfx-checklist-chunk3.tar.gz` → `spell-sfx-c3/` (html + `final/magic/` + `drops/` with a README listing the 4 drop files to copy in). Build scripts: `build-c3/`.

Same UX as Chunk 2. What changed:
- Preassigns now come from **Chunk 1 + Chunk 2** exports merged (newer/specific pick wins). Each row shows "↳ from X (Chunk N)".
- A preassign that already lives in `final/magic/` (Magic Missile → pactshot) plays straight away. No drop file needed, and **Load my drop files** doesn't ask for it.
- Flag badges (✂ chip): Produce Flame "may need trim", Cure Wounds "volume bump pending", Healing Word "parked for revisit". They show if any of those files gets reused or dropped. None are reused in Chunk 3.

| # | Spell | Status | Plays / preassign | From |
|---|---|---|---|---|
| 21 | Hellish Rebuke | PREASSIGNED fire | a_powerful_loud_flam_#1-1793334142354.mp3 | Burning Hands (C2) |
| 22 | Hex | PREASSIGNED necrotic | Loud_Dark_tendrils_o_#3-1793334035455.mp3 | Arms of Hadar (C2) |
| 23 | Hunter's Mark | DEFAULT (gap) | magic/spellcast.mp3 | — no damage family |
| 24 | Inflict Wounds | PREASSIGNED necrotic | Loud_Dark_tendrils_o_#3-1793334035455.mp3 | Arms of Hadar (C2) |
| 25 | Magic Missile | PREASSIGNED force | final/magic/pactshot.mp3 | Eldritch Blast (C1) |
| 26 | Ray of Sickness | PREASSIGNED poison | booming_poison_spray_#4-1793332166374.mp3 | Poison Spray (C1) |
| 27 | Searing Smite | PREASSIGNED fire | a_powerful_loud_flam_#1-1793334142354.mp3 | Burning Hands (C2) |
| 28 | Thunderous Smite | ASSIGNED lightning | magic/lightning.mp3 | named cue (/thunder/) |
| 29 | Thunderwave | ASSIGNED lightning | magic/lightning.mp3 | named cue (/thunder/) |
| 30 | Witch Bolt | PREASSIGNED lightning | Sudden,_sharp_electr_#4-1793332495303.mp3 | Shocking Grasp (C1) |

Family map (C3): fire→Burning Hands (burst/AOE) or Fire Bolt (bolt), cold→Ray of Frost, acid→Acid Splash, poison→Poison Spray, lightning→Shocking Grasp, radiant→Guiding Bolt/Sacred Flame, necrotic→Arms of Hadar, vine/thorn→Ensnaring Strike/Hail of Thorns/Thorn Whip, psychic→Vicious Mockery/Dissonant Whispers, heal→Cure Wounds (Healing Word parked), orb→Chromatic Orb, force/pact→pactshot. Named final/magic cues still win (so both thunder spells stay on lightning.mp3, and you can drop a boom over them).

## Chunk 3 locked (2026-10-30 ~9:14 PM CT)

Export: `spell-assignments/chunk3-export.json`. 10/10 done. All new drops (no preassigns kept).

| # | Spell | Assigned | Notes |
|---|---|---|---|
| 21 | Hellish Rebuke | reaction_counter_spe_#1-1793411860965.mp3 | drop |
| 22 | Hex | hex_spell_with_a_qui_#4-1793412105602.mp3 | drop |
| 23 | Hunter's Mark | hex_spell_with_a_qui_#1-1793412115521.mp3 | drop (was gap) |
| 24 | Inflict Wounds | booming_quick_sound__#1-1793412251033.mp3 | drop |
| 25 | Magic Missile | reaction_counter_spe_#2-1793411864281.mp3 | drop (replaced pactshot) |
| 26 | Ray of Sickness | SCIWeap-mega_death_ray_beam-Elevenlabs.mp3 | drop |
| 27 | Searing Smite | MAGSpel-Generate_a_sound_for-Elevenlabs.mp3 | drop |
| 28 | Thunderous Smite | MAGAngl-Ethereal_force_push_-Elevenlabs.mp3 | drop (replaced lightning.mp3) |
| 29 | Thunderwave | DSGNImpt-Create_a_high-impact-Elevenlabs.mp3 | drop (replaced lightning.mp3) |
| 30 | Witch Bolt | punchy_lightining_bo_#2-1793412829583.mp3 | drop |

Audio binaries were browser-local drops — filenames are the assignment keys for Coder until we ingest the source files.

---

## Chunk 4: spells 31–40 (built 2026-10-30 ~9:25 PM CT)

**Files:** `spell-sfx-checklist-chunk4.html` (seed: `spell-sfx-checklist-chunk4-seed.json`), localStorage `ssdns-spell-sfx-chunk4`. Pack: `spell-sfx-checklist-chunk4.tar.gz` → `spell-sfx-c4/` (html + `final/magic/` + `drops/` with a README listing the 7 drop files to copy in). Build scripts: `build-c4/`.

Same UX as Chunk 3 (preassign play, 📂 Load my drop files, Export JSON/CSV, Copy summary, All/Gaps/Preassigned/Not done filters). What changed:
- Preassigns now come from the **Chunk 1 + 2 + 3** locked exports merged (newer/specific pick wins). Each row shows "↳ from X (Chunk N)".
- No Chunk 4 spell name hits a named cue (`spellCue()` regexes), so every row is either a family preassign or the generic DEFAULT. Attack-roll spells (Acid Arrow, Flame Blade, Ray of Enfeeblement, Scorching Ray) currently play spellshot. The rest play spellcast.
- No Chunk 4 preassign lives in `final/magic`, so to hear them you need the drop files (see `drops/README.txt`) or **Load my drop files**.
- Flag badges (Produce Flame "may need trim", Cure Wounds "volume bump pending", Healing Word "parked for revisit") are still wired up. None of those files are reused in Chunk 4.

| # | Spell | Status | Plays / preassign | From |
|---|---|---|---|---|
| 31 | Wrathful Smite | PREASSIGNED psychic | A_booming_spell_cast_#4-1793334253020.mp3 | Dissonant Whispers (C2) |
| 32 | Acid Arrow | PREASSIGNED acid | booming_acid_splash_#2-1793331961394.mp3 | Acid Splash (C1) |
| 33 | Branding Smite | PREASSIGNED radiant | “Holy_fire_spell_imp-1793332463662.mp3 | Guiding Bolt (C2, Sacred Flame file) |
| 34 | Cloud of Daggers | DEFAULT (gap) | magic/spellcast.mp3 | — no blade/metal family (thorns don't fit) |
| 35 | Flame Blade | PREASSIGNED fire | MAGSpel-Generate_a_sound_for-Elevenlabs.mp3 | Searing Smite (C3) |
| 36 | Flaming Sphere | PREASSIGNED fire | a_powerful_loud_flam_#1-1793334142354.mp3 | Burning Hands (C2) |
| 37 | Heat Metal | PREASSIGNED fire | a_powerful_loud_flam_#1-1793334142354.mp3 | Burning Hands (C2), loose fit (a sizzle would be better) |
| 38 | Moonbeam | PREASSIGNED radiant | “Holy_fire_spell_imp-1793332463662.mp3 | Guiding Bolt (C2, Sacred Flame file) |
| 39 | Ray of Enfeeblement | PREASSIGNED ray | SCIWeap-mega_death_ray_beam-Elevenlabs.mp3 | Ray of Sickness (C3) |
| 40 | Scorching Ray | PREASSIGNED fire | Booming_fire_bolt_sp_#3-1793332098869.mp3 | Fire Bolt (C1), may want a triple-hit cut |

Family map (C4): fire burst/AOE→Burning Hands, fire on a weapon→Searing Smite, fire bolt/ray→Fire Bolt, acid→Acid Splash, radiant→Guiding Bolt (Sacred Flame holy-fire file), psychic/fear→Dissonant Whispers (Vicious Mockery alt), ray shape→Ray of Sickness death-ray (necrotic alt: Inflict Wounds / Arms of Hadar), force→Magic Missile / pactshot, lightning→Witch Bolt / Shocking Grasp, thunder→Thunderwave / Thunderous Smite, vine/thorn→Ensnaring Strike / Hail of Thorns, heal→Cure Wounds (Healing Word parked). Named final/magic cues still win. Intentional gap: **Cloud of Daggers** has no slashing/blade family.


## Chunk 4 locked (2026-10-30 ~10:01 PM CT)

Export: `spell-assignments/chunk4-export.json`. 10/10 done. All new drops (no preassigns kept).

| # | Spell | Assigned | Notes |
|---|---|---|---|
| 31 | Wrathful Smite | MAGSpel-Burst_of_divine_or_d-Elevenlabs.mp3 | drop |
| 32 | Acid Arrow | DSGNImpt-Arrow_impact_infused-Elevenlabs.mp3 | drop |
| 33 | Branding Smite | MAGSpel-holy_smite_impact,_b-Elevenlabs.mp3 | drop |
| 34 | Cloud of Daggers | Cloud of daggers.wav | drop (was gap) |
| 35 | Flame Blade | WHSH-Fast_fiery_sword_who-Elevenlabs.mp3 | drop |
| 36 | Flaming Sphere | MAGElem-Celestial_flame_swor-Elevenlabs.mp3 | drop |
| 37 | Heat Metal | MAGMisc-Armored_knight_hit_b-Elevenlabs.mp3 | drop |
| 38 | Moonbeam | MAGSpel-A_powerful_beam_of_m-Elevenlabs.mp3 | drop |
| 39 | Ray of Enfeeblement | MAGMisc-A_shot_made_by_a_mag-Elevenlabs.mp3 | drop |
| 40 | Scorching Ray | A_Ray_of_scorching_h-1793415626295.mp3 | drop |

Audio binaries were browser-local drops — filenames are the assignment keys for Coder until we ingest the source files.

---

## Chunk 6: spells 51–60 (built 2026-10-30 ~10:04 PM CT)

> **Chunk 5 (spells 41–50) isn't built yet.** Jessey skipped ahead to Chunk 6, so Chunk 5 is on hold for now.

**Files:** `spell-sfx-checklist-chunk6.html` (seed: `spell-sfx-checklist-chunk6-seed.json`), localStorage `ssdns-spell-sfx-chunk6`. Pack: `spell-sfx-checklist-chunk6.tar.gz` → `spell-sfx-c6/` (html + `final/magic/` + `drops/` with a README listing the 9 drop files to copy in). Build scripts: `build-c6/` (`seed.py`, `html.py`, `md.py`, `pack.sh`, `t.py`).

Same UX as Chunk 4 (preassign play, 📂 Load my drop files, Export JSON/CSV, Copy summary, and the All/Gaps/Preassigned/Not done filters). What changed:
- Preassigns now come from the **Chunk 1–4** locked exports merged (newer/specific pick wins). Each row shows "↳ from X (Chunk N)".
- **Ice Storm** matches the `spellCue()` regex /ice storm/, so it's ASSIGNED to `final/magic/ice-storm.mp3` and plays straight from the pack. No other Chunk 6 name hits a named cue. Vampiric Touch (melee spell attack) plays spellshot today. The rest play spellcast.
- Every other row is a family preassign. There are **no DEFAULT gaps** in this chunk. Soft fits: Guardian of Faith (holy smite stands in for a guardian presence), Fire Shield (the chill version has no cold pick), and Wall of Fire (a burst, not a sustained crackle).
- No Chunk 6 preassign lives in `final/magic`, so to hear them you need the drop files (see `drops/README.txt`) or **Load my drop files**.
- Flag badges (Produce Flame "may need trim", Cure Wounds "volume bump pending", Healing Word "parked for revisit") are still wired up. None of those files are reused in Chunk 6.

| # | Spell | Status | Plays / preassign | From |
|---|---|---|---|---|
| 51 | Spirit Guardians | PREASSIGNED radiant | MAGSpel-A_powerful_beam_of_m-Elevenlabs.mp3 | Moonbeam (C4), alt Branding Smite |
| 52 | Vampiric Touch | PREASSIGNED necrotic | booming_quick_sound__#1-1793412251033.mp3 | Inflict Wounds (C3), same necrotic touch shape |
| 53 | Blight | PREASSIGNED necrotic | Loud_Dark_tendrils_o_#3-1793334035455.mp3 | Arms of Hadar (C2) |
| 54 | Fire Shield | PREASSIGNED fire | reaction_counter_spe_#1-1793411860965.mp3 | Hellish Rebuke (C3), fire reaction. Chill version has no cold pick |
| 55 | Guardian of Faith | PREASSIGNED radiant | MAGSpel-holy_smite_impact,_b-Elevenlabs.mp3 | Branding Smite (C4), soft fit |
| 56 | Ice Storm | ASSIGNED ice-storm | magic/ice-storm.mp3 | named cue (/ice storm/) |
| 57 | Phantasmal Killer | PREASSIGNED psychic | A_booming_spell_cast_#4-1793334253020.mp3 | Dissonant Whispers (C2) |
| 58 | Staggering Smite | PREASSIGNED psychic smite | MAGSpel-Burst_of_divine_or_d-Elevenlabs.mp3 | Wrathful Smite (C4), psychic smite |
| 59 | Wall of Fire | PREASSIGNED fire | a_powerful_loud_flam_#1-1793334142354.mp3 | Burning Hands (C2), alt Flaming Sphere |
| 60 | Banishing Smite | PREASSIGNED force smite | MAGAngl-Ethereal_force_push_-Elevenlabs.mp3 | Thunderous Smite (C3) ethereal force push, layer teleport for banish |

Family map (C6): radiant zone→Moonbeam, radiant strike→Branding Smite, necrotic touch→Inflict Wounds, necrotic burst→Arms of Hadar (Hex alt), fire reaction→Hellish Rebuke, fire burst/AOE→Burning Hands (Flaming Sphere alt), psychic/fear→Dissonant Whispers, psychic smite→Wrathful Smite, force smite→Thunderous Smite (Magic Missile alt; teleport.mp3 for the banish), cold→ice-storm named cue (Ray of Frost alt). Named final/magic cues still win. Intentional gaps: none.

## Chunk 6 locked (2026-10-30 ~10:42 PM CT)

Export: `spell-assignments/chunk6-export.json` (+ `.csv`). 10/10 done. All new drops (no preassigns kept as the final pick).

| # | Spell | Assigned | Notes |
|---|---|---|---|
| 51 | Spirit Guardians | Spirit guardians.wav | drop |
| 52 | Vampiric Touch | MAGShim-Create_a_soft_cinema-Elevenlabs.mp3 | drop |
| 53 | Blight | MAGSpel-Blight_seed_projecti-Elevenlabs.mp3 | drop |
| 54 | Fire Shield | MAGElem-magical_fire_shield_-Elevenlabs.mp3 | drop |
| 55 | Guardian of Faith | two_armored_gardians_#4-1793417142111.mp3 | drop |
| 56 | Ice Storm | punchy_ice_storm_win_#1-1793417206919.mp3 | drop (replaced named ice-storm cue) |
| 57 | Phantasmal Killer | punchy_booming_psych_#1-1793417424405.mp3 | drop |
| 58 | Staggering Smite | MAGSpel-Burst_of_divine_or_d-Elevenlabs.mp3 | drop |
| 59 | Wall of Fire | Wall of fire.wav | drop |
| 60 | Banishing Smite | banishing smite.wav | drop |

- **Ice Storm** replaced the named `final/magic/ice-storm.mp3` cue with the new drop `punchy_ice_storm_win_#1-1793417206919.mp3`.
- **Staggering Smite**'s drop filename matches the Wrathful Smite preassign (`MAGSpel-Burst_of_divine_or_d-Elevenlabs.mp3`), but Jessey marked it as a new drop.
- Chunk 5 (spells 41–50) is still not built / skipped.

Audio binaries stay on Jessey's PC — filenames are the assignment keys for Coder until we ingest the source files.

---

## Chunk 7 / Rest: spells 41–50 + 61–85 (built 2026-10-30 ~10:49 PM CT)

> **Chunk 5 is skipped permanently.** Jessey asked to do the rest in one chunk, so rows 41–50 (the old Chunk 5) and 61–85 are all in this Rest pack. There will be no separate Chunk 5.

**Files:** `spell-sfx-checklist-chunk7.html` (seed: `spell-sfx-checklist-chunk7-seed.json`), localStorage `ssdns-spell-sfx-chunk7`. Pack: `spell-sfx-checklist-chunk7.tar.gz` → `spell-sfx-c7/` (html + `final/magic/` + `drops/` with a README listing the 19 unique drop files to copy in). Build scripts: `build-c7/` (`seed.py`, `html.py`, `md.py`, `pack.sh`, `t.py`). UI title: "Checklist · Rest".

Same UX as Chunk 6, with 35 rows instead of 10. What changed:
- Preassigns come from the **Chunk 1–6** locked exports merged (1, 2, 3, 4, 6; newer/specific pick wins). Each row shows "↳ from X (Chunk N)".
- Progress reads **N/35**, and Copy summary says "Spell SFX Chunk 7 / Rest: N/35 done". The old page had `0/10` and `/10 done` hardcoded; both were fixed.
- **8 ASSIGNED** by named cue (`spellCue()`): Call Lightning, Lightning Bolt, Chain Lightning → lightning-ultimate. Lightning Arrow → lightning. Cone of Cold → ice-storm. Mass Healing Word, Mass Cure Wounds, Heal → heal. Your Cure Wounds (volume bump pending) and Healing Word (parked) drops are only noted as alts, not preassigned. Your C6 Ice Storm drop replaced the ice-storm cue for Ice Storm only, so Cone of Cold still plays `ice-storm.mp3` today.
- Spiritual Weapon and Contagion (attack kind) play spellshot today. The rest play spellcast.
- **2 DEFAULT gaps (intentional):** Insect Plague (no swarm/buzz sound anywhere) and Prismatic Spray (multi-element; Chromatic Orb C2 is the nearest alt).
- **Soft fits:** Spiritual Weapon (Magic Missile dart for a weapon swing), Conjure Barrage / Conjure Volley (wood-thorn volley), Cloudkill (quick puff for a lingering fog), Contagion (death-ray for a touch), Disintegrate (poison ray reused for force), Incendiary Cloud (wall roar for ember cloud), Meteor Swarm (one fire bolt for four meteors).
- Flag badges (Produce Flame "may need trim", Cure Wounds "volume bump pending", Healing Word "parked for revisit") are still wired up. None of those files are preassigned in the Rest pack.

| # | Spell | Status | Plays / preassign | From |
|---|---|---|---|---|
| 41 | Shatter | PREASSIGNED thunder | DSGNImpt-Create_a_high-impact-Elevenlabs.mp3 | Thunderwave (C3) |
| 42 | Spiritual Weapon | PREASSIGNED force | reaction_counter_spe_#2-1793411864281.mp3 | Magic Missile (C3) · soft fit |
| 43 | Blinding Smite | PREASSIGNED radiant smite | MAGSpel-holy_smite_impact,_b-Elevenlabs.mp3 | Branding Smite (C4) |
| 44 | Call Lightning | ASSIGNED lightning-ultimate | magic/lightning-ultimate.mp3 | named cue (spellCue) |
| 45 | Conjure Barrage | PREASSIGNED volley | a_volley_of_sharp_wo_#2-1793334864977.mp3 | Hail of Thorns (C2) · soft fit |
| 46 | Fireball | PREASSIGNED fire burst | a_powerful_loud_flam_#1-1793334142354.mp3 | Burning Hands (C2) |
| 47 | Hunger of Hadar | PREASSIGNED necrotic/hadar | Loud_Dark_tendrils_o_#3-1793334035455.mp3 | Arms of Hadar (C2) |
| 48 | Lightning Arrow | ASSIGNED lightning | magic/lightning.mp3 | named cue (spellCue) |
| 49 | Lightning Bolt | ASSIGNED lightning-ultimate | magic/lightning-ultimate.mp3 | named cue (spellCue) |
| 50 | Mass Healing Word | ASSIGNED heal | magic/heal.mp3 | named cue (spellCue) |
| 61 | Cloudkill | PREASSIGNED poison | booming_poison_spray_#4-1793332166374.mp3 | Poison Spray (C1) · soft fit |
| 62 | Cone of Cold | ASSIGNED ice-storm | magic/ice-storm.mp3 | named cue (spellCue) |
| 63 | Contagion | PREASSIGNED disease/poison | SCIWeap-mega_death_ray_beam-Elevenlabs.mp3 | Ray of Sickness (C3) · soft fit |
| 64 | Conjure Volley | PREASSIGNED volley | a_volley_of_sharp_wo_#2-1793334864977.mp3 | Hail of Thorns (C2) · soft fit |
| 65 | Destructive Wave | PREASSIGNED thunder | DSGNImpt-Create_a_high-impact-Elevenlabs.mp3 | Thunderwave (C3) |
| 66 | Flame Strike | PREASSIGNED radiant fire | “Holy_fire_spell_imp-1793332463662.mp3 | Sacred Flame (C1) |
| 67 | Insect Plague | DEFAULT (gap) | magic/spellcast.mp3 | intentional gap |
| 68 | Mass Cure Wounds | ASSIGNED heal | magic/heal.mp3 | named cue (spellCue) |
| 69 | Blade Barrier | PREASSIGNED blades | Cloud of daggers.wav | Cloud of Daggers (C4) |
| 70 | Chain Lightning | ASSIGNED lightning-ultimate | magic/lightning-ultimate.mp3 | named cue (spellCue) |
| 71 | Circle of Death | PREASSIGNED necrotic burst | Loud_Dark_tendrils_o_#3-1793334035455.mp3 | Arms of Hadar (C2) |
| 72 | Disintegrate | PREASSIGNED ray | SCIWeap-mega_death_ray_beam-Elevenlabs.mp3 | Ray of Sickness (C3) · soft fit |
| 73 | Freezing Sphere | PREASSIGNED cold burst | punchy_ice_storm_win_#1-1793417206919.mp3 | Ice Storm (C6) |
| 74 | Harm | PREASSIGNED necrotic | booming_quick_sound__#1-1793412251033.mp3 | Inflict Wounds (C3) |
| 75 | Heal | ASSIGNED heal | magic/heal.mp3 | named cue (spellCue) |
| 76 | Sunbeam | PREASSIGNED radiant beam | MAGSpel-A_powerful_beam_of_m-Elevenlabs.mp3 | Moonbeam (C4) |
| 77 | Wall of Ice | PREASSIGNED cold | Sci-fi_ice_freeze_ra-1793332884098.mp3 | Ray of Frost (C1) |
| 78 | Wall of Thorns | PREASSIGNED vine/thorn | Generate_an_organic_-1793332521409.mp3 | Thorn Whip (C1) |
| 79 | Delayed Blast Fireball | PREASSIGNED fire burst | a_powerful_loud_flam_#1-1793334142354.mp3 | Burning Hands (C2) |
| 80 | Finger of Death | PREASSIGNED necrotic | MAGSpel-Blight_seed_projecti-Elevenlabs.mp3 | Blight (C6) |
| 81 | Fire Storm | PREASSIGNED fire AOE | Wall of fire.wav | Wall of Fire (C6) |
| 82 | Prismatic Spray | DEFAULT (gap) | magic/spellcast.mp3 | intentional gap |
| 83 | Incendiary Cloud | PREASSIGNED fire AOE | Wall of fire.wav | Wall of Fire (C6) · soft fit |
| 84 | Sunburst | PREASSIGNED radiant burst | MAGSpel-Burst_of_divine_or_d-Elevenlabs.mp3 | Wrathful Smite (C4) |
| 85 | Meteor Swarm | PREASSIGNED fire impact | Booming_fire_bolt_sp_#3-1793332098869.mp3 | Fire Bolt (C1) · soft fit |

Family map (Rest): thunder→Thunderwave (Shatter, Destructive Wave) · force→Magic Missile · radiant smite→Branding Smite · radiant fire→Sacred Flame (Flame Strike) · radiant beam→Moonbeam (Sunbeam) · radiant burst→Wrathful Smite "Burst of divine" (Sunburst) · fire burst→Burning Hands (Fireball, Delayed Blast) · fire AOE→Wall of Fire C6 (Fire Storm, Incendiary Cloud) · fire impact→Fire Bolt (Meteor Swarm) · Hadar/necrotic area→Arms of Hadar (Hunger of Hadar, Circle of Death) · necrotic single→Inflict Wounds (Harm) / Blight C6 (Finger of Death) · cold→Ice Storm drop C6 (Freezing Sphere) / Ray of Frost (Wall of Ice) · poison→Poison Spray (Cloudkill) · disease/ray→Ray of Sickness (Contagion, Disintegrate) · blades→Cloud of Daggers (Blade Barrier) · thorn→Thorn Whip (Wall of Thorns) · volley→Hail of Thorns (Conjure Barrage/Volley). Named final/magic cues still win.

---

## Chunk 7 / Rest locked (2026-10-30 ~11:10 PM CT)

Export: `spell-assignments/chunk7-export.json` (+ `.csv`). 35/35 done. **15 new drops**, **15 kept preassigns**, **5 kept current** (20 keeps total). Chunk 5 stays folded in — all 85 spells are now locked across Chunks 1–4, 6, 7.

| # | Spell | Assigned | Source |
|---|---|---|---|
| 41 | Shatter | DSGNImpt-Create_a_high-impact-Elevenlabs.mp3 | keep preassign from Thunderwave |
| 42 | Spiritual Weapon | Mystical_energy_weap_#2-1793418899395.mp3 | new drop |
| 43 | Blinding Smite | MAGSpel-holy_smite_impact,_b-Elevenlabs.mp3 | keep preassign from Branding Smite |
| 44 | Call Lightning | final/magic/lightning-ultimate.mp3 | keep current |
| 45 | Conjure Barrage | a_volley_of_sharp_wo_#2-1793334864977.mp3 | keep preassign from Hail of Thorns · note: "Use magic missile" |
| 46 | Fireball | fireball_explosion_#4-1793418958878.mp3 | new drop |
| 47 | Hunger of Hadar | Loud_Dark_tendrils_o_#3-1793334035455.mp3 | keep preassign from Arms of Hadar |
| 48 | Lightning Arrow | final/magic/lightning.mp3 | keep current |
| 49 | Lightning Bolt | An_empowered_chain_l_#3-1793419085463.mp3 | new drop |
| 50 | Mass Healing Word | final/magic/heal.mp3 | keep current |
| 61 | Cloudkill | booming_poison_spray_#4-1793332166374.mp3 | keep preassign from Poison Spray |
| 62 | Cone of Cold | final/magic/ice-storm.mp3 | keep current |
| 63 | Contagion | SCIWeap-mega_death_ray_beam-Elevenlabs.mp3 | keep preassign from Ray of Sickness |
| 64 | Conjure Volley | a_volley_of_sharp_wo_#2-1793334864977.mp3 | keep preassign from Hail of Thorns |
| 65 | Destructive Wave | DSGNImpt-Create_a_high-impact-Elevenlabs.mp3 | keep preassign from Thunderwave |
| 66 | Flame Strike | “Holy_fire_spell_imp-1793332463662.mp3 | keep preassign from Sacred Flame |
| 67 | Insect Plague | Massive_swarm_of_ins_#1-1793419262926.mp3 | new drop |
| 68 | Mass Cure Wounds | massive_healing_spel_#1-1793419294920.mp3 | new drop |
| 69 | Blade Barrier | Cloud of daggers.wav | keep preassign from Cloud of Daggers |
| 70 | Chain Lightning | An_empowered_chain_l_#2-1793419344152.mp3 | new drop |
| 71 | Circle of Death | Loud_Dark_tendrils_o_#3-1793334035455.mp3 | keep preassign from Arms of Hadar |
| 72 | Disintegrate | SCIWeap-mega_death_ray_beam-Elevenlabs.mp3 | keep preassign from Ray of Sickness |
| 73 | Freezing Sphere | punchy_ice_storm_win_#1-1793417206919.mp3 | keep preassign from Ice Storm |
| 74 | Harm | booming_quick_sound__#1-1793412251033.mp3 | keep preassign from Inflict Wounds |
| 75 | Heal | massive_healing_spel_#3-1793419374404.mp3 | new drop |
| 76 | Sunbeam | A_bright,_shimmering_#4-1793419413094.mp3 | new drop |
| 77 | Wall of Ice | Epic_Hollywood-style_#1-1793419585762.mp3 | new drop |
| 78 | Wall of Thorns | massive_wall_of_forr_#3-1793419494138.mp3 | new drop |
| 79 | Delayed Blast Fireball | fireball_explosion_#3-1793419613984.mp3 | new drop |
| 80 | Finger of Death | A_sharp,_crackling_e_#2-1793419678342.mp3 | new drop |
| 81 | Fire Storm | Epic_Hollywood-style_#3-1793419633459.mp3 | new drop |
| 82 | Prismatic Spray | final/magic/spellcast.mp3 | keep current |
| 83 | Incendiary Cloud | Wall of fire.wav | keep preassign from Wall of Fire |
| 84 | Sunburst | booming_sunburst_#4-1793419742115.mp3 | new drop |
| 85 | Meteor Swarm | meteor_swarm_#4-1793419778557.mp3 | new drop |

- **Conjure Barrage (#45) — follow-up for Coder/Art:** Jessey's note says **"Use magic missile"**. The export's `assigned_file` is still the Hail of Thorns volley (`a_volley_of_sharp_wo_#2-1793334864977.mp3`), but the intent is Magic Missile's sound (`reaction_counter_spe_#2-1793411864281.mp3`, C3). Swap it when wiring; Conjure Volley (#64) keeps the Hail of Thorns volley.
- **Prismatic Spray (#82)** kept current `final/magic/spellcast.mp3` — still a soft gap (Chromatic Orb C2 is the nearest alt).
- **Insect Plague (#67)** gap is closed by a new drop (`Massive_swarm_of_ins_#1-1793419262926.mp3`).
- Drops replaced these preassigns: Spiritual Weapon, Fireball, Sunbeam, Wall of Ice, Wall of Thorns, Delayed Blast Fireball, Finger of Death, Fire Storm, Sunburst, Meteor Swarm. Drops replaced named cues on Lightning Bolt, Chain Lightning (lightning-ultimate), Mass Cure Wounds, Heal (heal).
- Kept current named cues: Call Lightning, Lightning Arrow, Mass Healing Word, Cone of Cold, Prismatic Spray.

Audio binaries stay on Jessey's PC — filenames are the assignment keys for Coder until we ingest the source files.
