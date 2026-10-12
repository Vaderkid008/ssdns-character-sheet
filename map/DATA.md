# DATA.md — paths the map module reads and writes

The module talks only to the adapter. Paths are hierarchical. A subscribe to a parent receives any write at or under that path (full path in `meta.path`). This matches how Firebase will behave.

## Public (players may read)

| Path | Shape | Notes |
|------|-------|-------|
| `map/public/tokens/<id>` | publicToken (no hp/ac/notes/hidden) | Full public token. Written by DM on change. |
| `map/public/tokens/<id>/pos` | `{x, y, by, seq}` | Player move. DM merges if `by` canControl, then rewrites the full token. |
| `map/public/tokens/<id>/patch` | `{...fields, seq}` | Player patch (label, color, torch, …). |
| `map/public/scenes/<sceneId>` | `{walls, fogRects, fogRevealed}` | Per-scene walls and fog. |
| `map/public/playerScenes` | `{[uid]: sceneId}` | Which floor each player is on. |
| `map/public/events/slide` | `{id, points, seq}` | Ghost-plan commit. |
| `map/public/events/ping` | ping object | |
| `table/initiative` | `{round, turn, started, order[]}` | Live turn strip. |
| `chat` | `[{id, ts, from, fromName, text, to?}]` | |
| `tableFeed` | `{id, ts, from, fromName?, text, kind?, event?}` | |

## DM-only (players never receive)

| Path | Shape |
|------|-------|
| `map/dm/tokens/<id>` | full token (includes hp, ac, notes, hidden) |
| `map/dm/scenes/<sceneId>` | full scene data |

The mock uses a separate BroadcastChannel (`ssdns-mock-dm-<room>`) for `map/dm/*`. Players never open it and never read the DM storage key. This mirrors the Firebase rule: `map/dm` is readable by `meta.dmUid` only.

## Writes

- One changed token: `saveToken(id)` writes public + DM for that id only (or removes public if hidden).
- One scene edit: `saveScene(sceneId)` writes that scene only.
- During drag: local state only. Write once on pointerup.
- `saveShared()` is used only for the initial seed.

## publicToken fields

`id, pos, color, torch, status, conditions, sceneId, image, ownerUid, controlledBy, ownerCanMove, locked, label, size, name`

Never includes `hp`, `maxHp`, `ac`, `notes`, or `hidden`.
