# N81 — Chunk 2 table / UX soft-lock (DND Bot → Coder) — 2026-10-29 ~7:55 PM CT
**Owner:** DND Bot · **For:** Coder (wire) · Art Bot (paint) · 2014 PHB · FX looks: `specs/spell-fx/beam-map-fx-chunk2-v1.md`
**Jessey locks already:** Flaming Sphere = **create-token** (fire ball). Lasting rider marks must sit on the **player/target token** and the **DM can clear** them (same Clear tool family as zone/chip Clear).
**Never regen rules.js.** Lighting emitters (Fire Shield light, etc.) stay Phase 4 unless already cheap.

## Soft-locks by slot

### 1. Hex / Hunter's Mark — sticky quarry brand
- **Object:** chip + low-alpha mark FX on the **quarry token** (Hex = plum sigil; HM = amber brand-star). Not a map token of its own.
- **Cast:** short pulse caster → target; apply mark + rider. Extra damage on matching weapon hits re-flares the mark.
- **Move mark (BA):** when quarry hits 0 HP (or DM allows early move), sheet/DM shows **Move Hex / Move Mark** → target picker; pulse jumps; old mark clears.
- **End:** concentration break, duration, or **DM Clear chip** on that token. Mark FX pops with the chip.
- **Gap tie:** P0-10 (move picker).

### 2. Shocking Grasp — touch + no-reactions cue
- **Cast:** melee spell attack, adjacent only. Jag spark + white flash.
- **Sticky (short):** on hit, target gets **"No reactions"** until the **start of its next turn** — show as spark-cage ring on the token (fades when the chip drops). DM can Clear early.
- **Metal armor:** attack has advantage (brighter flare is FX-only).
- **Gap tie:** P0-6 cantrip on-hit.

### 3. Thorn Whip — pull, not sticky
- **Cast:** melee spell attack, 30 ft. On hit (Large or smaller): **pull** up to 10 ft toward caster — **token slide** (not log-only). Dust/ghost afterimage is FX.
- **No lasting chip.** Vine is instant.
- **Gap tie:** P0-12 push/pull was log-only → wire real slide.

### 4. Hellish Rebuke — reaction bloom on attacker
- **Trigger:** reaction after you take damage from a creature you can see within 60 ft.
- **Resolve on the attacker token** (not a missile from your hand). Save → fire damage. No sticky.
- Scorched ring under attacker = short FX (~1 s), not a lasting hazard tile.

### 5. Flame Blade — caster-attached FX, **not** create-token
- **RAW:** blade is in your hand; no own square, no BA move of a separate piece.
- **Wire:** concentration spell; held fire-saber FX follows **caster token**; each turn while up: melee spell attack (Action) from caster's square — slot-free sustain button (P0-9).
- **Do not** spawn a Spiritual-Weapon-style token. Floating-saber alt is art-only reject.
- Optional: dim light later (Phase 4).

### 6. Flaming Sphere — **create-token** (Jessey locked)
- **Object:** map token = ball of fire (Art painting fire-ball; keg-hoop optional). Occupies 1 square. **Not** in initiative, **no HP**, not targetable as a creature.
- **Cast:** place in empty square within range (concentration).
- **BA:** move up to 30 ft (roll path + optional scorch garnish). If it enters a creature's space / rams: DEX save, fire damage, stop.
- **End of turn:** any creature that ends its turn within 5 ft of the sphere → DEX save, fire damage (zone-adjacent tick or token-aura tick).
- **End:** concentration break, duration, or **DM Clear** this instance.
- Same pattern as Spiritual Weapon create-token (move/strike), but damage model is ram + adjacency, not melee spell attack.

### 7. Heat Metal — sticky on target (gear glow)
- **Object:** chip + forge glow / heat-shimmer FX on the **target token** (metal weapon or armor). Not a separate map token.
- **Cast / BA tick:** **auto-roll** the fire damage (and CON save when held) for anyone holding or wearing the heated metal — iron or any metal. Do not wait for a manual roll.
- **What's metal** = **DM call** (prompt/flag if ambiguous).
- **Drop weapon:** if held, prompt the **DM** for that creature's CON save to drop (enemies included). On fail or voluntary drop, give a **Drop weapon** resolution (unequip / item to the square). Soft-lock: chip clears on drop unless DM re-applies.
- **BA (slot-free, P0-9):** while concentrating, re-deal damage + drop-save pulse (re-flare glow) — same auto-roll path.
- **End:** concentration, duration, or **DM Clear chip** (glow dies with chip).
- *(Jessey lock 2026-10-29 ~7:56 PM CT.)*

### 8. Fire Shield — sticky aura on **caster**
- **Object:** chip + low-alpha warm flame **or** chill rime shell on the **caster token** (warm/chill picked at cast).
- **Retaliate:** when a creature within 5 ft hits you with a melee attack → automatic fire or cold damage on the attacker (small snap FX). Must fire on unflagged DM damage too (gap note).
- **End:** duration (10 min, no concentration in 2014) or **DM Clear** on caster. Aura FX dies with chip.
- Light emission = Phase 4 (partial today).

### 9. Vampiric Touch — touch sustain + heal
- **Cast / each Action while concentrating:** melee spell attack adjacent; necrotic damage; **caster heals half** the necrotic dealt (missing even on first cast today — P0-9).
- **FX:** clamp + siphon ribbon + heal pulse. **No sticky** on the target beyond the hit.
- Slot-free **Sustain** button while 🧠 (same as Witch Bolt family).

### 10. Ray of Enfeeblement — sticky weakness
- **Object:** chip + grey desat / cracked-strength mark on the **target token**.
- **Cast:** ranged spell attack; on hit, target deals half damage with Strength weapon attacks.
- **End of target's turns:** CON save ends it (needs P0-1 end-tick + save request). Also ends on concentration break or **DM Clear**.
- Mark FX pops with the chip.

## DM Clear (shared)
- One control: clear **this chip/rider/instance** on a token (or all chips on that token / in scene — match zone Clear from grids P0-5).
- Applies to: Hex/HM, Shocking Grasp no-reactions, Heat Metal, Fire Shield, Enfeeblement, Flaming Sphere token, and later Spiritual Weapon token.
- Player sheet doesn't need a "dispel my own aura" button beyond dropping concentration / waiting out duration; DM override always available.

## Grouped summary for wiring
| Kind | Spells | Pattern |
|:--|:--|:--|
| Sticky on **target** | Hex/HM, Heat Metal, Enfeeblement, Shocking Grasp (short) | chip + idle FX; DM Clear; re-flare on ticks/hits |
| Sticky on **caster** | Fire Shield | aura chip + retaliate hook; DM Clear |
| Create-token | Flaming Sphere (+ Spiritual Weapon already) | place / BA move / adjacency or strike; DM Clear instance |
| Caster-attached weapon FX | Flame Blade | follows caster; Action attack sustain; **no** token |
| Instant / motion only | Thorn Whip, Hellish Rebuke, Vampiric Touch hit | slide / bloom / siphon; VT also needs sustain + heal half |

## Art notes (for Art Bot)
- Flaming Sphere: Jessey wants **just a ball of fire** create-token — prefer simple fire orb over iron keg if those conflict; roll/scorch = garnish FX only.
- Flame Blade: keep **held** saber on caster (not a free-floating token).
- Sticky marks (1, 7, 8, 10) and Shocking cage (2): low-alpha idle so portraits stay readable; must be removable with the chip.
