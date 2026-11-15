# DM layout audit

Read-only notes on where the DM Command Center puts its controls, how often each one is used at the table, and a tighter grouping. This pass does not move those controls. Slice 5 only adds the map's Scenes menu and the floor switcher, which this note treats as the start of the top-bar group.

Play means something used while the party is in a scene or a fight. Prep means something used while building the night, between scenes, or once a session.

## Page chrome

The room opens under a brand bar, a status line, a room-code card, then ten tabs. A condensed turn strip stays mounted across tabs.

| Control | Where | Use |
| --- | --- | --- |
| Brand and "DM Command Center" | App bar, left | Never pressed. |
| Challenge | App bar, and again on the room-code card, and again on the map fight strip | Play, several times a scene. Three copies. |
| Header dice (`1d20` plus Roll) | App bar | Play, whenever a check is not on the Rolls tab. |
| Leave room / New session | App bar | Once a night, or never. |
| Copy code, Copy invite link | App bar | Once, when the table sits down. The room-code card already copies the code. |
| New code | App bar | Rare. Breaks the invite the table already has. |
| End Session | App bar | Once, at the end. |
| Demo / Sound / status | Status line | Setup. Sound is the one of these used during play. |
| Room code, presence, second Challenge | Room-code card | The code is for sitting down. Presence is a glance. Challenge is the duplicate. |
| Tabs: Table, Give, Rolls, Fight, Store, Lookup, Music, Notes, Map, Ledger (economy) | Under the room card | Map, Fight, Rolls, and Give are the play tabs. Store, Lookup, Music, Notes, and Ledger are prep or reference. "Ledger (economy)" is the only long label. |

## Table, Give, Rolls

| Control | Where | Use |
| --- | --- | --- |
| Track weight | Table | Prep, usually left off. |
| Party Inspiration, Grant +1, Spend −1 | Table, and the same pair again on Fight | Play, a few times a night. Two homes. |
| Open Saloon (all), Open Store (all), Send custom page | Table | Between scenes. |
| Advance day | Table | Once, when the day ends. |
| Player cards | Table | Play, to read a sheet. |
| Give modes: Money, Ammo, Item, Weapon, Starting kit, Note, Loot | Give | Loot and money during play. Starting kit is prep. The mode row is eight chips before the form. |
| Catalog, quantity, custom weapon, Place box, Open, Reroll, Hand-pick | Give | Play when a box is on the table. Prep when stocking one. |
| Pick who gets it, Undo last | Give | Play. |
| Lock inventory | Give | Rare. |
| Send handout, Save to list only, Save pack, private message, Export JSON / CSV | Give, lower folds | Handouts and messages are play. Export and packs are prep. |

## Fight

| Control | Where | Use |
| --- | --- | --- |
| + Enemy, Roll Initiative, End combat | Fight header | Play, once a fight. Roll Initiative is also on the map strip. |
| Turn portraits, focus, turn rules | Fight body | Play, every turn. |
| Next | Fight, and the map strip | Play, every turn. Two homes. |
| Undo last Next, Clear stale tokens | Fight | Undo is occasional. Clear stale is a recovery button, not a turn button. |
| Damage mode, Range override | Fight | Set once, then left. Range is the same switch as the map drawer. |
| Set order and add a combatant (folded) | Fight | Prep, or the start of a fight. |
| Damage and healing, Short rest (party), Long rest (party) | Fight, open by default | Damage is play. The two rests are also on the map's right bar. |
| Bestiary search | Fight, folded | Prep, and the map has its own Bestiary button. |

## Map

The map is the crowded surface. Its toolbar, left column, and right column stay up while the grid is on screen. In a fight the toolbar is docked into the map's turn strip.

| Control | Where | Use |
| --- | --- | --- |
| Grid, ?, zoom, Reset view | Map toolbar | Play, to frame a shot. |
| Maps ▾ | Map toolbar | Between encounters, Assets, My view, Set floor, Move party here, Choose who moves, Prep this map, Scene builder, All maps. Most of that is prep. Scene builder was easy to miss inside this menu. |
| Scenes ▾ | Map toolbar, beside the floor switcher (Slice 5) | Lists saved scenes. Load into room asks first when a scene is already loaded. Open Scene builder. DM only. Prep, at each new place. |
| Floor switcher | Map toolbar (Slice 5) | Stacked ▲ / ▼ floor names, current floor highlighted. DM sees a token count. Players see "You are on: …" and only floors the party is on or has already seen. Page Up / Page Down move the DM. Play, whenever someone changes floor. |
| Ping, Ruler, token color | Map left column, top | Play. |
| Containers, lock DC, Force DC, Allow retries, improvised lockpicking, Reset attempts | Map left column | Prep when the box is placed. Play when the DC changes. |
| Effects, Pills, Show downed, Fog, Show Player FOV, Edit tokens | Map left column, "View & Fog" | Fog and Edit tokens are play. The rest are taste and stay set. |
| Reveal / Hide shape, Erase, Delete selection, Undo, Redo, Hide/Reveal, Hide All, Reveal All | Map left column | Play in a dungeon, prep on a new map. Twelve controls for one job. |
| Wall, Room, Door, Secret, Window, Del Wall, Undo Wall, Clear Walls, Snap, Import Walls, Walls | Map left column | Prep. Import Walls sits with the wall tools, which is right, and the column is already long. |
| Short rest, Long rest | Map right column | Same pair as Fight. |
| Lock, Undo Move, Redo Move | Map right column | Play. |
| Add token, Bestiary, Randomize loot, Add player token, Party token, Duplicate, Copy, Paste, Delete | Map right column | Add and bestiary are the start of a fight. The clipboard row is prep. |
| Grant, Revoke | Map right column | Play, when a player runs a creature. |
| Sheet actions, Selected, Show range, Label, Ambient, light tools | Map right column and the token drawer | Play for the selected token. |
| Chat | Map dock | Play. |
| Take link | Link menu and the scene builder | DM move. Players now get Go / Stay on a visible link instead. |

## What is in the way

- Challenge has three buttons. Inspiration, short rest, long rest, Roll Initiative, and Next each have two.
- The app bar spends its width on Copy code, New code, and End Session, which are not used during a scene, and leaves one dice box as the only always-on play control.
- Scene builder lived inside Maps ▾. The new Scenes menu is the short path; the builder itself should stay a panel.
- The old floor chips named whoever was standing there, so changing floors meant reading a sentence. The switcher is the floor name, an arrow, and a count.
- The map's left column is a prep toolbox (fog drawing, walls, doors, locks) pinned open beside the grid. During a fight the DM needs Fog and little else from that list.
- "Ledger (economy)" and "Leave room / New session" are the labels that wrap or shove their neighbors.
- On a phone the map toolbar wraps. Scenes and the floor stack still fit, but the left and right columns do not belong on that width.

## Proposed grouping

Keep one top bar for the things a DM hits while people are playing. Open everything else as a panel.

Top bar, left to right:

1. Scenes ▾ — saved scenes, Load into room (confirm if one is already loaded), Open Scene builder.
2. Floors — the stacked switcher already on the map (▲ Upstairs, ▼ Ground), current floor highlighted, token counts for the DM. Players keep "You are on: …" and do not get the counts.
3. Initiative — Roll Initiative, Next, End combat. One copy. The map strip and the Fight header should not each grow their own.
4. Reveal — one Fog on/off, not the whole draw-a-polygon set.
5. Challenge — one button.
6. Dice — the header `1d20` and Roll, kept at the end of the bar.

Panels, opened from a tab or a single menu, not pinned beside the grid:

- Scene builder, walls, doors, and locks.
- Bestiary and "add a combatant."
- Give, loot boxes, and handouts.
- Store, Lookup, Music, Notes, Ledger.
- Party rest and the inspiration pool, once each.
- Session admin: copy code, new code, leave, end. A "Table" menu is enough. The room-code card can keep the code itself.

Slice 5 puts Scenes and the floor switcher on the map toolbar, next to each other, which is the right pair. Promoting that pair into the DM page bar, and pulling the duplicate fight buttons up beside them, is the follow-up. This audit does not do that move.
