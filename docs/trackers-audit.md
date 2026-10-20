# SSDNS trackers audit (sample-trackers sweep)

Written 2026-10-19 ~9:40 PM CT; updated ~10:15 PM CT for the PR (Jessey's 9:51 PM picks + 9:53 PM Smite/Sneak ruling). Branch `sample-trackers` on main 6dbe22d.

Sources:
- `BOOK1` = /workspace/1_SSDNS_PHB/BOOK1.md, cited by line number.
- `rules.js` = assets/data/rules.js (not edited).
- `catalog` = assets/data/item-catalog.js.

BOOK1 L899 says Callings use "the PHB class rules in full". Where an SSDNS line leaves out a use count or rest type, the 5E PHB value applies, and the row says "(PHB)".

Status key:
- **SHEET**: the sheet already tracks it (before this branch).
- **SAMPLE**: new tracker on sample-trackers (this PR).
- **FIXED**: an existing tracker that was wrong; corrected in this PR.
- **UNTRACKED**: nothing counts it yet. Listed so Jessey can pick; not built.
- **n/a**: no counter in SSDNS (listed so nobody builds one by mistake).

"featureUses" means the existing generic tracker (sheet-playtest `useRule`). It reads Calling, lineage and background feature text only, and never subclass or feat text. It matches only these phrasings (unchanged), and in this PR it **skips any feature that now has its own tracker row** (`SSDNSTrackers.coversFeature`), so nothing is counted twice:
- "once per short rest"
- "once per long rest"
- "N + Cha … long rest / per day"
- "N times per long rest"

## 1. Calling features

| Calling | Feature | Counter | Source | Status |
|---|---|---|---|---|
| Tribal Warrior | Dust Fury (Rage) | Rages column 2→6, Unlimited at 20th; long rest (PHB) | BOOK1 L942–943, table L964–985 | **SAMPLE** (pips on the existing `rageUsed`; Enter / End button; the old flat cap of 2 in table-ux now follows the column; long rest resets and ends the fury) |
| Tribal Warrior (Berserker) | Frenzy: 1 exhaustion level when fury ends | exhaustion | BOOK1 L1000 | SHEET (exhaustion levels, conditions.js; manual) |
| Storyteller | Rally Word / Saloon Courage | uses = Cha mod (min 1) per long rest (PHB); short rest from 5th, Font of Inspiration | BOOK1 L1044–1045, L1078; die column L1072 | **SAMPLE** (Jessey 9:51 PM: 5e values) |
| Storyteller | Instrument: once per short rest, add Rally die to a save DC | 1/short rest (not with Voice) | BOOK1 L1059–1061 | **FIXED**: own row "Instrument: Rally die to a save DC"; the mislabelled "Dying Weave Spellcasting 1/short" chip is gone |
| Storyteller | Campfire Measure (extra HD die on short rest) | n/a (rides on short rest) | BOOK1 L1050 | n/a |
| Storyteller (Lore) | Cutting Words / Heckle, Peerless Skill: spend an Inspiration die | shares the Rally Word pool | BOOK1 L1110, L1112 | via Rally Word pips (manual) |
| Storyteller (Valor) | Combat Inspiration | shares the Rally Word pool | BOOK1 L1119 | via Rally Word pips (manual) |
| Frontier Preacher | Channel the Creed | 1/rest, 2 at 6th, 3 at 18th (short or long) | BOOK1 L1157–1158, table L1173/1177/1189 | **FIXED** (scales 1/2/3) |
| Frontier Preacher | Divine Intervention | 1 per 7 days on a success (PHB) | BOOK1 L1163, table L1181 | **SAMPLE** (10th+; not reset by rests; clear by hand after a failure) |
| Preacher (War) | War Priest | Wis mod (min 1) per long rest | BOOK1 L1213 | **SAMPLE** (subclass now read) |
| Preacher (Life/War) | Preserve Life / Guided Strike | spend Channel Creed | BOOK1 L1205, L1214 | via Channel Creed |
| Nature Guide | Beast Mantle (Wild Shape) | 2 per short or long rest; unlimited at 20 | BOOK1 L1254–1255, L1269 | **SAMPLE** |
| Nature Guide (Land) | Natural Recovery | slots = half level on a short rest, 1/day (PHB) | BOOK1 L1309 | **SAMPLE** (resets on a long rest) |
| Nature Guide (Moon) | Combat / Elemental Wild Shape | spends Beast Mantle uses or slots | BOOK1 L1321 | via Beast Mantle pips (manual) |
| Gunslinger | Dust Breath (Second Wind) | 1/short rest | BOOK1 L1354–1355 | **SAMPLE** row (replaces the featureUses chip) |
| Gunslinger | Second Cylinder (Action Surge) | 1/short rest, **2 at 17th** | BOOK1 L1357–1358, table L1376/L1391 | **FIXED** (2 at 17th) |
| Gunslinger | Iron Nerve (Indomitable) | 1/long at 9th, 2 at 13th, 3 at 17th | BOOK1 L1366–1367, table L1383/1387/1391 | **FIXED** (was 3 from 9th) |
| Gunslinger (Gun Whisperer) | Combat Superiority: superiority dice | 4 d8 (5 at 7th, 6 at 15th PHB; d10 at 10th, d12 at 18th), short or long | BOOK1 L1418, L1421 | **SAMPLE** (pips + "Use d8" roll) |
| Gunslinger (Gun Whisperer) | Relentless: regain 1 on initiative if 0 | trigger | BOOK1 L1422 | UNTRACKED (manual pip) |
| Martial Artist | Breath Coin (Ki) | Ki = level (Ki column); short or long rest (PHB) | BOOK1 L1463–1464, table L1479; rest per PHB (L899) | **SAMPLE** (Jessey 9:51 PM: Ki follows 5e) |
| Martial Artist | Stunning Strike, Quivering Palm (3), Kung Fu disciplines | spend Ki | BOOK1 L1473, L1516, L1532–1537 | via Ki pips (manual) |
| Martial Artist (Open Hand) | Whistle Recovery | 1/long rest (6th) | BOOK1 L1514 | **SAMPLE** (subclass now read) |
| Martial Artist (Open Hand) | Tranquility | after long rest | BOOK1 L1515 | n/a |
| Lawman | Oath Sense | 1 + Cha mod per day; long rest (PHB) | BOOK1 L1565–1566 | **FIXED** (was missing) |
| Lawman | Mercy Hands | pool of 5 × level HP | BOOK1 L1568–1569 | SHEET (mercySpent, table-ux) |
| Lawman | Smite Lead | **no uses**: it spends a spell slot (2d8, +1d8 per level, max 5d8, +1d8 unquiet/fiend; crit doubles the dice) | BOOK1 L1586–1587 | **SAMPLE** (Jessey 9:53 PM: "Smite next attack" toggle armed BEFORE the attack; slot picker, lowest by default; a hit spends the slot and adds the dice into that attack's damage; a miss spends nothing; clears after one attack; blocked while Dull or with no slots, DM override allowed. Works from the Gear card, map token Attacks and DM-sent shots. No after-hit button.) |
| Lawman | Improved Smite Lead (+1d8 on every hit) | n/a | BOOK1 L1611 | n/a (not automated) |
| Lawman | Badge Bound: Dull blocks spells, Smite, Mercy Hands, Channel Creed | state | BOOK1 L1577 | SHEET (badgeState); SAMPLE blocks arming Smite while Dull (DM-sent shots may override) |
| Lawman | Deputize | 1/long rest per deputy (2 deputies at 11th) | BOOK1 L1584, table L1603/L1611 | **SAMPLE** |
| Lawman (all oaths) | Channel Creed (Sacred Weapon / Vow of Enmity / Control Undead) | 1/short rest (PHB) | BOOK1 L1633–1634, L1641, L1652 | **SAMPLE** (3rd+, with an oath picked) |
| Frontier Scout | Spell slots | slots | BOOK1 L1712 table | SHEET (hexLead) |
| Gambler | Suckerpunch / Dead Angle (Sneak Attack) | once per turn; dice by table column; finesse or ranged weapon (PHB) | BOOK1 L1790–1791, table L1806–1827 | **SAMPLE** (Jessey 9:53 PM: "Sneak Attack next attack" toggle armed BEFORE the attack; a hit adds the dice (crit doubles) and marks the turn Used; a miss uses nothing; clears after one attack; disabled once used this turn. Gear card, map token Attacks, DM-sent shots. The old after-hit Roll button is gone.) |
| Gambler | Stroke of Luck (20th) | once per rest | BOOK1 L1799–1800 | **SAMPLE** |
| Hexslinger | Hex lead shells = spell slots | slots | BOOK1 L1887, table L1925 | SHEET (hexLead) |
| Hexslinger | Hex Well (Font of Magic): sorcery points | = level (Sorcery Pts column), long rest | BOOK1 L1901–1902, table L1925 | **SAMPLE** |
| Hexslinger | Etch a shell / melt shells; Hex Tricks costs | spend points | BOOK1 L1903–1906, L1908–1912 | manual pips (not automated) |
| Hexslinger | Sorcerous Restoration (20th) | +4 points on a short rest | BOOK1 L1918–1919 | **SAMPLE** (applied in the rest hook) |
| Hexslinger (Demon Blood) | Demon Glare: 5 points | spend | BOOK1 L1964 | via points |
| Hexslinger (Wild Magic) | Tides of Chaos | 1/long rest | BOOK1 L1971 | **SAMPLE** (subclass now read) |
| Hexslinger (Wild Magic) | Bend Luck (2 points) | spend | BOOK1 L1972 | via points |
| Hexslinger | Wild spark (natural 1 on a hex shot) | table roll, not a counter | BOOK1 L1895, table L4158–4168 | SHEET (wild-spark roll); "Lucky dust" refunds a shell (L4168): manual |
| Pact Seeker | Pact slots (recover on a short rest) | slots | BOOK1 L2010–2011 | SHEET (hexLead) |
| Pact Seeker | Mystic Arcanum (6th–9th, each 1/long rest) | 1/long each | BOOK1 L2019–2020, table L2038–2044 | **FIXED** (one row per arcanum at 11/13/15/17) |
| Pact Seeker | Eldritch Master (20th): 1 minute to regain pact slots | 1/long (PHB) | BOOK1 L2020 | **SAMPLE** |
| Scholar | Dust-Lamp Recovery | once per day | BOOK1 L2110–2111 | **FIXED** (was missing; resets on a long rest) |
| Scholar | Spell Mastery / Signature Spells (each signature spell 1/short rest) | 1/short each | BOOK1 L2113–2114 | **SAMPLE** (20th: 2 pips) |
| All casters | Spell slots | slots | each table | SHEET (hexLead) |

## 2. Feats

| Feat | Counter | Source | Status |
|---|---|---|---|
| Lucky | 3 luck points, long rest | BOOK1 L5014–5021 (table L4794) | **SAMPLE** |
| Martial Adept | 1 d6 superiority die, short or long rest (adds to Gun Whisperer dice) | BOOK1 L5023–5028 | **SAMPLE** (separate d6 row) |
| Muzzleloader | Reopen chamber 1/short rest | BOOK1 L5064 | SHEET (muzzleReopenUsed) |
| Powder Man | up to 3 charges per short rest from blasting powder | BOOK1 L5091, L4263 | UNTRACKED (charges land as dynamite items, which do get count pips) |
| Savage Attacker | once per turn reroll | BOOK1 L5141 (table L4807) | UNTRACKED |
| Weave-Touched | 1st-level spell once per long rest | BOOK1 L5217 | **SAMPLE** |
| Healer | healer's kit use; 1/short rest per creature | BOOK1 L4929 | SHEET partly (medic kit uses via item charges) |
| Inspiring Leader | temp HP speech (1/short rest per creature, PHB) | BOOK1 L4968 | UNTRACKED |

## 3. Lineage traits

| Lineage | Trait | Counter | Source | Status |
|---|---|---|---|---|
| Aristocrats / Night House | faerie fire 1/long (3rd), darkness 1/long (5th) | 2 × 1/long | BOOK1 L494 | **FIXED** (two rows) |
| Farmers | Lucky (reroll natural 1s) | **no counter** | BOOK1 L528–529 | n/a (not the Lucky feat, L5021) |
| Camp Kin | Fire-Eater's Trick (breath) | 1/long rest | BOOK1 L633, L662–663 | **SAMPLE** |
| Pioneers | Relentless Endurance | 1/long rest | BOOK1 L832–833 | **SAMPLE** |
| Street Folk | Infernal Legacy: hellish rebuke 1/long (3rd), darkness 1/long (5th) | 1/long each | BOOK1 L879–880 | **SAMPLE** |

## 4. Core / table

| Item | Counter | Source | Status |
|---|---|---|---|
| Hit dice | level dice, half back on a long rest | PHB (BOOK1 L899) | SHEET (hitDiceLeft, offerHitDice on short rest) |
| Death saves | 3/3 | PHB | SHEET (deathSaves) |
| Exhaustion | levels 1–6 | PHB; BOOK1 L1000 | SHEET (conditions.js) |
| Party Inspiration pool | up to 10, shared | BOOK1 L2283–2290, L3672 | SHEET (partyInspiration[10]) |
| Misfire streak / jam / foul | state | BOOK1 L3653–3664 | SHEET (misStreak, jammed, fouled) |
| Fast swap / Both barrels | once per turn | BOOK1 L3699, L3728, L4046 | n/a (action economy) |

## 5. Weapons and ammo (Jessey's locked picks)

| Thing | Counter | Source | Status |
|---|---|---|---|
| Bows / sling: quiver = ammo pool, no cap | pool count + "N shot" | Jessey pick; recover half (BOOK1 L4197) | **SAMPLE** (pips, Recover ½ for arrows and sling stones / bullets) |
| Crossbows hand / light / heavy (Loading), 5e names kept | LOADED / EMPTY marker, free load, bolts; Recover ½ | Jessey pick; **not in the PHB** (crosswalk maps crossbows to guns, BOOK1 L4472–4476) | **SAMPLE** (injected at runtime, not in rules.js). Firing while empty auto-loads one bolt for free, so every shot spends exactly one bolt and rolls attack and damage normally; a second shot in the same action is warned (Loading), never blocked |
| Crossbow bolts (20): 100 ES, one pack for all three crossbows (hand included) | ammo pack → bolts pool | Encounter Bot via Jessey (2026-10-19 9:50 PM CT); not yet in BOOK1 | **SAMPLE** (listed right after Arrows (20) in the sheet gear list and the DM store; 1½ lb., the 5E weight, confirmed by Jessey 9:51 PM) |
| Blowpipe | loaded marker + needles; Recover ½ | Jessey pick | **SAMPLE** (same auto-load as crossbows) |
| Javelins, spears | count pips; **Recover ½** (rounded down; the rest leave the count) | Jessey 9:51 PM | **SAMPLE** (Throw, ±, Recover ½) |
| Thrown knives, hatchets, nets | count pips; all recovered | Jessey pick | **SAMPLE** (Throw, ±, Recover all) |
| Lightning Tomahawk | returns to hand | catalog | n/a (excluded) |
| Dynamite | lost once thrown; fuse roll stays | Jessey pick | SHEET (explosive item count) + SAMPLE count pips on the item |
| Misfire on non-firearms | none | Jessey pick | **SAMPLE fix** (firearms only) |

## 6. Magic items and consumables

| Item | Counter | Source | Status |
|---|---|---|---|
| Whiskey (4), Eldorite Dust (3), Field Medic Kit (10) | uses | catalog | SHEET (chargesLeft) + **SAMPLE** use pips |
| Dynamite / bundles / keg / lamp oil / tonics (count) | count | catalog | SHEET (count) + **SAMPLE** count pips |
| Harmonica of Soothing Melodies | 1/long | catalog | SHEET (chargesLeft + SSDNSItems.recharge) |
| Lasso of Binding | 1/dawn | catalog | SHEET (item) + **SAMPLE** melee charge pip |
| Ore Scholar's Robe, True-Measure Ore Kit | 1/dawn | catalog | SHEET (item recharge) |
| Night Prospector's Cape, Ore Buyer's Signet, Prospector's Touch | 1/long | catalog | SHEET (item recharge) |
| Cutlass of the Sun's Fury (blind on hit, 1/short rest) | 1/short | catalog (uses.max is null) | **SAMPLE** melee charge pip (featureUses key) |
| The Peace Maker knockout | 1/short rest | peace-maker.js | SHEET (featureUses) + **SAMPLE** pip on the card |
| Instruments: Banjo / Guitar / Accordion | 1/short rest each | BOOK1 L4723–4725 | **SAMPLE** (row for the Storyteller's picked instrument) |
| Instrument: Glass slide | 1/short rest | BOOK1 L4706 | UNTRACKED |

## 7. Bugs the sweep found in existing trackers (all fixed in this PR)

1. Iron Nerve showed 3/long rest from 9th level. **Fixed:** 1 at 9th, 2 at 13th, 3 at 17th.
2. Second Cylinder never became 2 at 17th. **Fixed.**
3. Channel the Creed never scaled to 2 or 3. **Fixed:** 2 at 6th, 3 at 18th.
4. The Storyteller chip "Dying Weave Spellcasting 1/short" was really the instrument's once-per-short-rest DC boost. **Fixed:** it has its own correctly named row, and the old chip is suppressed.
5. Oath Sense ("times/day") and Dust-Lamp Recovery ("once per day") were missed by useRule. **Fixed:** both have rows.
6. Subclass features were never read by useRule (War Priest, Whistle Recovery, Tides of Chaos, Channel Creed oaths). **Fixed:** trackers.js reads `c.subclass`.
7. Bows / crossbows / thrown answered "Empty: reload" and never fired; a natural 1 misfired a bow. **Fixed** (firearms only misfire).
8. table-ux Rage capped at a flat 2 uses and never reset. **Fixed:** follows the Rages column; a long rest resets it.

## 8. Still untracked (not asked for)

Gun Whisperer Relentless, Powder Man charges, Savage Attacker, Inspiring Leader, Glass slide, Improved Smite Lead (+1d8 on every hit).

## 9. Open points for Jessey

- Hidden-AC attacks (the DM decides hit/miss): an armed Smite / Sneak Attack is spent when the dice go to the DM, because the sheet does not hear the verdict back. A "Refund" toast gives the slot / turn use back if the DM calls a miss.
- Sneak Attack checks the PHB weapon rule (finesse or ranged, including thrown). A plain melee hit with an armed Sneak Attack adds nothing, logs why, and still clears the arm.
- A free shot (no target) clears an armed Smite / Sneak Attack without spending anything.
