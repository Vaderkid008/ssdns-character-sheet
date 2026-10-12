# M2 v3.1 — handoff

Module wrap with adapter, host actions, live initiative, chat events, and rAF. Player view restored. All assets included.

## Test
```cmd
cd grok-builds/m2-v3.1
python -m http.server 8000
```
- DM: `http://localhost:8000/demo.html?role=dm`
- Player: `http://localhost:8000/demo.html?role=player&uid=p_jolene`

Hard-refresh after edits.

## Regression (R1–R12)

Before = m2-v2 (all pass). After = v3.1.

Any previous FAIL that is now fixed is noted. No new FAIL.

| # | Check | DM before | DM after | Player before | Player after | Note |
|---|-------|-----------|----------|---------------|--------------|------|
| R1 | Pan and zoom | PASS | PASS | PASS | PASS | Wheel and drag background work. Reset view works. |
| R2 | Drag-snap | PASS | PASS | PASS | PASS | Snap ON snaps on release. |
| R3 | Walls | PASS | PASS | PASS | PASS | Draw, room, del, undo, clear, import. Walls: ON hides lines for DM only. |
| R4 | Doors and windows | PASS | PASS | PASS | PASS | 1-square cut, toggle, right-click restore. Open door passes move; open window does not. |
| R5 | Raycast vision and fog | PASS | PASS | PASS | PASS | Player vision stops at walls/shut, passes open. Torches 40 ft. Fog tools work. (v3 player was blank; fixed by path delivery.) |
| R6 | Floors and playerScenes | PASS | PASS | PASS | PASS | Scene select, My view, Set floor, Show to players. Per-floor tokens/walls/fog. |
| R7 | Token ownership and movement | PASS | PASS | PASS | PASS | Owner moves, ownerCanMove lock, grant/revoke, lock. Live both ways. Dup/copy/paste/delete. (Player moves now merged by DM.) |
| R8 | HP and condition display | PASS | PASS | PASS | PASS | DM sees HP. Conditions show. Player sees no private HP. |
| R9 | Centering on player's token | PASS | PASS | PASS | PASS | Player starts centered on own token. |
| R10 | Ghost Plan | PASS | PASS | PASS | PASS | Pins, shift turns, commit slides for all, cancel drops. |
| R11 | Left tools | PASS | PASS | PASS | PASS | Ping, ruler, fog, walls, doors, windows. |
| R12 | Chat and initiative | PASS | PASS | PASS | PASS | chat:send only; setChat/pushFeed. Live turn strip. Next/Prev emit only. |

## What this build is
- `ssdns-map.js`: `SSDNSMap.create({el, role, uid, adapter, host, options})`. Requires `uid` and `options.scene`. No storage, no channel, no fetch, no getElementById.
- `demo.html`: mockAdapter (separate DM/public channels, delivers children on subscribe and live), host, options. Only place that reads the URL.
- Assets: scene JSON, tokens.json, mock-room.json, three maps, `art/` with the 10 named files from tokens.json (no `image (n).png`).

## Integration
See DATA.md for every path. See TESTS.md for manual checks. See MODEL-CHANGES.md for new fields.

## Don't
No roll logic, no turn lock, no props (M3).
