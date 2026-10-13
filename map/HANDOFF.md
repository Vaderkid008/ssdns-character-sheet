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
