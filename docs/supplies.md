# Food & water (L0188)

The DM runs food and water from the DMCC (Table tab → **Food & water**). 5e PHB rules.

## What existed before (audit)
- **Exhaustion** was already one condition with a level 1–6: the sheet's Conditions tab (level buttons),
  the DMCC condition picker (`#exhLevel`), the room path `rooms/{code}/conditions/{id}`, and
  `activeConditions` on the character. End combat already kept exhaustion.
- It had **no effect on the math**. The text just said "the DM says what it takes away".
- This PR keeps that one condition and makes it count. There's no second exhaustion counter.

## Exhaustion math (each level keeps the ones below)
| Level | Effect | Where |
|---|---|---|
| 1 | Disadvantage on ability checks (initiative too) | `rollCheck` / `rollInitiative` → `rollAdv(mod, "dis")` |
| 2 | Speed halved | badge on Speed, DM snapshot `speed`, map card |
| 3 | Disadvantage on attacks and saves | `SSDNSConditions.disadvantageNote` / `attackMode`, save rolls |
| 4 | HP max halved | badge on HP max, current HP capped, heals and long rest stop at the half, snapshot `hpMax` |
| 5 | Speed 0 | badge, snapshot, map card |
| 6 | Death | HP 0, three failed death saves, banner |

The stored speed and HP max are never changed. Clearing exhaustion puts everything back.
A chosen advantage cancels exhaustion's disadvantage, the same way it already does for attacks.

## Condition toasts
Any condition you gain (from the DM, from yourself, from 0 HP, or from food & water) pops a card at the top of the sheet.
The card says what the condition does, e.g. "DM applied · **Exhaustion 2** · speed halved; disadvantage on ability checks."
It doesn't show for conditions that were already on you when the sheet loads.

## Counts (the DM owns them; the sheet shows them read-only)
The counts come from the item schema (L0188-L0190). `type` stays; these fields are new:
- `tags`: e.g. `food`, `water`, `container`, `drink`, `pack`.
- `meals`: days of food in one item.
- `water`: gallons of drinkable water in one item.
- `capacity`: gallons a container holds, with `fill` on each inventory row.
- `defaultFill` (`full` or `empty`), `fillIncluded` (the listed weight is already the full container) and `mealWeight` (lb per meal in a pack).

End of day finds **anything** tagged food or water in the inventory, whether it came from the store, loot, a pack, or the DM.

- **Food** = the sum of `meals` × count over food-tagged items, plus a half ration left open after a half-rations day.
  Loose 1-meal food is eaten before a pack's food. A pack counts `mealsUsed`, and its weight drops by 2 lb a meal.
- **Water** = water in containers (`fill`) + drink items (`water` × count) + loose gallons (`supplies.water`).
  Drinking empties containers first, then loose water, then drink items.
  DM-given water fills containers first, and any extra is kept as loose gallons. Water weighs 8 lb a gallon.
- Tagged catalog items (final values L0191/L0192, Encounter Bot scrub v1.1):

| Item | Tags | Values |
|---|---|---|
| Hardtack and Jerky (ration) | food | 1 meal, 2 lb |
| Bread (loaf) / Cheese (hunk) / Steak / meat (chunk) | food | ½ meal each, 0 lb, 2 / 10 / 30 ES (new rows + store rows) |
| Big game (deer, ...) | food | DM-set meals (a deer ≈ 6), given through the reward's Meals field; not a store item |
| Waterskin / canteen | water, container | holds 0.5 gal, starts full, the "5 lb full" catalog weight is kept |
| Jug / Bucket / Barrel / Cook pot | water, container | 1 / 3 / 40 / 1 gal, start empty |
| Bottle, empty / Flask / tin cup | water, container | 0.1875 gal (1½ pt) / 0.125 gal (1 pt), start empty |
| Whiskey (bottle) | drink, alcohol | 0 meals, 0 gal: never counted |
| Horse feed (oats/hay/grain) | feed | 1 animal-day (`feedDays`), 5 ES, 10 lb. One portion feeds one horse or pack mule for one campaign day. Never counted as player food. No spoilage. |
| Packs (Trail kit, Claim pack, Alley kit, Saloon kit, Preacher's kit, ...) | none | no tag of their own; the meals and water still inside come from what they unpack into (10 / 10 / 5 / 5 / 2 hardtack + one full waterskin) |

  Not tagged: healing libations, antivenin, blessed water, lamp oil.
- **Doc field mapping**: the scrub doc's `food: { meals }` maps to `meals`. Its `water: { gallons }` maps to `capacity` for a container (the 5e full amount, with per-row `fill`) and to `water` for a drink item. Both forms are accepted on input (`items.js normalize`).
- **Half meals**: rows with ½ meal are eaten first. If a full meal has to be broken for the last half, the other half stays open (`supplies.halfOpen`).
- **Old saves**: when items load, `items.js inferSupply` tags known catalog rows. Hand-typed rows named "rations / hardtack / jerky / pemmican" become food (1 meal), and rows named "waterskin / canteen" become ½-gal containers, starting full.
  Carried weight doesn't change.
- **DM tools**:
  - The Add Item form (Give, or Save to room catalog) has Tags, Meals, Water and Holds fields, plus "Starts full".
  - The Give tab's item reward has optional tags / meals / water gal / holds-gal inputs. With any of them set, the reward becomes a real tagged item: the catalog row with those values added, or a DM-made row.
- `character.supplies = { mode, water (loose gal), daysHungry, halfOpen, pendingSave, last, day, share }`. Old saves get defaults (mode off, share on).

## A day passes (per player)
- Food: 1 ration (½ with half rations). A full day resets the count. Half rations add ½ day without food, and none adds 1.
  Once days without food go past **3 + Con mod** (at least 1), each day adds +1 exhaustion.
- Water: 1 gal (2 on a hot day).
  - Half the need: a DC 15 Con save popup goes to the player. A fail adds +1.
  - Less than half: +1 automatically.
  - Already exhausted: either one is +2.
- Long rest as the day's end: if you ate and drank something, -1 exhaustion (5e).
- **Strict**: the sheet adds exhaustion and asks for the save.
- **Loose**: food and water are still counted, but the DM sees "5e says +N" and an *Apply* button instead.
- If the next day comes while a save is still waiting, that save is rolled with its saved dice first.

## Firebase
No `database.rules.json` change. Everything rides the existing `commands` (type `supplies`),
`players/{uid}/snapshot` and `conditions` paths.

## Sharing with the party (Jessey 2026-10-20)
- Each player has a **Share with party** toggle in their Food & water box. It's on by default, and old saves count as on.
  It's the only thing a player can change in the box.
- At the end of a day, the DMCC plans the sharing before anyone eats. Food and water left over from players who share (after their own day) go to anyone who is short.
  Players who don't share never give anything, but players who share can still cover them.
- Each player's give (-) or get (+) amount rides on that player's own end-of-day command (`adjust`), so the change and the tick happen together.
- The DMCC summary line, the toast and the ledger say who shared what with whom, and who isn't sharing. The table has a **Shares** column.
