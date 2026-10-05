# Player sheet — Join room patch

Wire a small **Table / Join** bar into the existing SSDNS character sheet so players can connect to a DMCC room. When **not** joined, behavior is identical to today (fully offline).

## Quick apply

From the DMCC draft root:

```bash
./PATCHES/apply-join-patch.sh /path/to/ssdns-character-sheet
```

A working copy is already patched at:

`_sheet-with-join/`  (cloned from `7_SSDNS_CHARACTER_SHEET` v0.2.3)

## Files added

| File | Purpose |
|------|---------|
| `assets/js/firebase-config.js` | Shared Firebase web config (same as DMCC) |
| `assets/js/dm-join.js` | Join/Leave, snapshot publish, ledger, command listener |

## HTML changes (`Character Sheet.html`)

### Join bar (after savebar, before tabs)

```html
<div class="dm-join-bar" id="dmJoinBar" role="region" aria-label="Join DM room">
  <span class="dm-join-label">Table</span>
  <input type="text" id="dmJoinCode" placeholder="DUST-4821" autocomplete="off" spellcheck="false" aria-label="Room code" maxlength="12">
  <button type="button" class="btn sm" id="btnDmJoin">Join</button>
  <button type="button" class="btn sm" id="btnDmLeave" hidden>Leave</button>
  <span class="dm-join-status" id="dmJoinStatus">Not in a room</span>
</div>
```

### Scripts (order matters)

```html
<script src="assets/data/rules.js"></script>
<script src="assets/js/ssdns-bridge.js"></script>
<script src="assets/js/storage.js"></script>
<script src="assets/js/firebase-config.js"></script>
<script src="assets/js/app.js"></script>
<script src="assets/js/dm-join.js"></script>
```

`dm-join.js` waits for `window.SSDNSApp` and only loads Firebase **when Join is clicked**.

## CSS

Append `.dm-join-bar` rules (see `PATCHES/apply-join-patch.sh` or `_sheet-with-join/assets/css/sheet.css`).

## Runtime behavior when joined

1. **Snapshot** — publishes name, Calling, level, HP, AC, ES, guns, abilities, skills, equipment, spells under `rooms/{code}/players/{uid}/snapshot` (~every 15s + on ES change).
2. **Ledger** — polls ES (covers manual shard edits + Saloon via `SSDNSBridge` / wallet `updatedBy`).
3. **Commands** — listens for DM pushes:
   - `reward_es` → `SSDNSBridge.applyDelta`
   - `reward_item` → append to equipment
   - `reward_note` / `message` → dialog
   - `handout` → image popup
   - `open_saloon` → clicks `#btnSaloon`
   - `open_store` / `open_tab` → toast + optional tab click
4. **Leave** — marks presence offline, clears listeners; sheet is stock offline again.

## app.js

**No mandatory edits** for v1. Optional later:

```js
if (window.SSDNSDmJoin && SSDNSDmJoin.isJoined()) {
  SSDNSDmJoin.postRoll({ label, formula, result, detail, nat1, isFirearm, private: false });
}
```

## Offline guarantee

- No Firebase network traffic until Join.
- Failed Join shows a toast; sheet keeps working.
- Demo room codes from DMCC Demo mode are **local-only** — players cannot Join those via Firebase. Use Demo OFF + Create room for a real table.

## Diff reference

See `PATCHES/character-sheet-join.diff.txt`.
