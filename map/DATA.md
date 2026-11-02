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
- **Player request** `fxReq` on the player's own `tableFeed/<rollId>` roll row (or a `kind: 'sfx', event: 'fx'` row for no-roll shots such as dynamite arrows). The caster's open map paints that request locally (sheet also calls `SSDNSMapHost.fx` on the cast, with `heard` so the cast cue is not played again). A Hexslinger shell under the hammer uses that same spell paint: Roll and a chamber click cast the shell instead of skipping the effect. Area, wall, cone, and line casts include `at` (the placed grid point) so the one-shot lands there. The DM's map still publishes the cleaned public row, including when the request is the DM's own sheet cast. `spell` and `dmg` stay on that row so a catalog look wins; the purple ribbon is only the fallback when the spell is not in the catalog. A placed-token spell (`token` look) does not also draw a beam. A public row this client already painted is not drawn again. Effects off, no scene, or no visible shooter/target still draws nothing. Never written to `rolls/`. No initiative gate.
- Every feed reader already skips `kind: 'sfx'` rows whose `event` isn't a shared cue, so chat and sound handlers ignore both.

## Asset library (N86, sheet 0.3.173 / DMCC 0.2.186)

Per room, same idea as My Maps. No new player-writable path. Interact requests use `tableFeed`.

| Path | Shape |
|------|-------|
| `map/dm/assetLibrary/<defId>` | Library definition (`v: 1`). DM only. |
| `map/dm/tokens/<id>` | Placed instance: `kind: "asset"`, `assetDefId`, and `asset` (copy of the definition plus `state`). |
| `map/public/tokens/<id>` | `publicToken` plus a **sanitized** `asset`. |
| `tableFeed/<id>` | Player request: `{kind:'sfx', event:'asset', text:'asset', assetReq:{tokenId, action, by}}`. The DM map applies it. |
| `tableFeed/<id>` | After apply: `{kind:'note', text}` is the table-log line. `{kind:'sfx', event:'asset-sfx', sfxUrl}` plays the sound. |

Definition fields: `id, name, size` (1–4 squares), `image`, `images[]` (index 1 is the on/open picture), `sfx.{interact,on,off,open,close}`, `props` (light, toggle, gate, health, trap, range, links, immunities, timer), `interact.{reachFt, actions, dmApprove}`, `targetable`, `hiddenFromPlayers`, `notes`, `createdAt`, `updatedAt`, `v`.

`asset.state` is `{on, open, lit, hp, armedAtRound, firesAtRound}`. N86 stores `lit` and the round fields. The Turn# fuse control is N87. `interact.dmApprove` is stored and not enforced. Open, on/off, and light apply as soon as the DM map reads the feed.

Public `asset` is only `name, size, image` (the picture for the current state), `on, open, lit`, `actions[{id,label,stub}]`, `hpPct`, plus `blocksMove` and `reachFt` so other clients can enforce the gate and the 5 ft check. It never includes trap DC/attack/damage, `notes`, `immunities`, or hit-point numbers. A hidden asset sets token `hidden` and is omitted from `map/public/tokens`.

A closed gate with `blocksMove` occupies its footprint. An open one does not. Door segments stay N59 walls. `doorInteract(wallRef, action)` forwards a `{door:true}` target to `SSDNSAssets.onInteract`.

## Doors and Turn# timers (N87, sheet 0.3.175 / DMCC 0.2.188)

Door walls gain `locked`, `lockDc`, `ajar`, and `trapOnFail` (stub only: a failed lockpick does not spring it). `ajar` passes sight the way `open` does and still blocks movement.

A player within 5 ft of a visible, non-secret door writes `tableFeed/<id>` `{kind:'sfx', event:'asset', assetReq:{door:{x1,y1,x2,y2}, action, by, nat?, total?}}`. The DM map applies it through `SSDNSAssets.onInteract`. Lockpick uses `SSDNSLoot.playCheck`.

Timer actions (`light-fuse`, `start-timer`, `push-plunger`, `trigger`, `defuse`, `clear-timer`) are registered with `SSDNSAssets.registerAction`. Turn# is `table/initiative.round`. A fuse of N fires when `round === armedAtRound + N` (the arming round does not count). Out of combat the fuse waits for initiative, then counts from that round. Instant and plunger fire immediately. `SSDNSAssets.onRound` (already called at the DMCC round wrap) runs the fire.

Public `asset` stays the N86 slice. When the DM marks the countdown visible it may also include `turnsLeft` or `waiting`. It never includes `firesAtRound`, effects, trap numbers, notes, immunities, or raw hp.

Pack file: `{format:"ssdns-asset-pack", version:1, assets:[]}`.

Encounter Pack v1 is `assets/packs/encounter-pack-v1.ssdns-asset-pack.json`. The Assets panel button **Encounter Pack v1** fetches that file (same origin, next to `map/asset-library.js`) and imports definitions whose ids are not already in the room. A second click does not copy them. File Import still makes a new id when that id is already taken. Pictures are `assets/map-props/asset-*.webp`. The pack stores those as `https://vaderkid008.github.io/ssdns-character-sheet/assets/map-props/…` links (`data:` and `blob:` are dropped on import). Soft defaults stay in the JSON: wall lantern and campfire are 20 ft bright + 20 ft dim, the fence gate blocks movement and not sight, and the powder barrel and plunger box keep the off/on picture, the toggle, and the fuse or plunger blast timer. SFX values are bare allow-list filenames.

## Showcase map (N90, sheet 0.3.178 / DMCC 0.2.191)

Dry Fork Water Stop is built-in scene `scn_dry_fork` in `map/map-packs.js`. My Maps lists it under Built-in. The DM opens it from that menu. The same scene is on the hidden scene list used by Set floor.

| File | Role |
|------|------|
| `map/packs/showcase-dry-fork/showcase-dry-fork_40x30_70px.png` | 2800×2100 map, 40×30 squares, 70 px, no grid |
| `map/packs/thumbs/scn_dry_fork.png` | My Maps card |
| `map/packs/showcase-dry-fork/showcase-dry-fork.walls.json` | 31 wall segments, Import Walls shape |
| `map/packs/showcase-dry-fork/showcase-dry-fork.map.json` | Draft zones and spawns. Not loaded. |
| `map/packs/showcase-dry-fork/LAYOUT-KEY.md` | Layout key for the draft |

Opening the scene runs `seedPackWalls`: if that scene has no walls yet, the pack walls are copied in and saved. Import Walls opens with those same walls already filled in, so OK writes them again. No new Firebase path.

`showcase-dry-fork.map.json` is marked schema-unconfirmed. This pack does not place tokens, zones, lights, or encounter rows. Encounter Bot owns that draft.

