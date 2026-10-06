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

`pendingJessey`, `tacticsDraft`, `lootSource`, and `proficiencyNote` are stored on the entry and ignored by the fight tools. Long action and legendary text, including a kraken's swallow, Lightning Storm, and a restless pioneer's hit-point drain, stays on the sheet as readable text.
| `spellcasting` | `{ ability, dc, attack, spells, slots }`. Spell names look up mode, damage, and range in the rules data. |
| `traits`, `actions`, `reactions`, `legendary` | `{ name, text }`. `uses` and `recharge` add buttons. |
| `tactics` | One line for the DM, such as "flees at half HP". Shown on the fight row and the sheet. Blank falls through to a trait whose name starts with Tactics or Morale. |
| `loot` | Text. `esDrop` is the Eldorite shards on the body. |

`database.rules.json` does not validate these fields. They live in the bestiary file and in the DM's local table, not as a new player-visible schema.

In a live room the same numbers are copied to `encounter/dm`, which only the DM can read. `encounter/public` keeps the name (or Unknown gunman), turn slot, coarse status, visible conditions, and a `revealed` object for anything the DM turned on. Top-level AC, HP, saves, attacks, traits, tactics, and DCs are rejected on that public node.
