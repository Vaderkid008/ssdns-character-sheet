# Splitting the sheet from the shared game

Jessey's goal is a faster table that stays in agreement. Today every screen writes the shared room straight to Firebase, and every screen listens to those paths on its own. Two writes that leave a laptop close together can land in the wrong order. The screen that sent them already moved on. The other screens show whatever arrived last.

This note is the map of those writes, the game-actions layer that replaces them, and the later step where a referee (not the browsers) is the only writer. Nothing in this document changes the app. Slice 1, the first code change, is a separate draft.

Line numbers are from the disconnect-presence draft (sheet 0.3.332 / DMCC 0.2.345).

## What is wrong today

A shared change is a Firebase `set`, `update`, `remove`, or `runTransaction` from whichever file handled the click. The other screens each have their own `onValue` callback and each decide what to draw.

Ordering is accidental:

- A token move during Edit tokens writes the whole public token about six times a second, then once more on drop. The public token's `pos` is only `{x, y}` (`map/ssdns-map.js` `publicToken`, around line 215). The Firebase transaction drops an older write only when the stored object has a `seq` (`map/ssdns-map-firebase.js`, around line 175). A public token has no `seq`, so a slower earlier cell can commit after the drop and put the token back. The DM ignores that echo. The player shows it. That is the Edit-tokens desync.
- A new portrait can be compared after the URL is already copied onto the token, so the old bitmap stays up until something else redraws it. The `_imgSrc` check on the current draft stops the worst of that. It is still a special case inside the map, not a shared order.
- Initiative is two writes: the player sets `playerInit/{key}` (`assets/js/dm-join.js`, around line 690) and the DM later writes `table.initiative` (`dm/assets/js/v2.js` `writeRemoteTableOnce`, around line 537). A slow earlier copy of `table` can still paint an old turn. `remoteSaveBusy` in that same function is a local queue on one DM screen. It does not order two devices.
- Loot, doors, chat, conditions, and grants each pick their own path. A cancel on one screen cannot unsend a write that already left.

## Every place that writes shared game state

Transport only, not a game change: `map/ssdns-map-firebase.js` `write` / `runTransaction` / `deliverTree`. It splits a token into the rest of the token, `/pos`, and `/patch`. `assets/js/dm-join.js` `roomPath` and `dm/assets/js/dmcc.js` `roomRef` build `rooms/{code}/...`.

### Map and tokens

| What changes | Who writes | Path | Where |
|---|---|---|---|
| Whole public token (place, drag, lights, grants, picture on the DM) | DM | `map/public/tokens/{id}` | `saveToken`, `postGrant` in `map/ssdns-map.js` (~291, ~204) |
| Private / hidden token | DM | `map/dm/tokens/{id}` | `saveToken`, hidden stream (~299, ~370) |
| Token square | Player, and the DM at the end of a slide | `map/public/tokens/{id}/pos` | `publishPlayerMove` (~318), slide end (~18170) |
| Token picture, color, lights, facing, active copy | Player | `map/public/tokens/{id}/patch` | `publishPlayerPatch` (~323) |
| Scene walls, fog, props | DM | `map/public/scenes/{id}` and `map/dm/scenes/{id}` | `saveScene` (~307) |
| Which floor a player is on | DM | `map/public/playerScenes` | `postScenes` / `saveShared` (~203, ~316) |
| Pointer slide and ping | Whoever drew it | `map/public/events/slide`, `map/public/events/ping` | `postSlide`, `postPing` (~201) |
| Loot taken, dropped, lockpick, noise, chest | Whoever did it | `tableFeed/{id}` and `map/public/events/loot` | `map/ssdns-map.js` (loot event ~8471, plus the `tableFeed` writes through the file) |

`saveToken` also runs when a remote patch comes back to the DM (~21950), so one picture or light change becomes a second full-token write.

### Initiative, turn, and the fight

| What changes | Who writes | Path | Where |
|---|---|---|---|
| Player's initiative total | Player | `playerInit/{uid}` or `playerInit/{uid}__{tokenId}` | `dm-join.js` ~690 |
| Turn order, round, turn, markers, undo | DM | `table` (`initiative`, `store`, `packs`, `updatedAt`, …) | `v2.js` `writeRemoteTableOnce` ~537 |
| Enemy HP the table can see, secret HP, public combatants | DM | `encounter/hp`, `encounter/dm`, `encounter/public` | `v2.js` ~550 |
| Inspiration pool | DM or player | `table/inspiration` | `v2.js` ~11279, `dm-join.js` ~2668 |
| End turn, mercy, reactions, shot approval | Player asks, DM resolves | `encounter/requests/{id}` | `dm-join.js` ~772 and the request writers below it; `v2.js` and `dmcc.js` mark `resolved` |
| Action / bonus / reaction marks | DM | `players/{id}/turnMarkers` | `v2.js` ~2858 |
| "I saw the turn" | Player | `players/{uid}/turnAck` | `dm-join.js` ~2180 |

Players are not allowed to write `table/initiative` (the database rules). They write a request or `playerInit`, and the DM copies the result onto `table`. That hop is why the two sides can disagree for a moment.

### People, presence, and the sheet snapshot

| What changes | Who writes | Path | Where |
|---|---|---|---|
| Sheet snapshot at the table | Player | `players/{uid}` | `dm-join.js` ~508 and the later updates ~2168 |
| Connected / last seen | Player | `players/{uid}/presence/conns/{connId}` | `dm-join.js` ~515, removed on leave ~3787 and by `onDisconnect` |
| Kick | DM | `kicked/{id}`, and remove `players/{id}` | `dmcc.js` ~2101 |
| Grant seen | Player | `players/{uid}/grantAcks` | `dm-join.js` ~1441 |
| Handout seen | Player | `players/{uid}/handoutAck` | `dm-join.js` ~2225 |

The disconnect draft reads that presence. It does not add a new path. Taking the token, holding the turn, or handing control still goes out through the map writes above (`holdOwner` / `handOwner` / `removeToken`).

### Chat, rolls, conditions, loot bookkeeping

| What changes | Who writes | Path | Where |
|---|---|---|---|
| Chat line | Either | `chat/{id}` | `dmcc.js` ~2744, `v2.js` ~7610, `dm-join.js` ~2719, `give-dm.js` |
| Roll | Either | `rolls/{id}` | `dmcc.js` ~821, `dm-join.js` ~635 |
| Roll marked applied | DM | `rolls/{id}` update | `dmcc.js` ~1946 |
| Table feed card | Either | `tableFeed/{id}` | `dmcc.js` ~852, `v2.js` ~9635, `dm-join.js` ~684, and the map |
| Condition added or ticked | Either | `conditions/{id}` | `v2.js` ~781, ~1797, ~7080; player set/remove in `dm-join.js` ~1048 |
| Ledger (give, take, money) | Either | `ledger/{id}` | `dmcc.js` ~803, `dm-join.js` ~545, `give-dm.js` ~28 |
| Whisper / message | DM | `messages/{id}` | `dmcc.js` ~866 |
| Handout | DM | `handouts/{id}` | `dmcc.js` ~879 |
| DM command | DM | `commands/{id}` | `dmcc.js` ~965 |
| Room name, act, ended | DM | `meta` | `dmcc.js` ~394, ~3308; act in `v2.js` ~4725 |
| Addiction note | DM | `archives/addiction/{playerId}` | `dmcc.js` ~702 |
| Session archive | DM | `archives/{id}` | `dmcc.js` ~3307 |
| Clear the log | DM | `table/logClearedAt` | `dmcc.js` ~2785 |
| Move the room to a new code | DM | copy of the tree, then `meta.movedTo` | `dmcc.js` ~2164 |

Reads are everywhere (`fb.get`, `onValue`, `bind`). They are not listed. The problem is the writes: each one is a different shape, and each listener paints on its own.

## One game-actions layer

Every shared change becomes one named action:

```json
{ "name": "moveToken", "seq": 1731740000123, "by": "uid", "payload": { "tokenId": "ply_…", "x": 12, "y": 4 } }
```

Names we already know we need:

- `moveToken` — a token's square (and the floor, when that changed)
- `setTokenImage` — the portrait URL
- `rollInitiative` — one player's posted total
- `setInitiative` — the DM's turn order, round, and whose turn it is
- `takeLoot` — someone takes from a chest or a drop
- `openDoor`, `pickLock`, `forceLock`
- `setCondition`, `clearCondition`
- `postChat`, `postRoll`
- `giveItem`, `takeItem`
- `setPresence` — online, away, back
- `holdTurn`, `skipTurn`, `takeControl`, `handControl`, `removeToken`

`seq` only goes forward for that subject (that token, that player, or the one initiative strip). A late action with a smaller `seq` is ignored. `by` is the uid that asked.

Screens subscribe once:

```js
SSDNSGameActions.on(function (action) { /* paint from the action */ });
```

Firebase stays the pipe in the first slices. A callback's only job is to turn a snapshot into `applyRemote(...)`. It does not also poke the canvas, the fight strip, and a second cache. Local clicks call `moveToken` / `setTokenImage` / `rollInitiative` and that same listener paints them, so the DM and the player run one path.

The action is stamped onto the object Firebase already stores (`pos.seq`, `imageSeq`, `playerInit.seq`, `initiative.actionSeq`). The existing transaction can then refuse an older write. No new database path is required for Slice 1, so the security rules stay as they are.

## Server referee, later

After the clients all speak actions, a referee should be the only thing that writes tokens, initiative, HP, and loot. Browsers append "I want this action". The referee checks the order, assigns the room `seq`, and writes the result. Two players cannot both take the last item, and a slow laptop cannot rewind a move.

Two ways to host it. Neither is part of Slice 1. No new paid service is turned on by this draft.

### Cloud Functions

A function on the Firebase project runs when an action is appended. It needs the **Blaze** plan (the pay-as-you-go plan). Spark cannot deploy functions.

Rough cost, not a quote: a busy session is thousands of actions, not millions. Moves during a drag are the hot spot, about six a second while a token is sliding. Blaze includes a large free monthly invocation allowance (on the order of two million). A weekly game lands in that allowance. The bill that already exists is the database traffic, and that does not go up just because a function wrote the row instead of the browser. Expect about $0 in function charges most months, and a few dollars if the table is up every night and functions are kept warm. Blaze has no monthly minimum, but a card has to be on the project. The first call after a quiet stretch can take a fraction of a second (cold start).

### A small Node server

One process the table can reach. It reads the action, assigns `seq`, and writes with the Firebase Admin SDK. That works on the current Spark project. Cloud Functions are the piece that force Blaze, not the Admin SDK.

Rough cost: a small always-on box is about $5 a month (a shared VM on Fly, Railway, or a small VPS). The cost is the box, including months you do not play. You have to keep that process running. There is no cold start if it stays up.

Either choice is a Jessey decision. Slice 1 does not pick one and does not deploy one.

## The rules lock, only after Jessey says so

When the referee is the writer, `database.rules.json` changes so a browser can append an action and can still write its own presence, but cannot `set` `map/public/tokens`, `table`, `playerInit`, `encounter/*`, or `conditions` itself. Until that lock, a modified client can still write those paths the way it does today.

That rules edit is a separate draft. It does not happen in the doc or in Slice 1. `assets/data/rules.js` (the game text) stays out of this split until Jessey wants the referee to enforce it.

## Slice plan

Each slice is its own draft. Versions continue after 0.3.332 / 0.2.345. Nothing here merges.

**Slice 1 — client actions, no hosting, no rules change.** `moveToken`, `setTokenImage`, `rollInitiative`, and `setInitiative`. The map, the portrait, and the initiative strip subscribe to that one listener. Sync bugs this closes:

- Edit tokens: the last cell of a drag can lose to an earlier cell that lands late, so the player sees the token jump back. `moveToken` puts a `seq` on the square and on the public token. The older write loses.
- Portraits: an older picture write can cover a newer one, and the bitmap can stick. `setTokenImage` carries `imageSeq`. A smaller seq does not replace the picture, and the listener is what drops the old bitmap.
- Initiative: the player's total and the DM's turn strip are separate writes, and a slow copy of `table` can paint an old turn. `rollInitiative` and `setInitiative` carry a seq. A late older strip does not rewind whose turn it is. `fight.seq` (the turn counter the markers use) is left alone. The new field is `actionSeq`.

**Slice 2 — loot, doors, chests.** `takeLoot`, `openDoor`, `pickLock`, `forceLock`. Sync bugs: two people can resolve the same claim, and a cancelled Open or Move can still commit because the write already left. One ordered action means the second claim sees the first, and a cancel is an action instead of a hope that the write did not send.

**Slice 3 — rolls, chat, conditions, requests.** `postRoll`, `postChat`, `setCondition`, and the request actions. Sync bugs: the feed, the roll log, and the fight strip each listen on their own, so a condition or a roll can show on one screen and not the other until a second write. One listener paints all three.

**Slice 4 — presence and the DM disconnect menu.** `setPresence`, `holdTurn`, `skipTurn`, `takeControl`, `handControl`, `removeToken`. The menu from the disconnect draft stays. The bug this closes: the menu buttons and the reconnect write presence, the token, and the turn row as separate sets, so a reconnect can clear "away" while an older "remove" is still in flight. One seq makes the later choice the one that sticks, and a rejoin does not respawn a token the DM removed.

**Slice 5 — referee.** Pick Cloud Functions (Blaze) or the small Node server. Clients append actions only. This is the efficiency step: one writer, one order, less echo traffic from every browser writing the whole token.

**Slice 6 — rules lock.** Jessey approves the `database.rules.json` change. Browsers lose the direct writes listed above. Not before.

## What Slice 1 will not do

- No edit to `database.rules.json` or `assets/data/rules.js`.
- No Cloud Function, no new server, no Blaze upgrade, no other paid service.
- No write to a live room. Tests use the in-memory adapter.
- No merge. Jessey merges.
