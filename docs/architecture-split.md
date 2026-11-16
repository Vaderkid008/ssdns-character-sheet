# Splitting the sheet from the shared game

Jessey's goal is a faster table that stays in agreement. Today every screen writes the shared room straight to Firebase, and every screen listens to those paths on its own. Two writes that leave a laptop close together can land in the wrong order. The screen that sent them already moved on. The other screens show whatever arrived last.

This note is the map of those writes, and the game-actions layer that replaces them. Firebase is a stopgap. The likely end is a rewrite (React or Flutter is on the table) on some other backend, so the layer does not speak Firebase. A Cloud Function is only the referee while Firebase is still the backend. The project is already on the Blaze plan, so that function needs no plan change and no separate Node host. Nothing in this document changes the app, deploys a function, or edits the security rules. Slice 1, the first code change, is a separate draft.

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

Screens do not choose a backend. They call a named action, and they paint from one listener:

```js
SSDNSGameActions.moveToken(id, { x: 12, y: 4 }, uid);
SSDNSGameActions.on(function (action) { /* paint from the action */ });
```

### The adapter

Under that, the only backend API is two methods. `send` hands an action to whatever is hosting the table. `subscribe` hands committed actions back. That stream is the state the screens paint.

```js
SSDNSGameActions.use({
  name: "ws",
  send: function (action) { socket.send(JSON.stringify(action)); },
  subscribe: function (onAction) {
    socket.onmessage = function (e) { onAction(JSON.parse(e.data)); };
    return function () { socket.onmessage = null; };
  }
});
```

`assets/js/game-actions.js` is that layer. It does not import Firebase. Slice 1 ships a local adapter: `send` delivers straight to `subscribe` on the same page, which is how a single screen stays in order before a server exists. `use(adapter)` swaps the transport. The map, the fight strip, and the sheet keep calling `moveToken`, `setTokenImage`, `rollInitiative`, `setInitiative`, and `on`. They do not change when the adapter changes.

A Node process with WebSockets, or Supabase Realtime, is another adapter with the same two methods. A React or Flutter client speaks the same JSON action. The web paint code is not the contract. The action is.

### Firebase is one adapter, and a stopgap

While Firebase is the host, `send` is still the room writes that already exist: a token square on `map/public/tokens/{id}/pos`, a portrait on the token or its `/patch`, a player's total on `playerInit/{key}`, and the turn strip on `table.initiative`. Those writes stamp `pos.seq`, `imageSeq`, `playerInit.seq`, and `initiative.actionSeq`. A listener turns the snapshot back into an action with `applyRemote`, which is the inbound side of `subscribe`. It does not also poke the canvas. The listener does that.

Those call sites in `map/ssdns-map.js`, `assets/js/dm-join.js`, and `dm/assets/js/v2.js` are the Firebase adapter, still split across the files that used to write the room. A later slice gathers them into one adapter module and the paint code stops calling them. Slice 1 does not add a new `actions/` path. That would need a rules change, and the rules stay as they are.

Firebase-only pieces stay in their own files, or out of the repo:

- `assets/js/app-check.js` is the only App Check code. The flag defaults off. Enforcement is a console step.
- Cloud Functions, the budget alert, and the billing cutoff are Firebase console and deploy steps. They are not imported by the map or the sheet.
- `assets/js/firebase-config.js` and `map/ssdns-map-firebase.js` are the Realtime Database client. Nothing in `game-actions.js` loads them.

### What carries over when Firebase is dropped

| Carries over | Left behind with Firebase |
|---|---|
| Action names and the JSON payload | `rooms/{code}/...` paths |
| The seq rule: a smaller seq never wins | `database.rules.json` |
| Screen calls: `moveToken`, `setTokenImage`, `rollInitiative`, `setInitiative`, `on` | `firebase-config.js` and the Realtime Database SDK |
| The adapter: `send(action)` and `subscribe(onAction)` | `app-check.js`, reCAPTCHA, and App Check enforcement |
| The write caps (8 moves a second per token, 30 other actions a minute per player, 20 writes a second per room), enforced by whoever the referee is | Cloud Functions, the $5 budget, and the billing cutoff |
| The map, the fight strip, and the sheet, painting from the action | `deliverTree` and the direct `fb.set` / `fb.update` call sites |

The cost-safety idea carries over in plain form: know what a month should cost, get told before it runs away, and put a ceiling on writes. The Google billing screen and App Check do not.

## Server referee while Firebase is the host: Cloud Functions

After the clients all speak actions, one referee should be the only writer of tokens, initiative, HP, and loot. Browsers `send` "I want this action". The referee checks the order, assigns the room `seq`, and the adapter's `subscribe` delivers the result. Two players cannot both take the last item, and a slow laptop cannot rewind a move. That job is the same on a future Node or Supabase host. Only the box that runs it changes.

While the host is Firebase, the referee is a Cloud Function on the project that is already on Blaze. A separate Node host is not needed for this stopgap: the function runs in the same project as the Realtime Database. Nothing in the doc draft or in Slice 1 deploys that function. Deploying it is its own step, and Jessey has to say yes before any function is put on the project. If Firebase is dropped first, this function is not built.

### Rough cost per month

Prices below are the published Blaze Cloud Functions rates ([Firebase pricing](https://firebase.google.com/pricing)). They are a rough table-sized estimate, not a quote.

This is one table, a DM and the players at it, not a public site. Count a busy night high on purpose:

- Dragging is the hot path, about six actions a second, and only while a token is actually moving. Ten minutes of dragging is about 3,600 moves.
- Rolls, chat, initiative, loot, doors, and conditions sit on top of that. Call the whole night 10,000 actions.
- Four nights a month is about 40,000 function calls. A table that played every night would still be a few hundred thousand calls.

What Blaze includes at no cost each month, then what it charges after that:

| | Included each month | After that |
|---|---|---|
| Invocations | 2,000,000 | $0.40 per million |
| Compute | 400,000 GB-seconds and 200,000 CPU-seconds | Google Cloud rates |
| Outbound network | 5 GB | $0.12 per GB |

A referee call is a short read and a few small writes. 40,000 calls at about a quarter of a second and 256 MB is roughly 2,500 GB-seconds and 10,000 CPU-seconds. Both sit inside the free allowance, and a few hundred thousand calls a month still does. Two million free calls is about fifty busy nights before the invocation line starts. Past that, each extra million is $0.40.

**About $0 a month** in Cloud Functions charges at this scale. The Realtime Database bill that already exists does not grow because the function writes the row the browser used to write. One deploy stores a small container (500 MB of Artifact Registry is included) and uses a couple of minutes of Cloud Build (120 minutes a day are included), so the deploy itself is not a monthly charge.

Do not turn on minimum instances. That is the setting that bills while nobody is playing. The first action after a quiet stretch can take a fraction of a second to a couple of seconds while the function wakes up. That is fine at the start of a session.

## Cost safety

Jessey's priority is that there is never a surprise large Firebase bill. A normal month for one table is small. The bill that can run away is Realtime Database download if a script or a stuck client reads and writes the room in a loop, plus Functions if a referee is deployed with no ceiling. Four controls cover that. None of them are turned on by these drafts. No console changes, no deploys, no rules edits.

### 1. Firebase App Check

App Check is how Firebase tells a real browser on our site from a script that copied the public web config. The site is GitHub Pages at `vaderkid008.github.io`. reCAPTCHA v3 and reCAPTCHA Enterprise both work on a static site: the site key is public, and the secret stays in Google. Pick Enterprise if the Firebase console offers it for this project. Use reCAPTCHA v3 if it does not. Register the key for `vaderkid008.github.io` and for `localhost`.

Slice 1 prepares the client and leaves it off. `assets/js/app-check.js` reads `window.SSDNS_APP_CHECK`. With the flag missing or `enabled` not exactly `true`, the sheet and the DM page do not load reCAPTCHA and do not send an App Check token. Play is unchanged. When Jessey wants it on, he adds this next to the Firebase config:

```js
window.SSDNS_APP_CHECK = { enabled: true, siteKey: "the site key", enterprise: true };
```

`enterprise: false` uses reCAPTCHA v3. Both pages call `SSDNSAppCheck.start(app)` after the Firebase app exists and before the database opens. A local test can set `self.FIREBASE_APPCHECK_DEBUG_TOKEN` in the browser console. Do not put a debug token in the repo.

Enforcement is Jessey's console step, separate from the flag: Firebase console, App Check, then Realtime Database and Storage, then Enforce. Until that switch is on, a missing token still works, so the flag can be tried without locking the table out. Do not enforce until a live room has been opened with the flag on and App Check shows the token as verified. These drafts do not flip that switch and do not register a site key.

App Check does not shrink a normal game's bill. It stops strangers and copied scripts from running one up.

### 2. Budget alert at $5 a month

In Google Cloud Billing, create one budget for this project only (`ssdns-dm-hub`), amount $5 per month, with email at 50%, 90%, and 100%. The mail goes to the billing admins on the account. This does not stop spending. It is the early warning, and $5 is well above a normal month for one table, so a message means something is wrong. Creating the budget is Jessey's step. Not done here.

### 3. Optional hard cap

A budget can also publish to a Pub/Sub topic. The usual Cloud Function on that topic detaches billing from the project when the threshold is crossed. That is a real ceiling: Realtime Database, Auth, Storage, and Functions stop, and the app goes offline for everyone at the table until someone links billing again in the console. It can trip mid-session. Budget mail and Pub/Sub are not instant, so spend can pass the threshold before the function runs. The function also needs permission to change billing on the project, which is a strong permission. Leave this off unless the outage is preferable to a larger bill. Not deployed here.

### 4. Function limits and per-room write rates

When the referee function is deployed, and only after Jessey says to deploy, set:

- 256 MB of memory
- a 10 second timeout, so a hung call does not bill for a full minute
- `maxInstances` of 10, so a bug cannot scale out to hundreds of instances
- no minimum instances

The actions layer uses the same write caps, in the client and again in the function so a modified client cannot skip them:

- `moveToken`: at most 8 per second per token per room. A drag already sends about 6 per second.
- every other action: at most 30 per minute per player per room
- the whole room: at most 20 writes per second, so one stuck client cannot fill the database

Slice 1 does not enforce these caps yet. The numbers are here so the client and the function use one set when that slice is built.

## The rules lock, only after Jessey says so

When the function is the writer, `database.rules.json` changes so a browser can append an action and can still write its own presence, but cannot `set` `map/public/tokens`, `table`, `playerInit`, `encounter/*`, or `conditions` itself. Until that lock, a modified client can still write those paths the way it does today.

That rules edit is a separate approval from the function deploy. Jessey has to say yes to each one. Neither happens in this doc or in Slice 1. `assets/data/rules.js` (the game text) stays out of this split until Jessey wants the function to enforce it.

## Slice plan

Each slice is its own draft. Versions continue after 0.3.332 / 0.2.345. Nothing here merges.

**Slice 1 — client actions, no hosting, no rules change.** `moveToken`, `setTokenImage`, `rollInitiative`, and `setInitiative`. The map, the portrait, and the initiative strip subscribe to that one listener. App Check client code ships in this slice behind `window.SSDNS_APP_CHECK`, default off. Sync bugs this closes:

- Edit tokens: the last cell of a drag can lose to an earlier cell that lands late, so the player sees the token jump back. `moveToken` puts a `seq` on the square and on the public token. The older write loses.
- Portraits: an older picture write can cover a newer one, and the bitmap can stick. `setTokenImage` carries `imageSeq`. A smaller seq does not replace the picture, and the listener is what drops the old bitmap.
- Initiative: the player's total and the DM's turn strip are separate writes, and a slow copy of `table` can paint an old turn. `rollInitiative` and `setInitiative` carry a seq. A late older strip does not rewind whose turn it is. `fight.seq` (the turn counter the markers use) is left alone. The new field is `actionSeq`.

**Slice 2 — loot, doors, chests.** `takeLoot`, `openDoor`, `pickLock`, `forceLock`. Sync bugs: two people can resolve the same claim, and a cancelled Open or Move can still commit because the write already left. One ordered action means the second claim sees the first, and a cancel is an action instead of a hope that the write did not send.

**Slice 3 — rolls, chat, conditions, requests.** `postRoll`, `postChat`, `setCondition`, and the request actions. Sync bugs: the feed, the roll log, and the fight strip each listen on their own, so a condition or a roll can show on one screen and not the other until a second write. One listener paints all three.

**Slice 4 — presence and the DM disconnect menu.** `setPresence`, `holdTurn`, `skipTurn`, `takeControl`, `handControl`, `removeToken`. The menu from the disconnect draft stays. The bug this closes: the menu buttons and the reconnect write presence, the token, and the turn row as separate sets, so a reconnect can clear "away" while an older "remove" is still in flight. One seq makes the later choice the one that sticks, and a rejoin does not respawn a token the DM removed.

**Slice 5 — Cloud Functions referee.** Only after Jessey says to deploy. Browsers append actions. A function on the existing Blaze project assigns the room seq and is the only writer of tokens, initiative, HP, and loot. No separate Node host. Until that deploy, a browser can still write the shared paths directly, so the seq from Slice 1 can be skipped by a modified client. The function is what makes one order stick for the whole table.

**Slice 6 — rules lock.** A separate yes from the deploy. Jessey approves the `database.rules.json` change. Browsers lose the direct writes listed above. Not before.

## What these drafts will not do

- No edit to `database.rules.json` or `assets/data/rules.js`.
- No function deploy, no budget, no billing change, and no App Check enforcement in the console. Blaze is already the plan. Each of those waits for Jessey's OK.
- No write to a live room. Tests use the in-memory adapter.
- No merge. Jessey merges.
