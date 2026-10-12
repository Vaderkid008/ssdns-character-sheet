# M2 v3 manual tests

Run both DM (`?role=dm`) and player (`?role=player&uid=p_jolene`) against the same room.

## 1. Player leak
- Open player page. DevTools → Application → Local Storage. Confirm `ssdns.map.pub.*` has no `hp`, `ac`, `notes`, or `hidden` on any token.
- Network tab: player never requests `tokens.json`.
- Hidden token on DM side does not appear for the player.

## 2. Two instances
- Open a page that mounts two `#mount` elements (or two browser windows). Pan, zoom, and select on one. The other is unaffected.
- Call `map.destroy()` on one. Its element is empty. The other still draws and receives updates.

## 3. Adapter / stale write
- Move a token. Confirm a single `map/public/tokens/<id>/pos` write (or full public token write).
- Manually inject an older `seq` on the same path. The token does not jump backward.

## 4. Host actions
- Host returns three actions. Exactly three buttons appear in the right bar.
- Click one. Console shows `action:run` and `host.actions.run`. No dice math in the module (`grep -i "roll\\|attack"` is clean of logic).

## 5. Live initiative
- Change `turn` in the mock store (or call `syncCombatants`). Highlight moves without reload.
- Next / Prev emit `initiative:next` / `initiative:prev` only. Module never writes the turn.
- `grep turnOrder` in the module returns 0.

## 6. Chat echo
- Type a message and Send. Console shows `chat:send`. Nothing appears in the log until the host writes the row back via `setChat` or `pushFeed`.
- Rows show `host.displayName` values. `ts` is a number.

## 7. Idle CPU
- Active turn, no movement. Performance tab shows ~0% CPU. No `setInterval` in the module.

## Regression (Rule #1)
R1–R10 from the coder notes still pass: pan/zoom, drag-snap, walls/doors/windows, raycast/fog, floors, ownership/grant/revoke, HP display (DM), centering, Ghost Plan, left tools.
