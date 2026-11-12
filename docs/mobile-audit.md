# Phone audit

Read-only look at main `51491776` (sheet 0.3.301 / DMCC 0.2.314). No room was joined on Firebase and no rules were edited.

Touched with Playwright (system Chrome, `hasTouch`, mobile user agent) at iPhone 14 portrait 390×844 and landscape 844×390, Pixel 7 412×915, a 360×800 Android, and iPad portrait 768×1024. Local server `http://127.0.0.1:8765`.

What matters for test play is whether a player can join, see their token, move, roll, attack or cast, interact, and change HP. Layout nits and the DM phone are later.

## Phase 1 — player mechanics

### 1. A finger on the map cannot scroll the page back to the tabs

This is the one Jessey hit first. On a phone, once a drag starts on the map, the page does not move. The tab row stays clipped above the screen. The same drag on Main does scroll the page, so the phone and the test can scroll. The map takes the gesture and does not give it back, including after you have dragged to the end of what's on screen.

The Map tab with no room only says "Join a table to open the map," and that empty line does not trap. The trap starts when the map widget is on the page. For this pass the widget was created in the sheet with the local memory adapter. No Firebase room was joined. It is the same `SSDNSMap.create` the sheet runs after a join.

Played with a real touch stream (Chrome DevTools touch events, not a mouse drag) at iPhone 14 (390×844) and a 360×800 Android.

On Main, one finger moved the page. iPhone scroll went from 700 to 1099. Android went from 640 to 1024.

On Map, the page was parked so the tab row was a 6px sliver at the top (`scrollY` 616 on both phones). One finger on the token card scrolled the card and stopped at the card's own end (iPhone card 0 → 165, Android 0 → 209). `scrollY` stayed 616. A second drag, starting from that end, still left the page at 616 and the tabs clipped. Collapsing the card and dragging the grid panned the map (the canvas pixels changed, iPhone 470736 → 464808, Android 470736 → 458880) and the page still did not move.

![iPhone, card at its end, tabs still clipped](/opt/cursor/artifacts/mobile/scroll-iphone14-tabs-stuck.png)

![360px Android, same trap](/opt/cursor/artifacts/mobile/scroll-android360-tabs-stuck.png)

![iPhone, grid dragged, page did not follow](/opt/cursor/artifacts/mobile/scroll-iphone14-canvas-pan.png)

The player map (`map/demo.html?role=player`) has the same widget and no sheet tabs. As shipped, that page has no viewport tag, so the layout width stays 980 and the document has nowhere to scroll (`scrollY` max 0, map `overflow: hidden`). With a viewport tag added only in the test, so it lays out like the sheet, the page still has no scroll range. A finger scrolls the card (iPhone card 0 → 134, Android 0 → 132) and the document stays at 0.

![Player map on an iPhone-sized viewport, the card takes the drag](/opt/cursor/artifacts/mobile/scroll-iphone14-player-phone.png)

#### Why the gesture dies

Four things stack, and any one of them is enough to stop the page.

The map root opts out of browser scrolling. `.ssdns-map` sets `touch-action: none` and `overscroll-behavior: none` (`map/ssdns-map.css` near the top). The canvas sets both again. `touch-action: none` tells the browser this touch is not a page scroll and not a pinch. `overscroll-behavior: none` blocks scroll chaining, so even a scroller that did hit its edge would not hand the rest of the drag to the page.

Under 720px the map is a nested scroller. The same file, in the `max-width: 720px` block, sets the map to `overflow: auto`, `height: auto`, and `min-height: calc(100vh - 180px)`. On the iPhone that box was 664px tall inside a page that was already scrolled. The sheet scrolls on `window`. The map is a second box in the middle of that page, and it has told the browser not to chain.

The token card is a third scroller, parked on top of the grid. `.ssdns-playercard` is `position: absolute`, `overflow: auto`, `max-height: calc(100% - 70px)`, and at the shared drawer rule it sets `overscroll-behavior: contain`. A drag that starts on the card scrolls the card. At the card's end the gesture stops. It does not move the map, and it does not move the page. On a phone the card is almost the whole map, which is why the usual "pull down to the tabs" drag never reaches the page.

A drag that does reach the canvas is taken by script. For a player, a one-finger press on empty map sets `state.drag = { pan: true }` and `onPointerDown` always calls `preventDefault` (`map/ssdns-map.js`, the empty-map branch and the `preventDefault` at the end of that function). `onPointerMove`, while panning, calls `preventDefault` and `stopPropagation` and writes `state.view.x` / `state.view.y` from the finger. There is no clamp and no leftover. The camera will pan past the picture, and the page never sees the touch. The wheel listener does the same `preventDefault` for a mouse wheel, which is the desktop version of the same idea: the map, not the page, owns the gesture.

#### What to build

Make the phone Map tab a full-screen map, and put the way out on the map.

A bar stays pinned to the top of the map: **Back** and **My token**. Back leaves the map and the sheet tabs are right there. My token recenters the camera on the player's token. The map already does that once, when the scene loads and the player owns a token (`map/ssdns-map.js`, the `ownerUid === uid` view set). It needs a button, because a trapped pan is how people lose their token. The token card stays a drawer on that screen, collapsed by default or behind the header that already says "My token," so the grid is what the phone shows.

This is the option to build. The other two were considered and are worse fits.

Clamping the camera and chaining the leftover finger movement to the page only helps a drag that already reached the grid, and only after the picture hits an edge. The drag people actually make starts on the card, and the card's `overscroll-behavior: contain` eats it before any clamp runs. Doing it well also means taking `preventDefault` back off the pan and teaching `touch-action: none` to allow a pan on the page at the edge. That fights itself: a short drag near the edge yanks the sheet while someone was trying to aim.

One finger scrolls the page and two fingers pan the map, with a hint, would fix the trap. It fights the rest of this map. Move, a token drag, and the command menu are all one finger, and the empty-map press is already a one-finger pan. A hint is easy to miss in a fight. Nothing else on the map uses two fingers (there is no pinch handler), so the hint would be the only teacher.

Full screen is already a mode. `#btnMapFull` toggles `body.map-fullscreen`, and the mount becomes `position: fixed; inset: 0` (`map/ssdns-map.css`). The button itself becomes "Exit full screen," `position: fixed` at z-index 98, and a tap on it hits the button (checked on the iPhone: box at top 8, left 272, 110×40). So a fixed control above the map works. What it does not do is be the thing you already have when you get stuck. The inline map still sits in the page. If that button has scrolled off, the pan will not bring it back. On a phone, opening Map should be this mode, and Back should be in the bar from the start, not a second step you have to reach by scrolling.

The cost is that HP and Gear are a Back tap away instead of a scroll. That is the same kind of trip as changing tabs, and it is the trip that does not work today.

![Full screen already covers the phone. Exit is a fixed button. The card still covers the grid.](/opt/cursor/artifacts/mobile/scroll-iphone14-fullscreen.png)

### 2. On a phone the battle map is not the screen

The player map page keeps a ~320px character card in a left column. On a 390px phone that card is the screen. The grid starts near x=336 and runs off to the right (canvas box about 308px wide, right edge ~644). Reset view sits near x=665. A touch on the canvas did not open Move or Interact, and no token was in the visible cells.

Landscape (844px wide) is the same layout, not the stacked one. More of the grid shows, the zoom label is clipped (`1.C`), and the visible cells are still empty. Tokens are off that patch of the map.

The sheet Map tab, under 600px, is written to stack the card away (`assets/css/sheet.css` around the `#sheetDock` rules). That path could not be opened here: with no room the tab only says "Join a table to open the map." Landscape is wider than 600px, so that rule would not apply even after a join.

Until the map is the full phone screen in both portrait and landscape, a player cannot see their token, move, open a door, pick a lock, or take loot.

![Player map, iPhone portrait: the card is the screen](/opt/cursor/artifacts/mobile/iphone14-port-map-player.png)

![Player map, iPhone landscape: grid is a side column, no token](/opt/cursor/artifacts/mobile/iphone14-land-map-player.png)

There is no pinch handler in `map/ssdns-map.js`. The canvas sets `touch-action: none`, so the browser will not pinch-zoom it either. Zoom is the Grid slider, which is 26px tall and partly off the phone.

### Major. Map is not on the first row of tabs

Under 760px the tab strip does not wrap. It scrolls sideways, and the first screen ends in the middle of "Spells & Spell slots." Conditions, Map, Store, and Log are off to the right. Nothing says to swipe. After the strip is scrolled, Map is there (about 53×40, under a 44px target) and opens.

![360px phone, tab strip cut off](/opt/cursor/artifacts/mobile/android360-tab-map.png)

![iPhone, Map tab after the strip is scrolled](/opt/cursor/artifacts/mobile/iphone14-sheet-map-tab.png)

### What already works on a phone

Join is on the first screen: room code, Join, and "Not in a room." The code field takes focus. Join is about 42×40, a little under 44px. A real join was not tried.

New, Open, Save, and the other file buttons are large and in a grid that fits.

The dice (d4 through d100) are on the first screen and are big enough to tap. The count steppers under them are small (about 22px).

Gear shows Target and Cover without horizontal scrolling. A blank character has no attack row yet. Short rest and Long rest are on the Spells tab, on screen in portrait, about 81×40.

![iPhone, first screen](/opt/cursor/artifacts/mobile/iphone14-port-sheet-main.png)

![iPhone, Gear](/opt/cursor/artifacts/mobile/iphone14-port-tab-equip.png)

HP +/− and Damage sit further down Main. The page scrolls. They were not covered by a frozen bar in this pass.

## Later — DM on a phone

Not needed if players are the only ones on phones.

The DM tab strip also scrolls, and Map is past the right edge. On the iPhone the visible tabs stop at "Mu" of Music, so the Map tab is not on the first screen.

![DM page, Map tab not in view](/opt/cursor/artifacts/mobile/iphone14-port-dm-map.png)

The DM map itself, opened from the demo map, is a narrow column between the left tool list and the right DM Tools. Tokens are visible. The Maps menu opens and its items are readable. The Maps button is about 53×24. The floor strip is about 24px tall. The left list is very long (Ping through Walls). A thumb can use it, but it is a desktop page squeezed into a column.

![DM map, Maps menu open](/opt/cursor/artifacts/mobile/iphone14-port-maps-menu.png)

iPad portrait has room for this. The same three columns are still there, and the map buttons are still about 26px tall.

## Later — polish

- Many map and sheet controls are 24–40px tall (Reset view, Effects, rest, Join, Map tab, dice steppers). 44px is the comfortable minimum.
- Tooltips are `title` attributes. They do not show on a touch screen. The buttons themselves still work.
- The Log button floats over the bottom of the page. It can cover the last row of a form.
- A real keyboard was not opened (emulation does not shrink the visual viewport). The sticky tab bar plus the join bar already take the top of a short landscape phone. A field at the bottom of Main may sit under the keyboard. Check that on a device before calling it broken.
- Tab switches were quick. No long stall showed up in this pass.

## Fix plan

Each phase is its own draft and waits for Press.

**Phase 1. Players can play.** Item 1 is the gesture. On a phone, Map opens as the full-screen map, with a bar that stays put: Back, and My token. One finger pans only inside that screen. Back is how you reach the tabs, HP, and Gear. The same mode is how the grid becomes the phone screen (item 2): the card is a drawer, in portrait and landscape, not a 320px column. The token is on screen. Tap opens Move / Interact. The zoom control is on screen and at least 44px, or two-finger zoom works. The Map tab is in the first screen of tabs (shorter labels, or Map pinned). Join stays as it is. Do not restyle the DM page in this phase.

**Phase 2. DM on a phone.** Map tab reachable without a hunt. Side panels collapse. Maps menu, floor strip, and token menus stay on screen and can be tapped. Same 44px bar as the player map.

**Phase 3. Polish.** 44px targets, the Log button not covering fields, keyboard overlap on Main and Gear, and the tiny dice steppers.
