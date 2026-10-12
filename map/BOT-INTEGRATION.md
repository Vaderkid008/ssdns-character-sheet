# Bot Integration — M2V3

For Encounterbot, Artbot, and Coder. M2V3 is the module wrap. See `HANDOFF.md` for the full picture.

## Where it lives
- Folder: `grok-builds/m2-v3/`
- Module: `ssdns-map.js`. Demo: `demo.html`.
- Local: `python -m http.server 8000` from that folder.
- DM: `http://localhost:8000/demo.html?role=dm`
- Player: `http://localhost:8000/demo.html?role=player&uid=p_jolene`
- Mock stores: `ssdns.map.dm.<room>` and `ssdns.map.pub.<room>` (localStorage, inside mockAdapter).
- Channel: `BroadcastChannel` `ssdns-mock-<room>` (inside mockAdapter only).
- Hard-refresh after edits.

## Right-side panels (Coder wires these)

### DM (`.ssdns-rightbar`)
| id | Purpose | Status |
|----|---------|--------|
| `addTokenBtn` | Add a token (beast, NPC) | stub |
| `dupTokenBtn` / `copyTokenBtn` / `pasteTokenBtn` / `delTokenBtn` | Duplicate, copy, paste, delete | working |
| `grantBtn` / `revokeBtn` / `#grantUid` | Give or take token control | working |
| (host.actions) | Sheet / Check / Note | from host |


| `#targetList` | Selected token and who can move it | working |
| `dmTorchBtn` | Torch on selected | working |
| `#condSelect` / `condToggleBtn` / `downBtn` | Conditions and down | working |

### Player (`#rightbar`)
| id | Purpose | Status |
|----|---------|--------|
| `mySheetBtn` | This player's sheet | stub |
| `myRollBtn` | Player dice | stub |
| `myAttackBtn` | Player attack | stub |
| `#myActions` | Action list | stub |

Wire listeners in the DM / player blocks. Do not replace the left map tools.

## Floors
`SCENES` array. Current: Dusty Spur (real art), Main Street and Upstairs (placeholders).

- `folder` groups the dropdown.
- My view is DM-only.
- Set floor writes `sceneId` and `shared.playerScenes[uid]`.
- Show to players posts `{ type: 'scenes', playerScenes }`.
- Players only render tokens on their floor.

To add a map: drop the image in this folder, add a `SCENES` entry, and a folder option if it is new.

## Walls, doors, windows
Per scene, not global.

```js
shared.scenes[sceneId] = { walls: [], fogRects: [], fogRevealed: false }
```

Wall object:

```js
{ x1, y1, x2, y2, open: false, door: false, window: false, shut: false }
```

Coordinates are grid squares. See `WALLS-FOR-BOTS.md`.

- Do not write `shared.walls`. That is only read once to migrate old saves.
- Encounterbot emits the walls array with the scene.
- Import Walls pastes into the scene the DM is viewing.
- A door or window is a 1-square cut. Bots may emit them directly: `door: true, open: false` for a shut door, `window: true, shut: false` for an open window.

## Tokens
Fields the map already reads:

- `pos`, `hidden`, `locked`, `color`, `torch`, `status`, `conditions[]`, `sceneId`
- `image`, `sheetId`
- `ownerUid` — the owner
- `controlledBy` — extra uids the DM granted
- `ownerCanMove` — `false` means the owner is locked out

Sheet bots write these into `shared.tokens[id]`. Do not invent a parallel store.

### Art
Portraits live in `art/` and are named in `tokens.json`. `image` is clipped inside the ring. Name and HP stay below. Empty `image` is a plain colored ring.

```json
{ "image": "art/JP-jolene-dusty-pike.png", "sheetId": "sheet_jolene" }
```

Artbot supplies the file. Coder wires `#sheetBtn` / `#mySheetBtn` to open `sheetId`.

## Ghost Plan and movement
Both sides. Pins (Shift while dragging) turn a corner. Turning Ghost Plan off slides the path. Player moves are live to the DM. Do not bypass `canControl` — it checks `ownerUid`, `ownerCanMove`, and `controlledBy`.

## M3 props — do not build in M2
Props are objects, not tokens. See `HANDOFF.md`.

- Catalog the bots own: name, image, size in squares, light feet, blocksMove, blocksLight.
- Place them on the scene's prop list, not in `tokens`.
- A light-blocking prop adds wall segments tagged with the prop id. Remove those if the prop moves or is deleted.
- Players get the image and the light. No drag handle.
- Respect the DM lock flag.

## Suggested split
- **Encounterbot** — `SCENES` entries, wall JSON per map, encounter token placement with `sceneId`.
- **Artbot** — map images named to match `SCENES[].img`, token portraits in `art/`.
- **Coder** — wire the stub `#rightbar` buttons to sheets, rolls, and attacks. Mount the module. Keep the map tools.

## Do not
- Do not remove the left toolbar or the raycast.
- Do not store walls in pixels.
- Do not put props in `tokens`.
- Do not cut the closing tags.
