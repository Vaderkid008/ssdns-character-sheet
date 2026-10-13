# M2 v4 — DM drawer + Walls on/off

Built on the current merged map (repo main `9737b1e`, sheet 0.3.19 / DMCC 0.2.32), not m2-v3.1.

## Test

```cmd
node tools/test-map-drawer.mjs
node tools/test-map-m2.mjs
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
- `ssdns-map-host.js` — `host.getCard` reads `SSDNSMapCards.get` on the DM page only. Drawer button events are still only emitted. Fight code is not called from those buttons.
- `dm/assets/js/v2.js` — `window.SSDNSMapCards.get(tokenId)` builds a card from the current fight row. It does not change HP, ammo, or the turn.
- `cards.json` — sample cards from the m2-v4 note, plus the Dusty Spur token ids so the demo can open them.
- `demo.html` — `host.getCard` returns those sample cards for the DM.

### Walls cause / fix

`draw()` painted walls under `if (sceneData().walls.length && role === 'dm')` and never read `state.showWalls`. Added `&& state.showWalls`. Help now says "Walls: OFF hides the lines so you can see the raw map. Walls still block." `crossesWall` and `raycastVisible` still use the wall list when the lines are hidden. Choosing Wall, Room, Door, Window, or Del Wall turns the lines back on.

### Drawer

DM only. Selecting a token, clicking the current name on the initiative strip, or adding a token opens a side drawer. Card data comes from `host.getCard(tokenId)`. If that is missing or null, the drawer says "No card linked". A second lookup uses the token's `combatantId` when the token id itself has no card.

Buttons emit only:

- `drawer:attack` `{ tokenId, weaponId }` — then the next token click emits `drawer:target` `{ tokenId, weaponId, targetTokenId }` (Esc cancels)
- `drawer:hp` `{ tokenId, delta }`
- `drawer:condition` `{ tokenId, condition, on }`
- `drawer:reload` / `drawer:unload` `{ tokenId, weaponId }`
- `drawer:deathsave` `{ tokenId }`
- `drawer:undo` `{ tokenId }`
- `drawer:open` / `drawer:close` `{ tokenId }`

PC cards (`kind: "pc"`) disable attack and spell buttons unless `card.dmActsAs === true`. HP, conditions, reload, unload, and death save stay enabled.

On `initiative:next` the map still only emits. When a new `table/initiative` value arrives, an open drawer follows the new current combatant. The DM page also pushes the current fight order into that same path locally (`SSDNSMapCards.initiative` → `SSDNSMapHost.syncInitiative`) so the Map tab strip matches the fight. That push does not write a new RTDB path and does not run on the player page.

Player role: those functions return immediately. No drawer element, no drawer listeners, no `host.getCard` call.

No dice, no HP math, no ammo math. `action:run`, `action:done`, `action:error`, `chat:send`, `combatant:add`, and `combatant:remove` are unchanged.

`destroy()` clears drawer state, removes the document key listener, and empties the mount.

## Regression

| # | Check | Result | Note |
|---|-------|--------|------|
| 1 | Leak: player sees no hidden token, no drawer, no card data | PASS | `test-map-drawer.mjs` leak.noDrawer / leak.noCardText / leak.noHiddenName (0 getCard calls). `test-map-m2.mjs` publicSecrets empty, playerDmEvents 0 |
| 2 | Token drag still works | PASS | `test-map-m2.mjs` DM drag writes public + dm token paths; player drag writes only owned `pos` |
| 3 | Empty room: ping, ruler, walls, drawer open/close | PASS | `test-map-drawer.mjs` empty.tools / empty.drawer / empty.openEvent / empty.close. Add token opens "No card linked" with no players and no initiative |
| 4 | Hide: dimmed for DM, invisible for player | PASS | Unchanged path in `test-map-m2.mjs` (hiddenLeft empty, dmHiddenHp 11) |
| 5 | Chat send/receive, sfx to host.sfx | PASS | Unchanged chat path. Drawer code does not touch chat or `host.sfx` |
| 6 | Initiative Next/Prev emit; strip click opens drawer; drawer follows Next | PASS | strip.click, init.next, follow.bandit. Follows only when the current combatant id changes |
| 7 | Walls ON shows lines, OFF hides; still block | PASS | walls.off / walls.autoOn / walls.offAgain. `crossesWall` and `raycastVisible` do not read `showWalls` |
| 8 | Drawer doesn't cover toolbars, strip, or chat; 390px is a bottom sheet | PASS | `.ssm-drawer` is positioned in the stage cell. Full screen offsets clear the bars. At max-width 480px it is a bottom sheet, max-height 60%, with a close button. Checked in the DMCC Map tab and `map/demo.html` |
| 9 | destroy() removes drawer, listeners, timers | PASS | destroy.clears and destroy.player empty both mounts |
| 10 | Existing events fire unchanged | PASS | action.run still emitted. `test-map-m2.mjs` 80 checks still pass |

`node tools/test-map-drawer.mjs` and `node tools/test-map-m2.mjs` both exited 0.
