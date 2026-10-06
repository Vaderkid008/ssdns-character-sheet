# DM Command Center — setup (tonight)

GitHub Pages hosts the static DMCC + character sheet. Firebase is **only** for live room sync. Characters stay on-device as `.ssdns` files.

Demo mode works **fully offline** with no Firebase. Follow this when you want a real table.

The table feed is the column on the right (a bottom sheet on a phone, with an unread count). Filters are All, Chat, Money, Rolls, and Alerts. The box at the bottom messages the whole table or one player. PHB lookup searches as you type. The store can load a General Store, Gunsmith, Eldorite dealer, or Apothecary list.

v0.2.2 stores the shared party Inspiration count at `rooms/{code}/table/inspiration`. The DM can grant or spend. A joined player can only spend one at a time. **Publish `database.rules.json` again** or those writes are denied. The Fight list shows initiative scores, and a player's Initiative roll is added to that list.

---

## 0. What you already have

| Piece | Where |
|-------|--------|
| DMCC draft | this folder (`dm/`, `assets/js/firebase-config.js`, `database.rules.json`) |
| Firebase project | **ssdns-dm-hub** (config already pasted in `firebase-config.js`) |
| Sheet (live on box) | `/workspace/7_SSDNS_CHARACTER_SHEET/` v0.2.3 |
| Target GitHub repo | `Vaderkid008/ssdns-character-sheet` → Pages path `/dm/` |

---

## 1. Drop into the GitHub repo (file map)

Copy from this draft into the character-sheet repo root:

```
dm/index.html                         →  dm/index.html
dm/assets/css/dmcc.css                →  dm/assets/css/dmcc.css
dm/assets/js/dmcc.js                  →  dm/assets/js/dmcc.js
dm/assets/js/demo-data.js             →  dm/assets/js/demo-data.js
dm/assets/revolver.png                →  dm/assets/revolver.png
assets/js/firebase-config.js          →  assets/js/firebase-config.js   (shared)
assets/fonts/*                        →  (already in repo — DMCC points here)
database.rules.json                   →  database.rules.json            (for Firebase CLI deploy)
```

Optional: merge `README-DMCC-SNIPPET.md` into the root README.  
Optional: run `PATCHES/apply-join-patch.sh` on the repo (or copy from `_sheet-with-join/`).

Do **not** commit `_sheet-with-join/` or `_shots/` unless you want them.

After push, enable GitHub Pages (Settings → Pages → Deploy from branch → `/` root).  
DMCC URL shape: `https://vaderkid008.github.io/ssdns-character-sheet/dm/`  
(Sheet stays at the repo root HTML.)

---

## 2. Firebase console — create Realtime Database

1. Open [Firebase Console](https://console.firebase.google.com/) → project **ssdns-dm-hub**.
2. Left sidebar → **Build** → **Realtime Database**.
3. Click **Create Database**.
4. Prefer location **`us-central1`** (matches `…-default-rtdb.firebaseio.com` in the config). If the console only offers other regions, create it and then **update** `databaseURL` in `assets/js/firebase-config.js` to the URL shown on the Data tab.
5. Start in **locked mode** (rules deny by default) — you will paste our rules next.
6. Confirm the Data tab loads (empty root is fine). A 404 on the default URL means the DB was never created — that was the earlier failure mode.

---

## 3. Firebase console — enable Anonymous sign-in

1. Left sidebar → **Build** → **Authentication**.
2. If first time: **Get started**.
3. Tab **Sign-in method**.
4. Click **Anonymous** → turn **Enable** ON → **Save**.

DM and players both use anonymous auth (no emails). The DM’s anon uid is stored as `rooms/{code}/meta.dmUid`.

---

## 4. Deploy database rules

**Option A — Console paste**

1. Realtime Database → **Rules** tab.
2. Replace with the contents of this draft’s `database.rules.json`.
3. **Publish**.

**Option B — Firebase CLI**

```bash
# from a folder that has firebase.json pointing at database.rules.json
firebase use ssdns-dm-hub
firebase deploy --only database
```

A minimal `firebase.json`:

```json
{
  "database": { "rules": "database.rules.json" }
}
```

---

## 5. Confirm config

`assets/js/firebase-config.js` should match the Project settings → Your apps → SDK snippet:

```
apiKey: AIzaSyD3-yU0mz1PPLKgjeSPqbSory4GMXPoMP0
authDomain: ssdns-dm-hub.firebaseapp.com
databaseURL: https://ssdns-dm-hub-default-rtdb.firebaseio.com
projectId: ssdns-dm-hub
storageBucket: ssdns-dm-hub.firebasestorage.app
messagingSenderId: 948655439663
appId: 1:948655439663:web:d1c2be6268f0ff320cabda
```

If you recreated the web app, paste the new values into **both** DMCC and the sheet’s copy of `firebase-config.js` (one shared file in the repo).

---

## 6. Run a live session

1. Open `/dm/` (Pages or local server).
2. Turn **Demo** OFF (if Firebase is ready).
3. **Create room** → big code like `DUST-4821`.
4. Players open the character sheet → **Table** bar → paste code → **Join**.
5. Table cards fill from player snapshots. Use Rewards / Ledger / Rolls / Handouts / Notes.
6. **End Session** → ledger archived by default; optional wipe.

---

## 7. Local smoke test (no GitHub)

```bash
cd /workspace/ssdns-dmcc-draft
python3 -m http.server 8765
# DMCC:   http://127.0.0.1:8765/dm/
# Demo:   http://127.0.0.1:8765/dm/?demo=1
# Sheet:  http://127.0.0.1:8765/_sheet-with-join/Character%20Sheet.html
```

---

## Schema (rooms/{code}/)

| Path | Role |
|------|------|
| `meta` | code, dmUid, status, createdAt |
| `players/{uid}/snapshot` | compact sheet card + detail |
| `players/{uid}/presence` | online / lastSeen |
| `ledger/{id}` | ES / Saloon / DM pushes |
| `rolls/{id}` | shared + DM private |
| `messages/{id}` | DM → player |
| `handouts/{id}` | name + image URL |
| `commands/{id}` | rewards, force-open, handouts, HP, rest, conditions |
| `table` | initiative, store stock, handout packs (DM write) |
| `chat/{id}` | table chat anyone in the room can read |
| `rolls/{id}` | DM can read all, including whispers. Players can write, not list |
| `archives/{id}` | End Session keep, includes a text recap |

---

## v0.2 — keyboard shortcuts (Stream Deck)

On the DM Command Center, these keys work when focus is **not** in a text field, menu, or checkbox, and not while an input method editor is composing:

| Key | Action |
|-----|--------|
| `N` | Next turn in the Fight tracker |
| `Alt+Shift+R` | Push the reward currently filled in on the Rewards tab |
| `Alt+Shift+S` | Play the attack sound on this browser and send that sound cue to the table |
| `M` | Play or stop the track selected on the Music tab |

Plain `R` and `S` do nothing, so typing a URL or a name cannot grant ES or fire a sound. Map `Alt+Shift+R` and `Alt+Shift+S` on an Elgato Stream Deck hotkey button. `S` and `M` stay silent until you drop audio files in (see below).

Opening `/dm/` does not drop you straight into the last room. If this browser still has a live room, the lobby offers **Resume ROOM-CODE** or **Create a room**. **Leave room / New session** returns to that lobby and leaves the table running. **End Session** is the control that closes it.

## v0.2 — sound and music files

`attack.mp3`, `holster.mp3`, and `reload.mp3` ship in `assets/sfx/`. Any other missing file fails silently.

- Sound effects: `assets/sfx/` — `attack.mp3` (gun shot), `holster.mp3`, `reload.mp3`, plus optional `spellcast.mp3`, `reward.mp3`, `jam.mp3`, `explode.mp3` (names are set in `assets/sfx/sfx.json`)
- Music: `assets/music/` — `saloon.mp3`, `trail.mp3`, `gunfight.mp3`, `hex.mp3` (list is `assets/music/tracks.json`)

Each folder has a README with how to add another file.

## v0.2 — redeploy database rules

This version adds `rooms/{code}/table` (initiative, store stock, handout packs) and `rooms/{code}/chat`, and limits `rolls` **reads** to the DM so whisper rolls stay private. Players can still write their own roll.

**Publish `database.rules.json` again** (Realtime Database → Rules → paste → Publish, or `firebase deploy --only database`) or live table, chat, and private rolls will be denied.

DM reload rejoins the same room (the code and the DM's anonymous uid are stored in this browser). Players do not have to rejoin when the DM refreshes. End Session clears that saved room.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Demo works, Live fails | Create RTDB + Anonymous auth; check `databaseURL` |
| Permission denied | Publish `database.rules.json`; confirm signed in (anon) |
| Players don't appear | They must Join with the live code (Demo codes are local-only) |
| Sheet unchanged offline | Expected — Join is opt-in |
