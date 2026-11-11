# Menu audit 2

Sheet 0.3.295 / DMCC 0.2.308. Fresh main was 974f1720 (live 0.3.294 / 0.2.307).

Real mouse is puppeteer-core driving Chrome (Playwright is not installed). Viewports 1280x800 and 1600x900. No GitHub Actions workflow exists in this repo, so the regression is:

```
node tools/test-menu-stability-03295.mjs
```

A menu is placed once, when it opens. Later redraws, token moves, pans, and zooms leave it there. The title-bar drag is the only later move. Content updates replace the markup in place and keep the body's scroll position and the focused control. The one keep-on-screen clamp runs at open (and while the title bar is dragged).

| Menu | Jumped before? | Cause | Fixed | Test |
| --- | --- | --- | --- | --- |
| Token command (Move / Interact / Drop), DM and player | Yes | Every animation frame called `placeCommandMenu`, which clamped the card back onto the token. Move, hover, and zoom all requested a frame. | `anchorMenuOnce` ignores later placement. Dragging the token no longer removes the card. | `dm.token`, `player.token` at 1280 and 1600. Move, hover, zoom, and a token drag. |
| DM token drawer | Yes, on an earlier drag path | Rebuilding the drawer on every range refresh. That rebuild is already a no-op. This pass checks typing does not move the dock. | Dock slot stays. Same element (`data-probe`) survives typing. | `dm.drawer` |
| DM chest (docked) | Yes | Closing the character drawer stripped `ssm-token-dock`. The chest then fell back to `bottom: 12px`, so the catalog growing moved the top upward. | The dock column is reapplied without clearing an anchor that was already set. The docked card is `height: 100%` so the list scrolls inside. | `dm.chest` — type in search, toggle Allow retries. Focus stays in the search field. |
| Door menu (DM dock, player float) | Yes | Same dock strip, and player cards were re-clamped on every show. | Same dock helper and `anchorMenuOnce`. | `dm.door` — Lock DC, Allow retries, zoom. |
| Which-one chooser | Yes | Re-anchored to the token whenever it was filled. | `anchorMenuOnce`. | `dm.chooser` — hover and zoom. |
| Player chest / drop / asset cards | Yes | `anchorChestMenu` ran on every content refresh. | Same one-shot anchor. Asset tokens are not on the Dusty Spur demo; they use this helper. | Covered by the chest and door paths. |
| Player character card | No jump on click | Docked column. A float card is placed only when opened or dragged by its title. | Typing the label, changing the color select, and clicking an attack leave the card's origin. | `player.card` |
| Zone picker | No | Sidebar select. Changing the spell can show extra fields. The panel origin stays. | None needed. | `dm.zone` |
| Initiative strip | No | Grid chrome. | None needed. | `dm.initiative` — Challenge click. |
| Roll card | No | Fixed bottom-right stack. A second card is added above the first. | None needed. | `dm.roll` — first card's rect is unchanged when a second card lands. |
| Give catalog | Yes | The hit list was in normal flow, so typing grew the panel and the page scrolled to keep the field in view. | The hit list overlays the form (`position: absolute`, max-height 280px, scrolls inside). | `dmcc.give`, `dmcc.give.catalog` on the offline demo table. |
| Reaction menu (player pips and DM fight pips) | No | Placed once at open. The map demo has no reaction pip. | None needed. | `player.reaction` records that the pip is absent. |
| Title-bar drag | Moves, on purpose | `clampMenu` while the pointer is down. | Still the only later move. A later frame does not snap the card back. | Not a jump. |

Pressing X in a text field used to call a missing `recallPath`, which threw and swallowed the character. Fields now take the key. The DM path-recall shortcut still runs when focus is not in a field.

Before and after screenshots (1280x800, Move clicked, map zoomed, card unmoved):

- `/opt/cursor/artifacts/menu-stable-before-1280.png`
- `/opt/cursor/artifacts/menu-stable-after-1280.png`
