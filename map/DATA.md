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
| `tableFeed` | `{id, ts, from, fromName?, text, kind?, event?}` | Attack effects ride here too, see below. |

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

## Token size (2026-10-20)

`size` is squares per side: Tiny, Small and Medium are 1, Large 2, Huge 3, Gargantuan 4 (`map/token-size.js`).
Placing a bestiary or custom enemy reads its `size` field; player tokens are Medium. `pos` is the top-left square.
The footprint is the click target, the drag/collision box, and is kept inside the grid. Auto-placement keeps
footprints apart and keeps each name label (the row under the token) off other tokens and labels. Hidden tokens
never reach the public path, so players never get their size either.

## Attack effects (firing lines), sheet 0.3.108 / DMCC 0.2.121

Visual only. No new path, no rules change.

- **DM-published row** `tableFeed/fx_<rollId>`: `{id, ts, from: dmUid, fromName: 'DM', text: 'fx', kind: 'sfx', event: 'fx', fx}`.
  `fx` is `SSDNSMapFx.sanitize()` output only: `v, type, result, shooter?, target?, src?, dir?, arrow, sfx, weapon, weaponId, scene, nat, crit, critMin, heard`.
  `shooter`/`target` are **public token ids**. A hidden shooter is never named: the row carries `src` (the first point on the line any player can see, at least 1 square from the shooter) or no row at all. A hidden target means no row.
- **Player request** `fxReq` on the player's own `tableFeed/<rollId>` roll row (or a `kind: 'sfx', event: 'fx'` row for no-roll shots such as dynamite arrows). Only the DM's map reads it and turns it into the public row above. Never written to `rolls/`.
- Every feed reader already skips `kind: 'sfx'` rows whose `event` isn't a shared cue, so chat and sound handlers ignore both.

