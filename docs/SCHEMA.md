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

## Item default UI and the Special UI hook (sheet 0.3.84 / DMCC 0.2.97)

Every item lands with the existing card for its type and feeds the sheet math. No per-item code is needed.
`SSDNSItemUI.classify(item)` (assets/js/item-ui.js) picks the kind, and the first rule that matches wins:

1. A registered Special UI spec with `kind`.
2. `itemKind`.
3. `type: "weapon"`, read through `SSDNSTrackers.kindOf`:
   - firearm → `firearm`
   - loaded → `crossbow`, or `blowpipe` for needles
   - quiver → `bow`, or `sling` for stones, or `crossbow` for bolts
   - thrown → `thrown`
   - anything else → `melee`
4. `ammo.type` → `ammo`.
5. `armorId` or `wear: armor` → `armor`. `wear: shield` → `shield`. Any other `wear` → `apparel`.
6. Tags:
   - `pack`, or pack contents → `pack`
   - `food`, `drink`, or `meals` → `food`
   - `water`, `container`, `water`, or `capacity` → `water`
7. `noCarry`, or shelf "Mounts & tack" → `mount`. Shelf Tools, Instruments or Foci → `tool`.
8. By `type`: `quest`, `scroll`, `explosive`. A `consumable` is `food` or `water` if its name says so, otherwise `consumable`.
9. A gear item with `uses.max` → `tool`. Everything else → `gear` (a generic row with weight).

| kind | Lands as / feeds |
|---|---|
| firearm | Gun card: chambers, misfire, ammo pool, jam/fouled/dirty |
| bow / crossbow / blowpipe / sling | A gun-slot card: quiver + arrow types, or loaded + bolts/needles, or a stone pouch |
| thrown / melee | Melee card (thrown pips, Recover) |
| ammo | `character.ammo[{type, caliber, count}]`. There is no item row |
| armor | `character.armor = armorId` (rules.js row: base, Dex cap, Str, stealth) + the paper-doll armor slot. A magic +N goes in `bonuses.ac` |
| shield | `character.shield = true` (+2) + the doll shield slot |
| apparel | Its paper-doll slot (`bonuses`: STR..CHA, ac, init, speed, rangedAtk) |
| food / water | Supplies numbers (`tags`, `meals`, `water`, `capacity`; the #105 field names) |
| tool / consumable / scroll / explosive | Uses + recharge, and Use (roll) |
| pack | Unpack (`contents: [[catalogId, n]]`, or `SSDNS_PACK_CONTENTS`) |
| mount | Not carried (`noCarry`) |
| gear | A generic item row with its weight |

New optional item fields. All of them are absent on old saves, so old saves load unchanged.

| Field | Meaning |
|---|---|
| `itemKind` | A kind from the table above. Set by the Add Item form's "What is it?" picker. |
| `ui` | **Special UI** key. Leave it blank for the default card. |
| `armorId` | A rules.js armor id, which feeds AC. |
| `ammo` | `{type, caliber, per}` |
| `contents` | `[[catalogId, n]]` |
| `dirty` | A given gun lands Dirty (loot guns). |
| `grantId` | The DM reward id, used for undo. |

**Special UI hook.** A special gun or item (later, e.g. the LeGloss Revolver; never "LeMat") can add controls to the standard card, or swap in its own card, without forking the gun card.

```js
SSDNSItemUI.register("<item id | weapon id | ui key>", {
  kind: "firearm",                  // optional: force the default kind
  extend: function (host, ctx) {},  // host = .itemui-extra inside the standard card
  replace: function (host, ctx) {}  // host = .itemui-replace; the card gets .itemui-replaced
});
SSDNSItemUI.on("quiver", function (cardEl, ctx) {});  // per-card hook ("gun", "melee", "quiver", "loaded", "thrown", "firearm")
```

- The gun and melee card painters (`trackers.js paint`) call `SSDNSItemUI.decorate(card, ctx)` after every paint, so renderers must be idempotent.
- `ctx` is `{card, kind, index, weapon, character, item}`.
- A rules row or a runtime-pushed weapon row may also carry `ui`.

**DMCC typed give.**
- The Give tab (`#rewItemBuilder`) and the player drawer (`#detailItemBuilder`) handle text that matches nothing (no catalog row, no rules weapon, no ammo pack). For that text they show a compact Add Item form, and the DM must pick a kind and enter a weight. The command is `reward_item {text, item, qty, grantId}`.
- Ammo text such as "Arrows (20)" is sent as `reward_item {ammo: {type, caliber, qty}}` and fills the pool (C11).
- A firearm can be sent with `dirty: true`.
- Older sheets ignore `item`/`ammo` and fall back to the text line.

## Player Give (sheet 0.3.86 / DMCC 0.2.99)

Loot spec v1.1 §5.1 and §5.4 (K1, K3). The code is in `assets/js/give.js` (rules, broker and applies, which are pure), `assets/js/give-sheet.js` (sheet UI and watchers) and `dm/assets/js/give-dm.js` (DMCC post office, open-transfers list and the Give-tab inventory panel). **No database.rules.json change.**

| Step | Who | Path (all create-only for players) | Key |
|---|---|---|---|
| Offer | giver sheet | `encounter/requests/<xferId>` `{ts, from, targetId, amount, kind:"give", xferId, give:item\|ammo\|es, qty, uid?, item?(snapshot), ammo?}` | `xfer_<time><rand>` |
| Ledger row first | DMCC | `ledger/<xferId>` `{type:"transfer", via:"give", state, fromPlayer, toPlayer, what, legs{badd,arem}, item/ammo, qty}` | same ID |
| Tell the receiver | DMCC | `inbox/<to>/xo_<xferId>` `{type:"give_offer", payload:{xferId}}` | |
| Answer | receiver | `encounter/requests/<xferId>_reply_<uid>` `{answer: accept\|decline}` | |
| Cancel | giver | `encounter/requests/<xferId>_cancel_<uid>` | |
| Landed | receiver | `encounter/requests/<xferId>_badd_<uid>` | |
| Removed | giver | `encounter/requests/<xferId>_arem_<uid>` | |
| Table line | DMCC | `chat/xfer_<xferId>` "Dust gives Dolan 20 arrows" | |

The states are `offered → accepted → added → done`, or `declined`, `cancelled` (by the giver, or by the DM while offered or accepted) or `rejected` (failed the DMCC check: locked inventory on either side, DM-only, still worn, not enough left, receiver not in the room).

- The DMCC reads each ledger row fresh before acting, handles one ID at a time and re-checks every 15 s (repair).
- The receiver adds only at `accepted`. The giver removes only at `added`, which is after the receiver applied.
- Each apply is marked in `character.xfers[<xferId>].applied.{badd,arem,bundo}` in the same save as the item change. ES also goes through the sheet's claimGrant (`es:xfer:<id>:<leg>`), so a double tap, a refresh, a resent row or a second device changes nothing.
- A DM cancel that races the receiver's apply rolls the add back (`bundo`).

Character fields (all optional, so old saves load):

- `character.xfers` is `{ <xferId>: {role: from|to, state, kind, qty, uid?, ammo?, other, otherName, what, label, answered?, cancelling?, applied:{}} }`. It keeps the last 40 entries.
- An open outgoing transfer **holds** what it offers: the row shows "Offered to …", and Use, Drop, Unpack and Give are hidden.
- A received item keeps every field (weight, Dirty, uses and chargesLeft, ammo, tags, quality…). Its uid is `x<xferId>`, and it lands through `SSDNSItems.add`, so it gets its default UI (a weapon goes to a slot). A given weapon frees the giver's weapon slot.
- The snapshot drops `equipSlot`, `attuned` and `attunePending`.

The player snapshot also gains `carry {carried, capacity, over, on}` and `giving [{id, kind, uid, qty, to, label, slotKind?, index?}]`, plus `attunePending`, `dirty` and `stack` on items and `dmOnly` on `guns[]` / `melee[]`. The DMCC uses them for the Give-tab inventory panel.

### Slot gives (`give: "slot"`)

A gun, melee, bow or thrown weapon whose card has **no inventory row** gets a Give button on its card on the Gear page. It uses the same transfer ID, ledger-first flow, holds and once-only applies.

- Request and ledger rows carry `slot {slotKind: gun|melee, index, weapon, name, state, record?, dmOnly?, sig?}`. Each request is one weapon (`qty` 1).
- **Loaded rounds go with the gun.** `state` is the whole slot: `chambers`, `loaded`, hex shells, `lockedChambers`, `dirty`, `jammed`, `fouled`, `cracked`, `ruined`, `misStreak`, `mod`, `capacity`, `chamber`, `tier`, `load`, `engraving`, conditions, arrow type, `ui`, and any custom field. Only the giver's own hand state stays behind: `equipped`, `drawn`, `twoHand`, `attackMode`, `ammoPool` (an index into the giver's pools) and the pending-d4 fields.
- A created weapon's record rides along as `slot.record`. `SSDNSCustomWeapons.syncCharacter` re-registers it on load.
- **Blocks:**
  - a pending misfire d4 (`pendingD4`), the sheet's only mid-action jam state; a plain jam, Dirty or Fouled does not block;
  - DM-only;
  - Lock inventory, on either side;
  - an equipped weapon while combat locks equipment.
- `sig` covers the gun's loaded count, chambers and jam/Dirty/Foul/ruin/crack state. The DMCC rejects the accept if it changed after the offer (fired, reloaded or cleaned), so the offer has to be made again.
- While the weapon is offered, the card shows "Offered to …" with a Cancel button, and its weapon picker is disabled.
- **The receiver** gets the first free slot of the same kind (`gun` or `melee`, at most 4), with `equipped:false`, then the usual auto-equip. The slot is tagged `gotBy:<xferId>` for a cancel rollback.
  - If every slot of that kind is full, it lands as an inventory row instead: `type:"weapon"`, `weaponId`, `parkedSlot:true`, `slotState{slotKind, state}`. **To a slot** puts it back into a free slot with its state.
- **The giver's slot** goes back to blank. If the player moved the weapon, the first slot holding it is used.
- **A weapon that has an inventory row** gives through that row; the card's Give opens the row's picker. When the last one goes, the row snapshot carries `slotState` (with `sig`), and the receiver's landed slot gets that state. If the receiver's slots are full, the row stays a row (`noLand`), instead of landing on top of slot 1.

### Attunement (0.3.86)

These are the existing `attune` / `attuned` / `attuneCap` (default 3) fields.

- A player's **Attune** now sets `attunePending`, which counts toward the cap. The next short or long rest (`SSDNSSheet.applyRest`) finishes it.
- Ending attunement is instant. The DM's `item_mod {op:"attune"}` stays instant.
- An item with `attune: true` can't be **Used** until it is `attuned`. This applies to every catalog row with the flag. The Saddle of the Phantom Steed now has `attune: true, rarity: "Rare"`.
- Attunement ends when the item changes hands.
- The saddle's `summoned` toggle checks `attuned` the same way: the Spectral Horse can't be summoned (toggle or Use) until the saddle is attuned; dismissing always works. Ending attunement dismisses the horse, and a given saddle arrives with `summoned` cleared (give.js strips it with `attuned`).

### Focus slot by Calling (0.3.108, L0197)

- **`item.soulBound`** (catalog / item, boolean). The item never leaves its owner: no Drop (`canDrop` is false unless a DM override deletes it), no sell, no Give or trade (`SSDNSGive.canOffer` / `validate` refuse), no rob or loot (`canRob` and `SSDNSGrab.plan` refuse, even with a DM override). Its row shows a `soul-bound` tag and no Drop or Give button. Today only `borrowed-iron` has it.
- **`borrowed-iron`** catalog item: `type: gear`, `shelf: Foci`, `category: focus`, `forSale: false`, `price: null`, `weight: 0` (BOOK1 gives none), `dmPlace: true` (not in the player Add Item list). No store row (never sold). Kits add it through the `"Borrowed Iron (pact focus)"` kit line.
- **`character.borrowedIronAway`** `{at, turn}`: the Borrowed Iron is lost or disarmed (Focus slot picker, in combat). Pact Seeker casting is blocked until the start of the owner's next turn (`SSDNSFocus.onTurn`), or when combat ends. Out of combat it never stays away ("a heartbeat later").
- **`character.ironRevealed`** `true | absent` (0.3.100; unread since 0.3.108): legacy DM-reveal flag (old DMCC "Reveal to player", command `iron_reveal`). Since 0.3.108 (Jessey 2026-10-21 5:47/5:50 PM CT, a sheet-only choice that intentionally differs from BOOK1 L2060) the sheet shows the real iron from the Pact pick: the Pact name (`character.subclass`) picks the iron's name, tile and engraving (`assets/js/iron-art.js`), labelled "<iron> — <Pact class>". Only a Pact Seeker with no Pact yet shows the generic Borrowed Iron art. The flag stays on old saves and is ignored (no migration); an old DMCC's `iron_reveal` still saves it harmlessly. Art only, no mechanics.
- **`character.ironSlot`** `"revolver_1" | "revolver_2" | "long_gun" | "melee" | ""` (0.3.108, Jessey 2026-10-20 9:53 PM): the paper-doll weapon slot the Pact Seeker's Borrowed Iron prefers. Display only: if a gun sits there it takes the next free slot (`SSDNSDoll.ironSlot`). The Focus slot shows the patron (`assets/img/items/patron/<pact slug>.webp`, fallback the generic focus tile) and can't be unequipped. `character.ironSlotMigrated` `1` once an older save was moved; `character.ironSlotNote` is set when no weapon slot was free (the iron is still in hand).
- **`character.equipMigrated: 2`**: a sheet already at 1 converts only the exact `"Borrowed Iron (pact focus)"` Notes line, and its notes before that are kept in `character.equipmentBefore0394`. Every Pact Seeker gets one Borrowed Iron item if it has none.
- **Focus slot (`focus_borrowed_iron`)**, `SSDNSDoll.focusState(c)`: a Pact Seeker always shows the Borrowed Iron. A Hexslinger shows a read-only mirror of the Caster Gun (Blacksnake / Hognose) equipped in Pistol L, else Pistol R. It is not a second copy and adds no weight. With none equipped it reads "No Caster Gun equipped, can't cast." Other Callings are unchanged (their instrument focus).
- **Cast block** (`SSDNSFocus.castBlock(c)`): it disables only `#btnHexRoll`, `#btnPactShot`, `[data-cast]` and `[data-spell-cast]`, with the reason as the title and a short note line. Every sheet cast path checks it too. No sheet data is changed.

## Asset library (N86, sheet 0.3.173 / DMCC 0.2.186)

DM-only definitions live at `rooms/$room/map/dm/assetLibrary/<defId>` (`v: 1`). The shape is `name`, `size` (1–4), `image`, `images[]`, `sfx`, `props` (`light`, `toggle`, `gate`, `health`, `trap`, `range`, `links`, `immunities`, `timer`), `interact` (`reachFt`, `actions`, `dmApprove`), `targetable`, `hiddenFromPlayers`, `notes`. Export/import uses `format: "ssdns-asset-pack"`. Encounter Pack v1 (sheet 0.3.201) is that same pack at `assets/packs/encounter-pack-v1.ssdns-asset-pack.json`, loaded by the Assets button. It does not add fields. `database.rules.json` is unchanged: `map/dm` is already DM-only, and a player Interact row is a normal `tableFeed` create (`kind: "sfx"`, `event: "asset"`, `assetReq`).

A placed copy is a map token `kind: "asset"` with `assetDefId` and `asset.state` `{on, open, lit, hp, armedAtRound, firesAtRound}`. `map/public/tokens/<id>.asset` is the sanitized view: name, size, current image, on/open/lit, action labels, `hpPct`, `blocksMove`, `reachFt`. Trap numbers, notes, immunities, and raw hp stay on the DM token. `SSDNSAssets.onRound(round)` runs at the DMCC round wrap.

## Doors and bombs (N87, sheet 0.3.175 / DMCC 0.2.188)

N59 door walls add `locked` (bool), `lockDc` (number), `ajar` (bool), and `trapOnFail` (bool, stored only). Peek sets `ajar`: sight passes, movement stays blocked. Peek again or Close shuts it. Open on a locked door is refused. Lockpick is Dex + thieves' tools versus `lockDc`. Failure leaves the door locked and does not spring `trapOnFail`.

`asset.props.timer` is `{mode: ""|"instant"|"fuse"|"plunger"|"timer", fuseRounds}`. `asset.state` adds `waiting` and `countdownVisible`. A fuse of N sets `firesAtRound = armedAtRound + N`. `asset.effects[]` is `explosion` (`radiusFt`, `damage`, `damageType`, `save`, `dc`, `halfOnSave`), `unlock` or `open` (`targets` are asset ids or door refs), `condition`, `sfx`, or `clear`. Explosion damage goes through the existing save and `applyPlayerHit` path. Players see `turnsLeft` only when `countdownVisible` is set.

## Showcase map (N90, sheet 0.3.178 / DMCC 0.2.191)

`scn_dry_fork` (Dry Fork Water Stop) is a built-in scene on `SSDNS_MAP_PACKS`, same switch as the other My Maps built-ins. Grid is 40×30 at 70 px. Walls live on the scene in the pack and in `map/packs/showcase-dry-fork/showcase-dry-fork.walls.json`. The first open copies them onto `map/public/scenes/scn_dry_fork` when that scene has no walls. Import Walls prefills from the pack. The draft `showcase-dry-fork.map.json` is not a runtime scene and places no tokens.
