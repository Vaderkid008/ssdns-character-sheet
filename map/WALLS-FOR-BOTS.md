# Walls for Map Tool (M2V2)

## Purpose
Encounterbot emits wall segments so the DM does not draw every line. The DM can still edit them.

## Format
JSON array, coordinates in **grid squares** (not pixels):

```json
[
  { "x1": 5, "y1": 2, "x2": 12, "y2": 2 },
  { "x1": 12, "y1": 2, "x2": 12, "y2": 8, "door": true, "open": false },
  { "x1": 6, "y1": 2, "x2": 7, "y2": 2, "window": true, "shut": false }
]
```

- `x1,y1` start, `x2,y2` end, in grid squares.
- Plain wall: no extra flags.
- Door: `door: true`. `open: false` is shut (default). `open: true` lets light and movement through.
- Window: `window: true`. `shut: false` is open (see through, cannot walk). `shut: true` is boarded.
- Diagonal: corner to corner, one square at a time (`x` and `y` both change by 1).

## Storage
Per scene, not global.

```js
shared.scenes[sceneId] = { walls: [], fogRects: [], fogRevealed: false }
```

Do not write `shared.walls`. That key is only read once to migrate old saves into the saloon.

## How the DM uses it
1. Open the scene with **My view**.
2. Click **Import Walls** and paste the array. It lands on the scene being viewed.
3. Or draw with Wall / Room (drag, release to commit). Room edges merge into an existing wall instead of stacking.
4. Door and Window cut a 1-square piece. Click again to open or shut. Right-click restores the wall.

## What the bots should do
- **Encounterbot**: emit a `walls` array with the scene. Trace room boundaries. Mark doorways and windows.
- **Artbot**: no change. Walls are separate from the image.
- **Coder**: include the array in the scene JSON, or a `walls.json` the DM can paste.

## Notes
- Same grid as the map (`cols` × `rows`).
- Vision is raycast. Closed doors and shut windows block. Open doors and open windows do not block light. Open windows still block movement.
- Walls persist in the local mock and will persist in Firebase later.
