# Model changes for Coder (M2 v3)

New or confirmed fields the map now expects.

## Token
| Field | Public | Notes |
|-------|--------|-------|
| `ownerUid` | yes | Player who owns the token |
| `controlledBy` | yes | Extra uids the DM has granted |
| `ownerCanMove` | yes | `false` locks the owner out |
| `sheetId` | DM | Cleared on duplicate/paste |
| `image` | yes | Token art filename |
| `locked` | yes | Blocks movement for everyone |
| `torch` | yes | 40 ft light |
| `sceneId` | yes | Which floor the token is on |
| `pos` | yes | `{x, y}` in grid squares |
| `hp` / `maxHp` / `ac` / `notes` | DM | Never in publicToken |
| `hidden` | DM | Hidden tokens are omitted from public |

## Per-scene
`scenes[sceneId] = { walls, fogRects, fogRevealed }`  
Walls: `{ x1, y1, x2, y2, open?, door?, window?, shut? }` in grid squares.  
Public and DM both hold a copy.

## Player floors
`playerScenes[uid] = sceneId`  
Public. Each player renders only their own floor.

## Initiative (host-owned)
`table/initiative = { round, turn, started, order[{id, name, kind, init, playerId, status, side}] }`  
Map never writes this. Next/Prev are events only.

## Chat (host-owned)
`chat` rows: `{ id, ts:Number, from, fromName, text, to? }`  
`tableFeed` rows: `{ id, ts, from, fromName?, text, kind?, event? }`
