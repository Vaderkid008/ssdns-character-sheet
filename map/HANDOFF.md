# Map gun actions — sheet 0.3.31 / DMCC 0.2.44

Each gun row on the player map card, and on the DM card while the DM is acting for that player, uses the Gear functions for the spare-pile chooser (`poolsForGun` / `setAmmoPool` / `reload`), Unload (`unloadGunIndex`; the DM card already had it), Tactical Reload (`tacticalReload`; the player card already had it), and Advantage / Disadvantage. Advantage and Disadvantage are checkboxes: one, the other, or both off. The choice is stored on the gun, written into the Gear select, and published with the snapshot, so the next attack uses `gunAttackMode` the same way the Gear select did. Hex shell and Cast through gun appear only when the calling is Hexslinger and the weapon is a caster gun (`hexShells`). They call `loadHexAt` / `loadHexShell` and `SSDNSGunCast`. Gunsmith mods and capacity upgrades stay on the Gear tab. `assets/data/rules.js` and `database.rules.json` did not change.

# Map gun Clean — sheet 0.3.31 / DMCC 0.2.44

Each gun row on the player map card, and on the DM card while the DM is acting for that player, shows Clean when `SSDNSMisfire.cleanOptions` has a method (dirty, fouled, jammed, or ruined). The button opens the same picker as the Gear tab and runs `SSDNSApp.cleanGun` / `applyCleanOption`, so the log line, the ES charge, and the Dirty / Fouled / streak reset match. A DM clean is a `gun` command with `op: "clean"`; the player's sheet applies it and publishes the snapshot. A streak by itself still has no clean method, so the button stays hidden. `assets/data/rules.js` and `database.rules.json` did not change.

# Floating map chat — sheet 0.3.31 / DMCC 0.2.44

Pop out opens a floating chat panel over the map, on the player sheet and on DMCC. Drag it by the header. Resize it from the corner. It stays inside the map, and the position and size are remembered in `ssdns.map.chatFloat`, the same way the player card remembers `ssdns.playerCard`. Dock puts the feed back on the map. Open in new tab still opens the separate chat window. A phone narrower than 600px uses the full-screen overlay instead of the float. The opener stays the only Firebase client, so a line is sent once.

The float, the overlay, and the new tab color the speaker with `SSDNSApplied.tokenColorFor`, filter All / Rolls / Talk on this screen only (`ssdns.map.chatFilter`), and show the player's roll math (d20, labeled bonuses, total, and damage) without target AC or hit/miss. The docked chat still has the unread badge. `assets/data/rules.js` and `database.rules.json` did not change.

Range buttons, the red Disadvantage label, and the band highlight still read the token positions on this screen during a drag. A remote echo does not pull the token back. While a token is dragged, its cell is written about six times a second, and only when the cell changed. A hidden token is written only under `map/dm`.

# Range on every fire path — sheet 0.3.29 / DMCC 0.2.42

Cylinder, tube, and attack-button shots use the same range check as the map attack buttons. A shot that would roll at disadvantage asks first: `This attack is with Disadvantage.  Continue?` Cancel spends nothing, posts nothing, and plays no sound. Continue is the first moment a gunshot can play. The map attack buttons add a red `Disadvantage` when the selected target is in a disadvantage band. `assets/data/rules.js` and `database.rules.json` did not change.

# Gear tab — sheet 0.3.29 / DMCC 0.2.41

The sheet Gear tab is two columns. A red target bar with a bullseye sits at the top and holds the same `#atkTarget` select the attack code already uses. The left column is weapon cards (guns, melee, explosives): name, Atk/Dmg/Range/Cap, a photo placeholder, cylinder or tube art, Reload/Unload, an ammo-pool dropdown, mod and capacity, then Roll, TR, hex shell, cast-through-gun, and the jam flags. The right column is armor, then the ammo piles, holster, notes, and the equipment list. DMCC stayed at 0.2.41. `assets/data/rules.js` and `database.rules.json` did not change.

# Range, sync, and the attack card — sheet 0.3.28 / DMCC 0.2.41

`database.rules.json` did not change. `assets/data/rules.js` did not change.

Map attacks that have a target token use the grid distance (5 ft per cell). Normal-to-long adds disadvantage on the same advantage/disadvantage path, so a manual Advantage cancels it. Past the limit the button reads `Out of range` for a weapon and `out of range` for a spell, and the attack does not roll. Rifles within 5 ft of a hostile, and the Big Fifty within 30 ft, take disadvantage. Close-quarters guns are exempt. A scope drops the long-band disadvantage until the shooter moves. Sharpshooter and Long-Range Hex still apply. The DM card has `Range: Auto`, `Ignore range`, and `Force DIS`. An override is logged to chat. Players do not get that control. Attacks with no map or no target roll as they did before. Range rings stay off until Show range / Show my range is turned on. The check still runs when the rings are hidden.

A spell or a hexlead round draws one purple ring, labeled `Spell · N ft`. Long-Range Hex doubles attack-roll spells and adds `x2 Long-Range Hex`. Self draws nothing. Touch draws 5 ft. In spell mode a hostile within 5 ft lights a red warning ring and the card notes `DIS: hostile within 5 ft`. When a target is chosen, that target's band is drawn thicker. Caster-gun .50-90 does not take the Big Fifty close band.

The player's sheet is the source of truth for HP, conditions, chambers, and spare ammo. A DM edit is a command. Unchanged values are not written again, a stale snapshot cannot overwrite an in-flight edit, and Down / Unconscious does not re-fire once it is already set. A player reload shows on the DM card and the Fight tab. A DM reload uses the sheet reload for that row's weapon, not the first gun. Spare rounds sit next to Reload. No spare rounds, or an empty gun, toasts the DM (`Steve: no Navy rounds left to reload`, `empty, reload first`) and logs the line to chat.

The chat attack card shows both d20 faces when advantage or disadvantage applies, marks the face that counted, labels each bonus, and shows the total against AC for the DM. Players still see only HIT or MISS when enemy AC is hidden. Damage lists the dice, the modifiers, and the type. Hit, miss, and crit sounds look up a per-weapon override, then a category default for melee, gun, arrow, or spell, then stay silent. Nothing new was added under `assets/sfx` except the config. Mute still wins.

Cylinder art keeps a square aspect in the narrow card. The tube keeps its height. Names truncate, and the buttons wrap.

```cmd
node tools/test-pr48.mjs
node tools/test-range-rings.mjs
node tools/test-sfx-pack.mjs
```

# Player card — sheet 0.3.27 / DMCC 0.2.40

`database.rules.json` did not change. `assets/data/rules.js` did not change. Rolls still go through the sheet buttons and the DM Fight tab.

The player's floating card keeps Ping, Ruler, Ghost Plan, Cancel plan, and Torch in a compact row, with Show my range under them. Below that it matches the DM token card: name, AC, HP, speed, and an HP bar for the player's own sheet only. Attacks read `name +hit damage [ammo]`. Cylinder rows show the rounds and a target list. That target is written to the sheet's attack target, then the existing chamber button fires. Reload and TR use the same sheet buttons. Spells, on this card and on the DM card, sit in a dropdown that starts closed and remembers whether it was opened. A list with more than one spell level is grouped. Label, color, and Hidden sit in Settings.

The old sheet dump is gone: unsold labels, prices, empty melee slots, and the extra Cast button on a gun.

The ammo pictures are on by default for the Gear tab, the Fight tab, and the map. `?ammoDisplay=0` or `localStorage ssdns.ammoDisplay = "off"` puts the old dots back. `?ammoDisplay=1` or `"on"` forces the pictures. Cylinder holes scale with the chamber count so they fill the face. Lever-tube bullets are bronze. Shotgun shells are side-view cylinders: a brass base and a red hull, long and thin for .410, medium for 12 gauge, largest for 10 gauge. A slug is the same shape in blue with an S.

```cmd
node tools/test-player-card.mjs
node tools/test-map-m2.mjs
node tools/test-map-spells.mjs
```

Cache queries on the touched sheet files are `0.3.27-card`. The DMCC copies are `0.2.40-card`.

# Range rings and bullet art — sheet 0.3.26 / DMCC 0.2.39

`database.rules.json` did not change. `assets/data/rules.js` did not change. Range rings are a picture on the map. They do not change attack rolls, misfires, or reloads.

## Range rings

Green is normal range. Orange is a disadvantage band. A red line is the distance you cannot reach past.

A rifle has an orange disk inside 5 ft. The Big Fifty's orange disk goes out to 30 ft, including when Sharpshooter removes the long-range band. A carbine with close quarters has no inner disk until a scope is fitted, which takes close quarters away. A scope removes the long-range orange band when that token has not moved this turn. Moving the token brings the orange band back until that token's turn starts again.

Melee is a green ring at 5 ft, or 10 ft when the weapon has reach, with a red ring just past it. A thrown weapon shows that melee ring and its thrown normal and long bands. A shotgun cone is a green disk out to the cone and a red line at that edge. Long-Range Hex doubles an attack spell's range. Other spells are not drawn.

The rings stay off until someone turns them on. A player uses Show my range on the floating card, for the equipped gun, melee weapon, or attack spell. The DM uses Show range on the selected token and on that token's card. The list is that token's attacks, plus attack spells when the sheet has them.

## Bullet art

Still behind the ammo display flag, which stays off. Dots use the Fight tab's primer: a brass case head and a center primer, colored by shell size (light, medium, heavy, and the special rounds). A lever tube shows horizontal brass cartridges. A shotgun, including a break-action and a lever shotgun while it is reloading, shows shotgun shells. Clicking the tube, or any round in it, spends the leftmost loaded round through the same fire button the screen already used. A tube of 10 or more rounds wraps onto two short rows.

```cmd
node tools/test-range-rings.mjs
node tools/test-ammo-display.mjs
```

Cache queries on the touched sheet files are `0.3.26-range`. The DMCC copies are `0.2.39-range`.

# Map card — sheet 0.3.25 / DMCC 0.2.38

`database.rules.json` did not change. HP, hide, and notes stay off the public token. Token pictures use the existing `image` field plus static files in `map/tokenImages/`. There is no new database path.

## What it is

The DM sees an HP bar under a token and in the token card. Players do not. The card's Down button uses the Fight tab's mark-down path: 0 HP, Unconscious, Down, and a fresh death-save tally. Healing back above 0 clears Unconscious, Down, and the tally through that same path.

Act for player is a switch on a player card. Attacks and spells still go through the existing strike and cast code, and the log says `DM acting for <character>`.

The player's right-hand map toolbar is gone. A floating card holds the label, color, Hidden switch, ping, ruler, torch, ghost plan, and sheet actions. It drags, minimizes, and remembers its place.

Fog keeps Undo, Redo, Shift-select, and Delete selection. The history list is gone. Delete selection with nothing selected says `Hold Shift and use Erase to make a selection.`

The token button is Hide/Reveal. Each condition chip in the DM card has an x that removes it the same way the Fight tab does, with a ledger line and Undo.

Token color is a named list with a swatch, plus Custom. Token pictures default to a sheet portrait or a pre-cropped portrait in `map/tokenImages/` (top-biased, small WebP). A picture on another host that the browser will not export stays as the original URL. The DM can replace any token image with the cropper. Fit covers the circle. Zooming out still exports pixels. Players cannot write their own token image.

```cmd
node tools/test-token-crop.mjs
node tools/test-map-card.mjs
node tools/test-token-sync.mjs
```

Cache queries: map CSS, map JS, token-crop.js, and the map host are `0.3.25-card` on the sheet and `0.2.38-card` on the DMCC. `v2.js` is `0.2.38-card`.

# Ammo display framework — sheet 0.3.24 / DMCC 0.2.37

`database.rules.json` did not change. No new database path. The flag stays off.

## What it is

`assets/js/ammo-display.js` draws one picture from the gun you already have. The Gear tab, the Fight tab's current turn, the turn strip, and the map drawer call it. Each chamber button keeps the attributes those screens already listen for (`data-fire`, `data-strip-fire`, `data-cyl-fire`, `data-act="chamber"`). Spending, loading, and misfire math are unchanged. The target menu stays next to the cylinder. With the flag off, the Fight tab list does not gain a new row and the old dots stay.

The flag is off unless `window.SSDNS_AMMO_DISPLAY` is true, `localStorage.ssdns.ammoDisplay` is `"on"`, or the URL has `ammoDisplay=1`. While it is off, those three screens keep the old dots.

## Types

- `cylinder` — round SVG, notched rim, center pin. Chambers sit on a circle. Capacity comes from the gun, including 6, 7, and 8.
- `tube` — horizontal magazine. Rounds sit in a row. The follower and spring move as rounds empty.
- `dots` — the old row, for everything else.

`ammoDisplay` on the gun or attack overrides the pick. Otherwise the weapon `action` decides: revolver or caster cylinder becomes a cylinder, lever or tube becomes a tube. A pepperbox stays dots. If the attack has no action, the name is used the same way, and a catalog id is looked up in the rules already loaded on the page.

Loaded, spent, and misfire/jam are three chamber states. A gun-level `jammed` flag marks the whole picture.

## Where to look

`map/ammo-display.html` draws each type without turning the flag on for the sheet. Click a chamber there and only that picture changes.

```cmd
node tools/test-ammo-display.mjs
```

That covers the flag, the type pick, the override, 6/7/8 cylinders, the tube follower, the dot fallback, and a click that still reaches the existing attribute. `node tools/test-map-spells.mjs` still sees the one-row dots while the flag is off.

Cache queries: `ammo-display.js`, `ammo-display.css`, and `app.js` are `0.3.24-ammo` on the sheet. DMCC `ammo-display.js`, `ammo-display.css`, `v2.js`, and the map JS are `0.2.37-ammo`.

# Token sync and enemy chamber fire — sheet 0.3.23 / DMCC 0.2.36

`database.rules.json` did not change. Distance and range are unchanged.

A player token id is `ply_` plus the player id, with any character outside `A-Za-z0-9_-` replaced by `_`. The DM waits for the tokens snapshot and a centered view before placing party tokens, so a remount does not invent a second id or drop the token on the view center. The drawer treats `ownerUid` as the card id. Link to… for a player who already has a token keeps `ply_` and deletes the extra. A boot also removes an older duplicate and keeps the `ply_` square.

A DM drag writes `pos` as `{x,y}` only. Watchers now hear that position change, and `seq` / `by` fall back to the token when the position object has neither.

On a DM enemy card, a cylinder chamber fires as that token's own combatant through the existing Fight attack (`SSDNSMapFight.attack` → `cardStrike`). The log names that enemy, the roll is that enemy's, one loaded round is spent, and the weapon's sound plays. ChaosMaker Medium maps to the revolver cue. A target menu sits next to the cylinder and defaults to the last or selected target. Attack buttons still use their old target step: the map waits for a token click, and the fight strip still opens the strike dialog. The unload/load chamber API is unchanged.

```cmd
node tools/test-token-sync.mjs
node tools/test-map-fight.mjs
node tools/test-combat-targets.mjs
```

`test-token-sync.mjs` runs two clients on one fake database: join, DM move to the player, player move to the DM, reload, Link reuse, and duplicate cleanup. Cache queries on the changed map, host, firebase, fight, and sound files are `0.3.23-sync` on the sheet and `0.2.36-sync` on the DMCC.

# Fog Square and polygons with more than three corners — sheet 0.3.22 / DMCC 0.2.35

Same draft. Versions stayed. `database.rules.json` did not change. Fog stays on the existing scene.

## Polygon

Reveal Poly and Hide Poly were not capped at three corners. A test now places five corners and closes with Enter, then places four and closes by clicking the first point. Both stay open until that close. The stored shape keeps every corner.

## Square

Reveal and Hide each have a Square choice. A click reveals or hides the one grid cell under the cursor. A drag paints each cell the pointer enters. Each cell is its own fog shape, so Erase can delete one. The drag is one history step, so Undo removes that whole drag. Preview and full screen use the same handler. An empty room can take squares. Players get them on the existing scene. A reveal square is also written into `fogRects`.

```cmd
node tools/test-map-fog.mjs
```

That covers the five-corner polygon, the four-corner close, one square, a three-cell drag, undo of the drag, erase of the cell, a player who sees a token in the square and not one outside, and a hide square in full screen.

Map JS cache query is `0.3.22-square` on the sheet and `0.2.35-square` on the DMCC.

# Drawer cylinder on one row — sheet 0.3.22 / DMCC 0.2.35

Same draft. Versions stayed. `database.rules.json` did not change.

The map drawer CYLINDER row wrapped the sixth chamber. The drawer is 260px wide, and its button style added padding and a 32px minimum height on top of each 14px dot, so the name plus six chambers plus the count did not fit.

The chambers now sit in one `.chamber-dots` group that does not wrap. The gun name ellipsizes. The count stays on the same line. Token badges and the Fight-tab strip use their own rules and are unchanged.

Cache queries only: map CSS and JS are `0.3.22-cylrow` on the sheet and `0.2.35-cylrow` on the DMCC.

```cmd
node tools/test-map-spells.mjs
```

`cyl.oneRow` checks the six chambers share one group. `cyl.nowrap` checks the drawer row does not wrap.

# Big Fifty class and Cross-Draw — sheet 0.3.22 / DMCC 0.2.35

Same draft. Versions stayed. `database.rules.json` did not change.

## Exact changes

- `assets/data/rules.js` — Bison Big Fifty Buffalo Rifle. The only class moved from `tiers.medium` / `rounds.medium` to `tiers.heavy` / `rounds.heavy`. Damage stays 3d10, range 150/600, misfire 1–5. `roundTiers["big bore"]` lists `.50-90` under Heavy. The Medium list for big bore is empty.
- `assets/data/rules.js` — Cross-Draw Holster. `perk` and `notes` now say the +1 first-shot bonus applies only while seated, mounted, or driving, and the note says it does not apply on foot. `firstShot` stays 1. `initBonus` stays 1. No other holster text or numbers changed.
- `assets/js/app.js` — The old id `bison-big-fifty-50-90` migrates to Heavy. A saved chamber whose tier is no longer on that gun is rewritten to the current tier, so a Medium Big Fifty becomes `heavy|.50-90`.
- `assets/js/app.js` — Cross-Draw's first-shot bonus is added only when a pistol rides in the rig and `character.seated` or `character.mounted` is on. `character.seated` is the existing "Seated or driving" checkbox. No new toggle. The holster line repeats the perk and then says "That bonus is on." or "That bonus is off." Belt rigs still lose their first-shot bonus while seated or mounted. Pommel initiative is still mounted only.
- `dm/assets/data/store-items.json` — The Big Fifty store note says Heavy .50-90. The Cross-Draw store note states the same first-shot rule. DMCC lookup uses `rules.js`, so the gun line reads `heavy: 3d10`.
- Cache queries only: sheet `rules.js` and `app.js` are `0.3.22-class`. DMCC `rules.js`, `v2.js`, and the store JSON fetch are `0.2.35-class`.

## Check

```cmd
node tools/test-item8.mjs
```

That covers the Heavy class, the unchanged 3d10 line, the store notes, the other holsters' bonuses, Cross-Draw off on foot and on while seated or mounted, a Mexican Loop that still works on foot, and a saved Medium chamber becoming Heavy. `node tools/test-round13.mjs` and `node tools/test-store-v2.mjs` still pass.

Browser: the Gear tab chamber reads "Heavy · .50-90" and damage is 3d10 piercing. The Cross-Draw line says the bonus is off until Seated or driving is ticked, then it says the bonus is on. DMCC Lookup for Big Fifty shows `heavy: 3d10`.

# Fog tools — sheet 0.3.22 / DMCC 0.2.35

Same draft. Versions stayed. `database.rules.json` did not change. Fog stays a field on the existing scene (`map/public/scenes` and `map/dm/scenes`).

## What changed

The left bar no longer cycles one Fog button, and it no longer has a one-step Undo Fog. Reveal and Hide are separate tools. Each has a Box, Poly, or Brush picker, and the button name is the action plus the shape (`Reveal: Poly`, `Hide: Box`).

Each placement is one entry in `scene.fogShapes`: `{ id, op, kind }` with a box, polygon points, or brush cells. `op` is `reveal` (clears fog) or `hide` (paints fog back). Later shapes win. Reveal boxes and polygons are also written to `fogRects` and `fogPolys` so an older reader still sees them. A scene that only has those older fields is copied into `fogShapes` the first time it loads.

Erase deletes the topmost shape under the click and records that as one history step. Shift-click selects without deleting. Delete selection removes every selected shape in one step. An empty click in Erase clears the selection.

Fog history is a session list on the DM client. Undo and Redo walk more than the last step. Clicking an earlier row jumps there. The list is not written to the database. Hide All and Reveal All still clear every fog shape and reset that list. Their labels stayed, and no extra all-map fog buttons were added. The token Hide button is unchanged.

Players get the scene on the same path. With fog on, the map stays dark except where a reveal shape shows it, and a hide shape covers it again. A token shows when the base fog, vision, or a containing shape says so. An empty room can take shapes. Preview and full screen use the same handler.

A polygon still closes when you click the first point, double-click, press Enter, or right-click. Escape cancels. Backspace removes the last point and does not delete the selected token.

## Check

```cmd
node tools/test-map-fog.mjs
```

That covers an empty room, a reveal polygon, multi-step undo and redo, a hide box, erase, shift-select plus Delete selection, a player seeing a token inside a reveal and not one outside or under a hide, a brush stroke as one shape, and a hide polygon in full screen. The token buttons stay Hide, Hide All, and Reveal All. `test-map-drawer.mjs`, `test-map-m2.mjs`, `test-map-link.mjs`, `test-map-spells.mjs`, and `test-map-fight.mjs` still pass.

Browser: DMCC Map tab and the sheet Map tab, preview and full screen. The buttons read Reveal: Poly, Hide: Box, Erase, and the existing Hide, Hide All, and Reveal All. History listed Reveal poly and Hide box. Undo, redo, and erase changed the canvas. The sheet preview used Reveal: Brush. Full screen closed a Hide: Poly with Enter.

# Fog polygon — sheet 0.3.22 / DMCC 0.2.35

Same draft. Versions stayed. `database.rules.json` did not change. The polygon is a field on the existing scene object (`map/public/scenes` and `map/dm/scenes`), not a new path.

## Cause

The polygon tool was unchanged from the Map tab landing (#38, `496e52e`). A click appended a point and committed only when that `pointerdown` had `detail === 2`. The points were never painted, and a close stored the bounding rectangle and relabeled the button "Fog: Rect". The polygon branch also returned before `preventDefault`. After the #40 pointer changes, a double-click often arrived as two `detail === 1` events, so nothing was drawn and nothing was saved. An empty scene from Realtime Database omits empty arrays; a polygon was never written for players to clip.

## What changed

- While Fog: Poly is on, each click paints a vertex and a line to the cursor.
- The shape closes when you click the first point, double-click, press Enter, or right-click. Escape drops the points. Backspace removes the last point and does not delete the selected token.
- The closed shape is stored as `fogPolys` (grid coordinates) and written with the rest of the scene. Players clip the map to it. A token is visible when its center is inside the polygon. Fog: ON / Fog: OFF still hides and reveals. Undo Fog removes the last rectangle or polygon.
- An empty room (no tokens, no walls, no `fogRects`) can take a polygon. Preview and full screen use the same handler.

## Check

```cmd
node tools/test-map-fog.mjs
```

That covers close without a double-click count, drawing while open, Enter, right-click, Backspace leaving the selected token, reveal/hide, a player seeing a token inside the polygon and not one outside, full screen, an empty room, and a smoke pass of rect, brush, Ping, Ruler, Wall, and Room. `node tools/test-map-drawer.mjs`, `test-map-m2.mjs`, `test-map-link.mjs`, `test-map-spells.mjs`, and `test-map-fight.mjs` still pass.

Browser: DMCC Map tab and the sheet Map tab, preview and full screen. The canvas pixels changed when the polygon was placed, and the button stayed "Fog: Poly".

# Embedded map middle-pan — sheet 0.3.22 / DMCC 0.2.35

Same draft. Versions stayed. `database.rules.json` did not change.

Middle-click on the embedded map started the browser's autoscroll because the pan path returned before `preventDefault`. Full screen hid that, since the map already covered the page.

The canvas now cancels middle `pointerdown` and `mousedown`, and `auxclick`, and those events do not bubble. The map container does the same when the click is not already on the canvas. Wheel and an in-progress pan do not bubble either. The map and its canvas use `touch-action: none` and `overscroll-behavior: none`. Middle-drag still pans, and the wheel still zooms when the middle button is up.

Checked in the browser: sheet Map tab and DMCC Map tab, preview and full screen. The page scroll position stayed put while the canvas pixels changed. `node tools/test-map-drawer.mjs` covers the cancel, the no-zoom rule, and that a normal wheel still zooms.

# Main tab layout — sheet 0.3.22 / DMCC 0.2.35

Same draft. Versions stayed at sheet 0.3.22 / DMCC 0.2.35. `database.rules.json` did not change. No combat, spell, or wallet math changed.

At about 1024px the Main tab header lined the name box up with the bottom of the calling grid, so the left column was a blank portrait-sized gap. The tab row was centered, and with the chat dock open the labels wrapped into tall buttons. Camp Kin has no sublineages, and the disabled "—" select still took a cell under Apply starting kit.

## What changed

- The Main tab left column is a portrait frame on the existing `character.portrait` field. Empty, it shows a silhouette and "Add portrait". Choose picture and Remove use the same picture path as the Backstory page. A URL writes that same field through the sheet save. Once set, the picture shows on Main and on Backstory.
- A lineage with no sublineages hides the sublineage select. The stored value is left alone. Mountain Folk still shows Sublineage.
- The tab row starts at the sheet's left edge. Tab labels stay on one line.
- The initiative strip sizes to the turn chips instead of the full window.

## Check

Browser, Hexslinger / Camp Kin, no room wizard. At 1024 the first tab and the sheet both start at x=12, tab height is 42px, the sublineage select measures 0×0, and the page does not scroll sideways. At 390 and 360 the portrait, name, and tabs stack, portrait buttons are 44px tall, and `scrollWidth` matches the viewport. A `javascript:` address is refused. `assets/images/revolver.png` saves onto `character.portrait` and shows in both portrait frames.

# Saloon games — sheet 0.3.22 / DMCC 0.2.35

Same draft as the token link. Versions stayed at sheet 0.3.22 / DMCC 0.2.35. `database.rules.json` did not change. `games/*/game.js` and `assets/js/ssdns-bridge.js` were not edited.

The saloon pages (blackjack, roulette, slots) use `games/saloon-theme.css` and `games/ssdns-wallet.js` 0.3.0. Art URLs in the theme are `_art/…`, which resolves next to the stylesheet. The `_art` folder is still empty, so those images 404 and the gradient fallbacks paint. Chip art files are reserved in `games/_art/ART-SLOTS.md`. There is no chip CSS variable; the stake controls are text buttons.

## Host

The game page exposes `host.requestCredits({amount, reason})`, `host.unlink()`, and `host.onWallet(cb)`. It talks to the sheet over `BroadcastChannel("ssdns-saloon")` and `window.opener`.

- Buy chips is an inline picker (5 / 10 / 25 / 50, a number field, Ask the DM, Cancel). It does not call `prompt()`, and it does not call `applyDelta`.
- The sheet posts `rooms/$code/encounter/requests/bank_<id>` with the existing required fields (`ts`, `from`, `targetId`, `amount`) plus `type: "bank"`. The player creates that row. The game does not write shards.
- DMCC shows the open bank row with Approve and Decline. Approve sends the existing `reward_es` command with `grantId: "bank:" + clientId`. The player's `applyEsReward` adds the shards through `SSDNSBridge.applyDelta(..., "dm-reward")`. Decline sends `bank_reply`, and the game hears `{ok: false}`.
- `watchRequests` and `applyRequest` skip `type === "bank"` so the amount is not applied as a hit.
- Unlink stays linked until the sheet replies `{type: "unlinked", ok: true}`. The sheet does not clear the wallet. The game tab then sets `sessionStorage` `ssdns.saloon.unlinked` for that character.
- A linked banner reads `Linked to NAME · N ES`. It does not say "Set chips".
- The sheet writes `localStorage` `ssdns.sheet.alive` from `pushWallet` and every 20 seconds. The game links only when that beat is under 3 minutes and the character id matches. Closing the sheet ages the link out. The alive key is not removed on `pagehide`.

## Test

```cmd
node tools/test-saloon.mjs
```

Browser shots at 390, 360, and 1280: every measured control was at least 44px, and `scrollWidth` matched the viewport. Linked and Buy chips shots are at 390. The DMCC bank tray shot shows Approve and Decline for a 25 ES request.

## Regression

| # | Check | Result | Note |
|---|-------|--------|------|
| 1 | Theme art URLs are `_art/…`, and each art variable is used | PASS | `test-saloon.mjs` src.artUrls, src.artWired. Missing webp files 404 (blackjack 4, roulette 4, slots 3). Gradients still paint |
| 2 | Tap targets at least 44px, no horizontal scroll at 390 / 360 / 1280 | PASS | Puppeteer measured `small: []` and `scrollWidth` equal to the viewport on all three games |
| 3 | Buy chips is an inline picker and does not mint shards | PASS | src.noPrompt, buy.asked, buy.noDelta, buy.stillNoDelta |
| 4 | Unlink waits for the sheet | PASS | unlink.waits, unlink.asked, unlink.confirmed |
| 5 | Linked copy does not say Set chips | PASS | fresh.noSetChips, fresh.status. Banner text was `Linked to Jolene Pike · 23 ES` |
| 6 | Stale sheet unlinks and does not apply a bet | PASS | stale.unlinked, stale.noDelta, timeout.stale |
| 7 | Bank request uses the existing request and reward path | PASS | src.bankRow, src.approvePath, src.noDirectGameWrite, src.bankSkip. `database.rules.json` not edited |
| 8 | Payout math in `game.js` | not re-run | `game.js` was not changed |

# Map spells and cylinders — sheet 0.3.22 / DMCC 0.2.35

Same draft as the token link. Versions stayed at sheet 0.3.22 / DMCC 0.2.35. `database.rules.json` did not change.

## Drawer spells

Bestiary casters already carry `spellcasting` (Viper Trent and Wakan Takan). The drawer was only reading `card.spells`, so those lists never appeared. `mapDrawerCard` now reads `card.spellcasting` for enemies and the sheet spell list for a player.

A spell button enters target mode and emits `drawer:spell`. The click on a token calls `SSDNSMapFight.cast`, which runs the existing `cardCast` path with the chosen target. No dialog. The roll is posted to the table log. Damage and healing go through `applyPlayerHit`, so Undo restores the HP. A slot is spent when the cast goes through.

What the data can resolve:

- Spell attack uses the caster's attack bonus, AC, and the spell's damage dice.
- A save uses the spell's ability and the caster's DC. Fireball's rules row has `half: true`, so a successful save takes half.
- One named condition in the spell summary is applied when the save fails (Ray of Sickness applies Poisoned). Blindness/Deafness names two conditions, so the drawer does not pick one.
- Concentration is taken from the summary text, or from `SSDNSSpellCast.blurb` when the rules meta marks it. The caster's `concentration` field moves to the new spell. That field stays on the fight row.

A player spell button stays disabled unless `dmActsAs` is set. When it is, the cast calls `rollSpellAt`, which uses `SSDNSSpellCast.rollCast` and the same slot spend as the Fight-tab spell button.

## Cylinders

The drawer draws each gun's chambers from the same `loaded` / `capacity` / `chambers` fields as the Fight tab. Firing spends a chamber and uses `SSDNSMisfire`, including the Dirty d4 flag. Clicking a filled chamber unloads it. Clicking an empty chamber loads one. Reload and Unload still call `mapGunLoad`. For a player, that is the gun command the sheet already applies against their ammo. The sheet snapshot is the source of truth. `syncPlayerGun` writes the spent chamber back onto `snapshot.guns`.

On the player map, each gun button has a small cylinder. Clicking it runs the sheet's existing Reload button. A round-count badge (for example `4/6`) is drawn on the selected token only. The DM sees enemy guns from the fight card. A player sees the badge only on their own token, read from `SSDNSApp` guns. `publicToken` does not carry loaded, capacity, chambers, or ammo.

## Test

```cmd
node tools/test-map-spells.mjs
node tools/test-map-link.mjs
node tools/test-map-drawer.mjs
node tools/test-map-fight.mjs
node tools/test-hidden-enemy.mjs
```

## Regression

| # | Check | Result | Note |
|---|-------|--------|------|
| 1 | Enemy spell button enters target mode and resolves without a dialog | PASS | `test-map-spells.mjs` spell.targetMode, spell.noDialog, spell.damage, spell.log |
| 2 | Save damage, half-on-save data, attack damage, one condition, concentration, heal, Undo | PASS | Fireball, Ray of Sickness (Poisoned), Suggestion (concentration), Cure Wounds, spell.undo |
| 3 | Player spells only when dmActsAs, via the sheet roller and slot spend | PASS | pc.blocked, pc.cast, pc.sheetRoll |
| 4 | Cylinder spend, misfire, chamber load/unload, player snapshot sync | PASS | cyl.spent, cyl.misfire, cyl.unload, cyl.load, cyl.playerSync |
| 5 | Enemy ammo never reaches the player map | PASS | public token omits loaded/capacity/chambers/ammo. Player rounds return "" for an enemy token. Player toolbar has no Fireball and no enemy `6/6` |
| 6 | Token link, hidden enemy, drawer, rules file | PASS | existing map suites. `database.rules.json` not edited |

# Map token link — sheet 0.3.22 / DMCC 0.2.35

Built on live main `d27b340` (sheet 0.3.21 / DMCC 0.2.34). `database.rules.json` did not change.

An enemy token added on the DM map opened the drawer on "No card linked" because `findFightRow` / `mapFightIndex` already accept `row.mapTokenId`, and nothing ever wrote that field.

## What changed

- The DM drawer's "No card linked" state has a **Link to…** picker with two groups.
  - **Current players:** everyone in `DM.state.players`, joined or only on the roster, even when they are not in `fight.order`. Linking sets the token's `ownerUid`, `combatantId`, and `kind` to that player. The drawer shows their sheet card. They are not added to the fight, so the DM can lay tokens out before combat.
  - **Bestiary:** every non-parked bestiary creature, plus **New custom enemy (Bandit)**. Choosing one calls the same `addBeastToFight` / `addCustomEnemy` path the Fight tab uses, then sets `row.mapTokenId` to this token. Unlinked enemies already in `fight.order` are listed under **In this fight**.
- `mapTokenId` is stored on the fight row. `saveRemoteTable` keeps it in the DM local table and on `encounter/dm`. It is not copied into `table/initiative`, `encounter/public`, or `map/public` tokens. The public token gets a label. A hidden name is published as "Unknown gunman". `combatantId` stays on `map/dm/tokens`.
- Adding an enemy on the Fight tab while the map scene is open places a linked token on the next free square. Occupied squares are skipped.
- Removing an enemy from the fight removes that token. Removing the token removes that enemy. Removing a player token only clears `row.mapTokenId`; the player stays on the roster and in the fight. Undo still restores the last HP change and leaves the link in place.
- `sortInitiative` copies each row. The link is written onto the row that remains in `fight.order`.

## Test

```cmd
node tools/test-map-link.mjs
node tools/test-map-drawer.mjs
node tools/test-map-fight.mjs
node tools/test-map-m2.mjs
node tools/test-hidden-enemy.mjs
node tools/check-rules-emulator.mjs
```

## Regression

| # | Check | Result | Note |
|---|-------|--------|------|
| 1 | Empty room: add a token, picker shows Link to… and New custom enemy (Bandit) | PASS | `test-map-link.mjs` empty.drawer / empty.groups / empty.order. `test-live-room.mjs` live.addTokenAlone |
| 2 | Custom Bandit uses the Fight add path and sets mapTokenId | PASS | custom.row, custom.card, attack is Ball n Cap Revolver |
| 3 | Link data is DM-only | PASS | public map token has no combatantId or mapTokenId. `encounter/public` and `table/initiative` omit mapTokenId. `encounter/dm` keeps it. Hidden name on the public token is Unknown gunman |
| 4 | Roster player links without joining the fight | PASS | player.notInFight, player.card shows Jolene's AC, token ownerUid is the player |
| 5 | Unlinked fight enemy can be chosen; bestiary add matches Fight stats | PASS | fight.unlinked AC 13 HP 11, fight.linked opens the Outlaw card |
| 6 | Fight-tab add places tokens on distinct squares | PASS | place.count / place.unique |
| 7 | Remove either side clears the other | PASS | remove.row / remove.token / remove.tokenClearsRow |
| 8 | Undo still restores HP and keeps the link | PASS | undo.hp, undo.link |
| 9 | Hidden-enemy leak and map leak suites | PASS | `test-hidden-enemy.mjs`, `test-map-m2.mjs` publicSecrets empty, `test-map-drawer.mjs` leak.noDrawer |
| 10 | Rules emulator, no rules file edit | PASS | `check-rules-emulator.mjs` 203 checks. `database.rules.json` not edited |
| 11 | Sheet and DMCC suites, live room | PASS | `tools/test-*.mjs` except the pre-existing `check-rules-writes.mjs` report. `test-live-room.mjs` passed against the emulators |

# M2 v4 — DM drawer + Walls on/off

Built on the current merged map (repo main `9737b1e`, now sheet 0.3.20 / DMCC 0.2.33), not m2-v3.1. `database.rules.json` did not change.

## Test

```cmd
node tools/test-map-drawer.mjs
node tools/test-map-m2.mjs
node tools/test-map-fight.mjs
node tools/check-rules-emulator.mjs
```

DM demo: `map/demo.html?role=dm`  
Player demo: `map/demo.html?role=player&uid=p_jolene`

## BEFORE

- Walls: ON/OFF flipped `state.showWalls`, but `draw()` painted walls whenever `sceneData().walls.length && role === 'dm'`, so the toggle did nothing.
- Help text said "Walls: ON hides the lines" (backwards).
- No combatant drawer. The right bar stayed a tool list. Card data was not on the map.

## AFTER

### Files

- `ssdns-map.js` — walls draw checks `state.showWalls`. Help text fixed. DM drawer added. Picking a wall tool turns the lines back on. `instance.refreshCard(tokenId)` re-renders the open drawer.
- `ssdns-map.css` — `.ssm-drawer` styles. In the embedded Map tab the drawer sits in the stage cell. Full screen keeps it clear of the top bar, left tools, right bar, and chat. At 480px and under it is a bottom sheet, max 60% height, with a close button.
- `ssdns-map-host.js` — `host.getCard` reads `SSDNSMapCards.get` on the DM page only. Drawer events call `SSDNSMapFight`, then `refreshCard`.
- `dm/assets/js/v2.js` — `window.SSDNSMapCards.get(tokenId)` builds a card from the current fight row. `window.SSDNSMapFight` runs the existing fight handlers for drawer actions.
- `cards.json` — sample cards from the m2-v4 note, plus the Dusty Spur token ids so the demo can open them.
- `demo.html` — `host.getCard` returns those sample cards for the DM.

### Walls cause / fix

`draw()` painted walls under `if (sceneData().walls.length && role === 'dm')` and never read `state.showWalls`. Added `&& state.showWalls`. Help now says "Walls: OFF hides the lines so you can see the raw map. Walls still block." `crossesWall` and `raycastVisible` still use the wall list when the lines are hidden. Choosing Wall, Room, Door, Window, or Del Wall turns the lines back on.

### Drawer

DM only. Selecting a token, clicking the current name on the initiative strip, or adding a token opens a side drawer. Card data comes from `host.getCard(tokenId)`. If that is missing or null, the drawer says "No card linked". A second lookup uses the token's `combatantId` when the token id itself has no card.

The map still only emits. The DMCC host applies the event with the existing fight code, then calls `refreshCard`:

- `drawer:attack` `{ tokenId, combatantId, weaponId }` enters target mode. The next other token emits `drawer:target`. Clicking the attacker does not count and does not close target mode. Esc cancels.
- `drawer:target` calls `cardStrike` with that target (roll, chat log, damage, ammo, Undo). It does not open the attack dialog.
- `drawer:hp` takes `{ delta }` for − / + and `{ set }` for Set HP. The amount field defaults to 1. This does not call `prompt()`.
- `drawer:condition` uses a condition `<select>` (the shared catalog when it is loaded). No `prompt()`.
- `drawer:reload` / `drawer:unload` use the weapon `<select>`.
- `drawer:deathsave` rolls with the sheet thresholds (10 success, natural 1 is two fails, natural 20 sets 1 HP) and sends the existing `death_save` command.
- `drawer:undo` calls `undoLast()`.
- `drawer:open` does not fire again when the same token is selected again. Card text is escaped.

PC cards (`kind: "pc"`) disable attack and spell buttons unless `card.dmActsAs === true`. HP, conditions, reload, unload, and death save stay enabled.

On `initiative:next` the map still only emits. When a new `table/initiative` value arrives, an open drawer follows the new current combatant. The DM page also pushes the current fight order into that same path locally (`SSDNSMapCards.initiative` → `SSDNSMapHost.syncInitiative`) so the Map tab strip matches the fight. That push does not write a new RTDB path and does not run on the player page.

Player role: those functions return immediately. No drawer element, no drawer listeners, no `host.getCard` call. The host returns before `SSDNSMapFight`.

The map does not roll dice or change HP. `action:run`, `action:done`, `action:error`, `chat:send`, `combatant:add`, and `combatant:remove` are unchanged.

### Squares, hide, middle mouse

Two tokens cannot share a square. A drop onto an occupied cell snaps back to where the drag started and shows "That square is taken". The DM holds Shift to stack them. A hidden token stays on the DM map at 40% opacity. Hiding removes the public token, and that removal no longer deletes the DM's copy. Players still do not receive it. Middle-mouse pans and does not zoom, including while the button is held.

`destroy()` clears drawer state, removes the document key listener, and empties the mount.

## Regression

| # | Check | Result | Note |
|---|-------|--------|------|
| 1 | Leak: player sees no hidden token, no drawer, no card data | PASS | `test-map-drawer.mjs` leak.noDrawer / leak.noCardText / leak.noHiddenName (0 getCard calls). `test-map-m2.mjs` publicSecrets empty, playerDmEvents 0 |
| 2 | Token drag still works | PASS | `test-map-m2.mjs` DM drag writes public + dm token paths; player drag writes only owned `pos` |
| 3 | Empty room: ping, ruler, walls, drawer open/close | PASS | `test-map-drawer.mjs` empty.tools / empty.drawer / empty.openEvent / empty.close. Add token opens "No card linked" with no players and no initiative |
| 4 | Hide: dimmed for DM, invisible for player | PASS | `test-map-drawer.mjs` hide.banditKept / hide.dimmed / hide.stillThere (globalAlpha 0.4, token still draggable, public copy removed). `test-map-m2.mjs` hiddenLeft empty, dmHiddenHp 11 |
| 5 | Chat send/receive, sfx to host.sfx | PASS | Unchanged chat path. Drawer code does not touch chat or `host.sfx` |
| 6 | Initiative Next/Prev emit; strip click opens drawer; drawer follows Next | PASS | strip.click, init.next, follow.bandit. Follows only when the current combatant id changes |
| 7 | Walls ON shows lines, OFF hides; still block | PASS | walls.off / walls.autoOn / walls.offAgain. `crossesWall` and `raycastVisible` do not read `showWalls` |
| 8 | Drawer doesn't cover toolbars, strip, or chat; 390px is a bottom sheet | PASS | `.ssm-drawer` is positioned in the stage cell. Full screen offsets clear the bars. At max-width 480px it is a bottom sheet, max-height 60%, with a close button. Checked in the DMCC Map tab and `map/demo.html` |
| 9 | destroy() removes drawer, listeners, timers | PASS | destroy.clears and destroy.player empty both mounts |
| 10 | Existing events fire unchanged | PASS | action.run still emitted. `test-map-m2.mjs` 80 checks still pass |
| 11 | No two tokens on one square; Shift stacks; snap-back notice | PASS | stack.blocked, stack.toast, stack.shift |
| 12 | Middle mouse pans and does not zoom | PASS | middle.noZoom. A later wheel still zooms (middle.wheelStillZooms) |
| 13 | Drawer attack uses the fight resolve path | PASS | `test-map-fight.mjs`: self-target rejected, natural 20 hit, roll logged, ammo 6→5, Undo restores HP, host wires `drawer:target` and refreshCard shows 5/6 |
| 14 | HP set, condition picker, reload, death save | PASS | pc.hpSet, pc.weapon, picker.noPrompt, fight.hpSet, fight.condition, fight.reload, fight.death |
| 15 | Card text is escaped; reselect does not re-open | PASS | escape.html, drawer.reselect, enemy.selfOpen |
| 16 | Versions 0.3.20 / 0.2.33, rules file unchanged | PASS | playtest, session, round, store, and enemy-sheet suites. `check-rules-emulator.mjs` 203 checks. `database.rules.json` not edited |

`node tools/test-map-drawer.mjs`, `node tools/test-map-m2.mjs`, and `node tools/test-map-fight.mjs` exited 0. `node tools/check-rules-emulator.mjs` exited 0 (203 checks). Sheet and DMCC `tools/test-*.mjs` exited 0, including `test-live-room.mjs` against the emulators.
