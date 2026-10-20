# Bestiary schema (bestiary-v1)

`dm/assets/data/bestiary.json` is a list of creature objects. The `_template` entry is hidden from the Fight list. The DM Command Center reads these fields. It does not invent missing numbers.

| Field | Use |
| --- | --- |
| `id` | Stable id. `_template` is not a creature. |
| `name` | Name on the fight row and the sheet. |
| `ac`, `hp` | Armor class and hit points. `maxHp` starts equal to `hp`. |
| `speed`, `cr` | Shown in the sheet header. |
| `dex` or `abilities.DEX` | Initiative bonus when `initBonus` is blank. |
| `initBonus` | Added to the initiative roll. |
| `abilities` | STR DEX CON INT WIS CHA. Flat `str`/`dex`/… fields are the fallback. |
| `saves` | Bonus overrides. A missing save uses the ability modifier. |
| `skills` | Name to bonus. Only listed skills are buttons. |
| `senses`, `description` | One line each on the sheet. |
| `attacks` | Short summary string for the bestiary card. |
| `atkBonus`, `damage` | Fallback when `attackList` is empty. |
| `attackList` | One object per attack: `name`, `kind`, `toHit` or `bonus`, `damage`, `damageType`, `range`, `capacity`, `misfire`, `notes`, `rider`, `saveDamage`, `grapple`, `saveEffect`, `extraDamage`, `versatile`. |
| `rider` | `{ condition, save, dc, rounds }` on an attack. A save with no condition does not apply a condition. |
| `saveDamage` | `{ save, dc, damage, damageType, onSave }`. `onSave: "half"` deals full damage on a failure and half (rounded down) on a success. |
| `grapple` | `{ escapeDc }`. A hit applies Grappled and shows `Grappled (escape DC X)`. It is not a saving throw. |
| `saveEffect` | `{ save, dc }`. The save result is shown with the attack notes. The DM resolves the effect, such as a hit-point-maximum drain. |
| `extraDamage` | `{ damage, damageType }` rolled and added on a hit. |
| `versatile` | Two-handed damage dice. The attack dialog offers one-handed or two-handed. |
| `group` | `creature`, `generic-folk`, or `named`. The picker labels those Creatures, Folk, and Named. |
| `parked` | Hidden from the picker until Show parked is on. |

`tacticsDraft`, `lootSource`, and `proficiencyNote` may be stored on an entry and are ignored by the fight tools. `pendingJessey` is not a field. Long action and legendary text, including a kraken's swallow, Lightning Storm, and a restless pioneer's hit-point drain, stays on the sheet as readable text.
| `spellcasting` | `{ ability, dc, attack, spells, slots }`. Spell names look up mode, damage, and range in the rules data. |
| `traits`, `actions`, `reactions`, `legendary` | `{ name, text }`. `uses` and `recharge` add buttons. |
| `tactics` | One line for the DM, such as "flees at half HP". Shown on the fight row and the sheet. Blank falls through to a trait whose name starts with Tactics or Morale. |
| `loot` | Text. `esDrop` is the Eldorite shards on the body. |

`database.rules.json` does not validate these fields. They live in the bestiary file and in the DM's local table, not as a new player-visible schema.

In a live room the same numbers are copied to `encounter/dm`, which only the DM can read. `encounter/public` keeps the name (or Unknown gunman), turn slot, coarse status, visible conditions, and a `revealed` object for anything the DM turned on. Top-level AC, HP, saves, attacks, traits, tactics, and DCs are rejected on that public node.

## Item supply fields (0.3.82, L0188-L0190)
Catalog rows and inventory rows may carry these. `type` is unchanged.
- `tags` (string[]): `food`, `water`, `container`, `drink`, `pack`, `feed`, …
- `meals` (days of food per item)
- `water` (gal of drink per item)
- `capacity` (gal a container holds), with `fill` (gal now in that inventory row)
- `defaultFill` (`full` | `empty`), `fillIncluded`, `mealWeight`, `mealsUsed`, `feedDays` (mount feed, animal-days)
- Input also accepts the scrub doc form `food: { meals }` and `water: { gallons }` (container → capacity, drink → water). Packs carry no tags; their meals/capacity are derived from SSDNS_PACK_CONTENTS.
- `character.supplies`: `{ mode: off|loose|strict, water (loose gal), daysHungry, halfOpen, pendingSave, last, day, share }`

## Carry weight extras (item template review, 2026-10-20)
- `summoned` (bool, inventory row of the Saddle of the Phantom Steed only): the Spectral Horse is out and wears the saddle, so the saddle counts as noCarry. Off = carried at 25 lb. Set by Use (casting Phantom Steed) or the row's Summon / Dismiss button; a long rest clears it. There was no summon state before this, so this flag is the summon state.
- `SSDNS_CARRY_WEIGHTS.ammoEach` keys are `type` or `type:caliber`. `arrows:dynamite` = 1.05 lb (1 lb stick + 0.05 lb arrow), so making a dynamite arrow leaves carried weight unchanged.
- Ammo pool types: `buck` and `slug` are separate pools (0.1 lb a shell). Slug shells sell as their own store rows at the buckshot price (BOOK1 L4212). `bigfifty` (.50-90) is its own pool at 0.15 lb a round.

## Room act (L0193, 2026-10-20)
- `rooms/$room/meta/act` (1 | 2 | 3, missing = 1): the campaign act the stores sell for. Set by the DMCC Stores tab "Campaign act" select. No database.rules.json change: meta already accepts extra children and only the DM can write it.
- Store rows (store-items.json) may carry optional act fields. A row without them sells in every act at `price_es`:
  - `minAct` (number): not stocked before that act. The Medium and Heavy ChaosMakers have `minAct: 2`.
  - `acts` (number[]): stocked only in those acts.
  - `actPrices` ({"1": 4000}): store price in that act, with no traveling-merchant markup on top. The Light ChaosMaker has `{"1": 4000}`, a store markup. `price_es` stays the PHB list price (2,000), and so does rules.js.
- `SSDNSStore.forAct(items, act)` applies them when stock is drawn. `gateLines(lines, act, items)` re-checks drafts and live lines on open and when the act changes. Ad-hoc lines with no store row pass through.

See docs/supplies.md.
