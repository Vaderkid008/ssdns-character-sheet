# DM UI audit 2

The map works. Finding the control you want is the hard part. This note lists every DM control on the Map page, says how often it is used at the table, and whether it is buried. It then proposes a short map bar and a Scene Builder that goes one step at a time.

Nothing here is wired into the app. The pictures in [docs/mockups/](mockups/) are static HTML. Moving a button waits for a yes.

This supersedes `docs/dm-layout-audit.md` on draft #336. That note put Scenes ▾, a floor stack, initiative, Fog, Challenge, and dice on one bar. This bar is shorter. The page-chrome inventory from that note is folded in below, because the Map tab still sits under it.

Play means a control used while people are in a scene or a fight. Prep means building the night, between scenes, or once a session. Rare means a recovery or a setup switch. Buried means it is inside a menu, or down a column, so it is not visible when you are looking at the grid.

On the current main build, Scene Builder writes the library only when Save is pressed. Close, New, and refresh drop the draft and say nothing. That is the loss from the last session. Draft #341 autosaves that write. It does not change this layout. The mock-ups below are the layout on top of an autosave: a Saved note, and a warning when the latest change has not landed yet.

## Page chrome above the map

These stay on screen when the Map tab is open. They are not inside the map widget.

| Control | Where | How often | Buried |
| --- | --- | --- | --- |
| Brand, "DM Command Center" | App bar, left | Never pressed | No |
| Challenge | App bar, and again on the room-code card, and again on the map toolbar | Play, several times a scene | No. Three copies |
| Header dice (`1d20` and Roll) | App bar | Play, when the check is not on the Rolls tab | No |
| Leave room / New session | App bar | Once a night, or never | No |
| Copy code, Copy invite link | App bar | Once, when the table sits down. The room-code card already copies the code | No |
| New code | App bar | Rare. Breaks the invite the table already has | No |
| End Session | App bar | Once, at the end | No |
| Demo, Sound, status | Status line | Setup. Sound is the one used during play | No |
| Room code, presence, second Challenge | Room-code card | The code is for sitting down. Presence is a glance | No |
| Tabs: Table, Give, Rolls, Fight, Store, Lookup, Music, Notes, Map, Ledger (economy) | Under the room card | Map, Fight, Rolls, and Give are the play tabs. The others are prep or reference | No. "Ledger (economy)" is the long label |
| Turn strip | Under the tabs, including on Map | Play, every turn, once a fight is running. Portraits, Action / Bonus / Reaction, move pips | No, while a fight is up. Hidden when no fight is running |

Table, Give, Rolls, and Fight are the other pages. The duplicates that matter while the map is up: Challenge (three), Party Inspiration Grant and Spend (Table and Fight), Short rest and Long rest (Fight and the map's right column), Roll Initiative and Next (Fight, and the turn strip). This pass does not move those. It stops the map bar from growing a fourth copy of each.

## Map toolbar

`map/ssdns-map.js` draws this across the top of the grid. The DM role badge, Grid, help, zoom, and Reset view are always there. Challenge and Maps ▾ are DM only.

| Control | Where | How often | Buried |
| --- | --- | --- | --- |
| DM badge | Toolbar, left | Glance | No |
| Grid slider | Toolbar | Play, to frame a shot | No |
| ? | Toolbar | Rare | No |
| Zoom readout | Toolbar | Glance | No |
| Reset view | Toolbar | Play, sometimes | No |
| Challenge | Toolbar | Play, several times a scene. Same button as the app bar | No, and it is a duplicate |
| Maps ▾ | Toolbar | Opens the menu below | The button is visible. What is inside it is buried |
| Between encounters | Inside Maps ▾ | Between scenes | Yes |
| Assets | Inside Maps ▾ | Prep | Yes |
| My view | Inside Maps ▾ | Play, when the DM looks at a floor the party is not on | Yes |
| Set floor | Inside Maps ▾ | Play, to send the selected token to the picked floor | Yes |
| Move party here | Inside Maps ▾ | Play, when the whole party changes maps | Yes. This is a play button living in a prep menu |
| Choose who moves… | Inside Maps ▾ | Play, less often than Move party here | Yes |
| Prep this map | Inside Maps ▾ | Prep | Yes |
| Scene builder… | Inside Maps ▾ | Prep, at each new place | Yes. Easy to miss |
| All maps… | Inside Maps ▾ | Prep | Yes |
| Floor chips | A strip under the toolbar (`floorStrip`) | Play, whenever someone changes floor | The chips are visible. The label is a sentence: "Saloon: Jolene, Caleb". Changing floors means reading who is standing there |
| Dice lane | Under the toolbar, when the dice module is mounted | Play | No |

There is no scene name on this bar. The floor is only those chips.

## Left column

Pinned open beside the grid. On a phone it does not fit.

| Control | Where | How often | Buried |
| --- | --- | --- | --- |
| Ping | Top of the column | Play | No, if the column is on screen |
| Ruler | Top of the column | Play | No |
| Token color, custom color | Top of the column | Prep, then left | No |
| Container type, Place | Containers | Prep when the box is placed | Down the column |
| Easy / Medium / Hard, Lock DC, Force DC | Containers | Prep, and play when the DC changes | Down the column |
| Allow retries, Allow improvised lockpicking, Reset attempts | Containers | Rare during play | Down the column |
| Effects | View & Fog | Taste. Stays set | Down the column |
| Pills | View & Fog | Taste. Stays set | Down the column |
| Show downed | View & Fog | Rare. Off keeps 0 HP tokens out of targeting | Down the column |
| Fog | View & Fog | Play, in a dungeon | Down the column, under the taste switches |
| Show Player FOV | View & Fog | Play, when checking what a player sees | Down the column |
| Edit tokens (`dmEditBtn`) | View & Fog, after Effects, Pills, Show downed, Fog, and Show Player FOV | Play, whenever a token needs a free move. Walls, reach, and Move feet are ignored while it is on | Yes. It is the control people hunt for, and it looks like another fog switch |
| Reveal, and the shape (Box, Square, Poly, Brush) | Under View & Fog | Play in a dungeon, prep on a new map | Down the column |
| Hide, and its shape | Under View & Fog | Same job as Reveal | Down the column |
| Erase, Delete selection, Undo, Redo | Fog tools | Same job | Down the column |
| Hide/Reveal, Hide All, Reveal All | Fog tools | Same job. Twelve controls for fog | Down the column |
| Wall, Room, Door | Below a divider | Prep | Down the column |
| Secret | With the door tools | Prep | Down the column |
| Door edit (Locked, Lock DC, Ajar, Trap on fail) | Appears when a door is selected | Prep, and play when the lock changes | Hidden until a door is selected |
| Window, Del Wall, Undo Wall, Clear Walls | Wall tools | Prep | Down the column |
| Snap, Import Walls, Walls on/off | Wall tools | Prep. Import Walls is in the right group, and the column is already long | Down the column |

## Right column

Headed "DM Tools". It scrolls.

| Control | Where | How often | Buried |
| --- | --- | --- | --- |
| Short rest (party), Long rest (party) | Top | Between fights. The same pair is on the Fight page | No, at the top of this column. Duplicate of Fight |
| Lock, Undo Move, Redo Move | Token moves | Play | No |
| Add token | Under the move tools | Start of a fight, and prep | No |
| Bestiary | Under Add token | Start of a fight. Fight has its own bestiary search | No |
| Randomize loot | Under Bestiary | Once a fight, or never | No |
| Add player token, Party token | Under Randomize loot | Prep. The party token is a story marker, not a fighter | No |
| Duplicate, Copy, Paste, Delete | Clipboard row | Prep | No |
| Grant player, Grant, Revoke | Under the clipboard | Play, when a player runs a creature | A bit down |
| Sheet actions (`actionSlot`) | Selected token | Play | Fills in when a token is selected |
| Selected (`targetList`) | Selected token | Glance | Same |
| Show range, weapon | Selected token | Play | Same |
| Label | Selected token | Prep | Same |
| Sheet action list | Selected token | Play | Same |
| Ambient light | Light | Set once a map | Down the column |
| Light legend | Light | Glance | Down the column |
| Light rings (DM guide) | Light | Play, while measuring. Players never see the rings | Down the column |
| Player sight | Light | Rare | Down the column |
| Light region level, Paint region, Erase region | Light | Prep | Down the column |
| Test light, Douse lights, Relight | Light | Play, occasionally | Down the column |
| Condition, Toggle Cond, Down | Conditions | Play | Down the column |
| Zone spell, duration, caster, size, concentration, facing, Place on map | Spell grids | Play, when a zone is on the map | Down the column |
| Zone list | Spell grids | Glance | Down the column |
| +1 round, +1 min, +10 min, +1 hour | Time skip | Between rounds, or when time jumps | Down the column |
| Clear all grids | Spell grids | Rare | Down the column |

## Chat, and menus that open on a click

| Control | Where | How often | Buried |
| --- | --- | --- | --- |
| Chat, filters (All / Rolls / Talk), Character / Player names | Bottom dock | Play | The dock is visible. Pop out and Open in new tab are on its header |
| Pop out, Open in new tab, Dock | Chat header | Rare | No |
| Chest menu: Open, Pick lock, Force open, Loot, Reposition, Take | On the chest token | Play, at the box | Only while the chest is open |
| Asset menu: the prop's own actions, Reposition, Shove DC | On the prop | Play, at that prop | Only while the prop menu is open |
| Link menu, Take link | On a link | DM move. Players get Go / Stay on a visible link in draft #336, not on this build | Only while the link menu is open |

## Scene Builder today

Opened from Maps ▾ → Scene builder…. One scrolling panel. The library is a list under the form, sorted by name. Nothing marks the scene that is in the room. The buttons on a row (Export scene, Edit, Load into room, Delete) are the same size as New and Save.

The form holds every job at once: scene name, New / Save / Duplicate, add floor, per-floor start and order, spawn groups, links (kind, destination, landing, two-way, players see this, Take link), and the encounter block (chest, strongbox, enemy, reveal). Export library, Import library, Export pack, and Import pack sit above the list.

Scenes live in this browser, under `ssdns.sceneLibrary.v1`. The panel does not say that. Export is the backup, and it is a small button.

| Control | How often | Buried |
| --- | --- | --- |
| Scene name, New, Save, Duplicate | Prep, while building | The panel is already a buried entry |
| Add floor, reorder, Set start, Remove | Prep | Inside the panel |
| Spawn groups, Place spawn | Prep | Same panel, under the floors |
| Links and Take link | Prep, then a DM move | Same panel |
| Chests, strongboxes, enemies | Prep | Same panel, at the bottom of each floor |
| Export / Import library, Export / Import pack | Rare. This is the backup | Small, under the form |
| Library: Export scene, Edit, Load into room, Delete | Prep, at each new place. Load into room is the one that matters | Same-size buttons, no "this one is in the room" mark |

## What is in the way

- Edit tokens is a play switch dressed as a fog option. It sits after Effects, Pills, Show downed, Fog, and Show Player FOV.
- Move party here is a play button inside Maps ▾, next to Scene builder and All maps.
- The floor strip tells you who is standing on a floor, not which scene this is. There is no "Scene: Dry Fork" anywhere on the bar.
- Scene builder is one long form, and leaving it without Save throws the work away with no warning.
- The library does not say the scenes are only in this browser, and Load into room does not look like the main button.
- Challenge on the map toolbar repeats the app bar. The left column is a prep toolbox pinned open during a fight. The right column is a second page of tools under the fold.

## Proposed map bar

Four controls on the left. Framing stays on the right. Nothing else moves onto this bar.

1. **Scene: name · Floor.** A readout, `Scene: Dry Fork · Ground`, with a small ▾ for the other floors. This replaces the chips that read "Saloon: Jolene, Caleb". The scene name is the thing you were just in. The floor is the map you are looking at.
2. **Maps ▾**, directly left of Edit tokens. It keeps Between encounters, Assets, My view, Set floor, Choose who moves, Prep this map, Scene builder, and All maps. Move party here comes out of this menu.
3. **Edit tokens**, directly right of Maps ▾. Filled gold. Same switch as `dmEditBtn`: free-move, walls and Move feet ignored, off puts click-to-walk back. It is the one loud button on the bar.
4. **Move party here**, a quiet button after Edit tokens. Same action as today's menu item. Nothing moves until it is pressed.

At the far right: Grid, the zoom readout, Reset view, and ?. Challenge stays on the app bar. Dice stay on the app bar and the dice lane. Roll Initiative and Next stay on the turn strip and the Fight tab. Fog, walls, bestiary, and the rests stay in the columns until a later pass.

Draft #336's Scenes ▾ and stacked floor switcher are not added on top of this. The readout is the scene and the floor. Scene builder still opens from Maps ▾, and from Edit on a library card.

Pictures: [the bar today](mockups/dm-bar-before.html), [the proposed bar](mockups/dm-bar-after.html), [phone width](mockups/phone.html).

## Proposed Scene Builder

Five steps. One job on screen. A hint under the steps. Back and Next at the bottom.

| Step | Hint |
| --- | --- |
| 1 Floors | Add the maps this place uses, and pick where the party starts. |
| 2 Spawns | Drop a group on each floor. The default group is where people land. |
| 3 Stairs & doors | Place a link, then its landing on the other floor. |
| 4 Loot & enemies | Chests, strongboxes, and who is waiting. |
| 5 Save & load | This scene is already in this browser. Export a copy to keep it somewhere else. |

The scene name stays at the top of every step, with a **Saved** note beside it. The draft writes itself as you go. Close and refresh do not throw that away.

If the latest change has not been written yet (the note still says Saving…, or the browser could not store it), close and refresh ask first: stay, or leave and lose that change. They do not close quietly.

The library is cards, not a flat list. The scene in this room is marked **In this room**. Each card has a large **Load into room** and a large **Edit**. Export and Delete stay smaller. A line on the library says scenes are stored in this browser only, and Export is the backup.

Pictures: [the five steps, the warning, and the library](mockups/scene-builder.html). The phone picture includes the first step under the bar.

## What this pass does not do

- It does not edit `map/ssdns-map.js`, `map/scene-builder.js`, or any stylesheet the app loads.
- It does not merge the columns, the Fight duplicates, or the app-bar session buttons. Those are listed so the next pass can pick them up.
- It does not change where scenes are stored. They stay in this browser. The mock-up only says so, and makes Export obvious.
