# Scenes and floors

A proposal for how the map should grow. No code in this note. Sheet 0.3.302 is only the token-link fix. Each phase below is its own draft and waits for Press.

## What we have today

A **scene** is one picture plus its own walls, fog, lights, and props. The id looks like `scn_upstairs`. A token stores `sceneId`. The DM's screen (`My view`, the library, a floor-strip chip) is not the player's place. The player follows their **active** token.

**Move party here**, **Choose who moves**, and **Send to** change that token's `sceneId`. A **prep ghost** is a grey mark only the DM sees. **Move** turns the ghost into the real square, or uses the party spawn, or the center. **Between encounters** is the title cover (`scn_between`).

**Duplicates** are extra tokens with the same sheet link. **Grant** adds a player to `controlledBy`. It must not take the sheet off the character token or change which copy is the active view.

Fog, walls, and lights already live on the scene. Nothing is stored as "explored fog." Map packs (`map/map-packs.js`) and the DM's library (`map/dm/library`) are the pictures and grids we already ship.

## What is confusing

One word, "scene," means the picture, the floor, and the place. Dusty Spur's saloon and upstairs are two scenes that happen to share a group name. Ellen Manor is four scenes. There is no stair that knows the other end.

The floor strip lists maps, not a place made of floors. Prep and Go live in the Maps menu, not on the place you are staging.

A token id, an owner, a sheet id, and a combatant id have all been asked to mean "this is the character." Linking a second token used to delete the first. That is the bug fixed in 0.3.302.

## The clean model

**Scene.** One location or one encounter. "Dusty Spur," "Ellen Manor," "Dry Fork," "the showcase."

**Floor.** One map inside a scene. Own picture, grid, walls, fog, lights, props, and spawn points. Stairs, ladders, and doors name another floor and a landing square.

**Character token.** One per player. It is the sheet. Position is scene + floor + square. HP, temp HP, damage, conditions, exhaustion, concentration, and the lights that belong to the character stay on that link. Moving the token changes the square, not the sheet.

**Extra tokens.** Duplicates, horses, summons. A duplicate uses the same sheet. Grant only adds control. The DM can delete an extra. The character token stays.

**Prepared spots.** Per scene, the DM can mark where each player will stand before anyone moves.

Players see the floor their character token is on. Other floors of the same scene are not drawn. A later option can show the floor above or below as a faint picture. Not in the first build.

## Where today's maps go

Every current scene id stays valid. A room that only knows `scn_upstairs` still opens that picture. Automatic conversion wraps each old id as a Scene with one Floor, using the same id, so nothing is rewritten until a person groups floors.

| Today | Becomes |
| --- | --- |
| `scn_dustyspur01` Dusty Spur Saloon | Floor "Saloon" of Scene "Dusty Spur" |
| `scn_upstairs` Dusty Spur · Upstairs | Floor "Upstairs" of the same scene. A stair on the saloon can point here. |
| `scn_street` Main Street | Its own Scene "Main Street," one floor. It is the town, not a level of the saloon. |
| `scn_plains_day` / `scn_plains_night` | Two Scenes, or one Scene with a day floor and a night floor. Not stacked like a building. The night notes stay on the floor. |
| `scn_ellen_grounds` | Floor "Grounds" of Scene "Ellen Manor" |
| `scn_ellen_cellar` | Floor "Cellar" |
| `scn_ellen_2f` | Floor "2nd floor" |
| `scn_ellen_3f` | Floor "3rd floor" |
| `scn_dry_fork` Dry Fork Water Stop | Scene "Dry Fork," one floor. Its play data (spawns, props, tokens) is the seed of an encounter pack. |
| `scn_between` Between encounters | Not a building floor. It stays the table scene between fights. |
| `world_deadwood`, `world_new_eldorado` | Overworld scenes. Opening one still makes a floor with the world image, as it does now. |
| A library map ("mine") | A Floor the DM can drop into any Scene. The image, grid, and snapshot move as they are. |

Pictures, walls, fog, lights, props, assets, and spawns are copied onto the floor. Pack files are not thrown away. The pack keeps shipping the pictures. The scene file only points at them.

## Scene Builder

This extends the library, it does not replace it.

Today a DM adds a map: name, image link or upload, columns, rows. That still creates a Floor. The builder adds the place around it.

1. **New scene.** Name it. It starts with no floors, or with the map that is open.
2. **Add a floor.** Pick a pack map, a library map, or upload a picture the same way "New map" works now. Reorder floors (cellar, ground, upstairs). Remove a floor from this scene without deleting the picture from the library.
3. **Link levels.** On a floor, mark stairs, a ladder, or a door, and pick the other floor and the landing square.
4. **Spawns.** Party entry, and a prepared square per player. The prepared square is the ghost from 0.3.300, saved with the scene.
5. **Save.** The scene is a library entry. It can be loaded into any room. Export and import use the same JSON shape as a map pack, plus a `scenes` list. Old packs that only have `scenes` (the pictures) still import. Each picture becomes a one-floor scene.

A saved scene does not copy the image bytes into a second file. It stores the pack or library id and the image path it already has.

## Encounter packs

This is the next phase after the builder, because the spoiler-free showcase needs it. It is not a later idea.

A saved scene can also hold the fight that belongs on it:

- Chests and strongboxes, with real items, lock DC, and Force DC. They use the chest token we already place.
- Enemy tokens from the bestiary, hidden until the DM reveals them.
- Party spawn squares.

Encounter Bot, Story, and Art can write this JSON and the DM imports it. Loading it into a room copies the floors and the placed pieces. It does not overwrite a player's sheet.

**Showcase slice.** Chests with set items and DCs, hidden bestiary tokens, party spawns, and export/import. Stairs and multi-floor buildings can wait one Press if the showcase is a single floor. Dry Fork's `play` block is the pattern: spawns, tokens, and props already sit on one map.

**Shape.**

```json
{
  "id": "scn_showcase",
  "name": "Showcase",
  "floors": [
    {
      "id": "floor_showcase",
      "mapId": "scn_dry_fork",
      "image": "packs/showcase-dry-fork/showcase-dry-fork_40x30_70px.png",
      "spawns": [{ "id": "party", "x": 1, "y": 15 }],
      "props": [
        {
          "id": "chest_1",
          "kind": "chest",
          "x": 27,
          "y": 17,
          "name": "Strongbox",
          "lock": { "dc": 13, "forceDc": 13 },
          "contents": [{ "name": "Healing potion", "qty": 1 }]
        }
      ],
      "enemies": [
        { "id": "en_1", "beastId": "outlaw", "x": 16, "y": 12, "hidden": true }
      ]
    }
  ]
}
```

**Check on import.** The file must be JSON. Each floor needs an id and an image or a known `mapId`. Coordinates are numbers inside the grid. A chest needs a name. Lock DCs are numbers. An enemy needs a bestiary id that exists. Hidden is true or false. Unknown fields are kept but not required. A bad floor is skipped and named in a toast. A good floor still loads. Nothing in the file may include character HP.

## Phases

Each one is a draft. Nothing merges until Press.

1. **Names and links (this is mostly data, after 0.3.302).** Wrap every current map as a one-floor scene. Old `sceneId`s still open. The character token stays the sheet. No new buttons yet.
2. **Scene Builder.** Create, reorder, remove floors, link stairs, set spawns, save, export, import. Pack maps and library maps are the floors you add.
3. **Encounter packs (showcase).** Chests with items and DCs, hidden bestiary tokens, party spawns, JSON in and out. Enough for Encounter Bot to author the spoiler-free showcase and for the DM to load it into a room.
4. **Play.** Walking stairs asks for the landing. Split party across floors. Optional faint view of the floor above or below.

## A night at the table

The party is on the saloon floor. The DM opens the cellar floor and clicks Prep. Ghosts mark the squares. Players still see the saloon, and their sheets do not change. **Move party here** sends the people who were checked. Their character tokens arrive on the ghosts. HP, conditions, concentration, and lights come with those same tokens. Someone left upstairs stays upstairs until **Send to**. A horse was granted, not linked as the character, so the character token is still on the map.

## Risks

- Grouping floors wrong (street inside the saloon) is a content choice. Default is one floor per current map. A person groups them.
- Two sources of "the character" (token id and sheet id) caused the token to vanish. 0.3.302 keeps one character token and treats every other grant as control.
- Import must refuse character HP so a pack cannot overwrite a sheet.
- Fog stays per floor. Do not invent explored-fog memory in the first phase.
