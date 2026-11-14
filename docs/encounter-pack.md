# Encounter pack

A scene pack is a JSON file with `format: "ssdns-map-pack"` and `version: 2`. Picture maps live in `maps`. Floors, spawns, and links live on each scene. Encounter pieces live on the floor they sit on. The top-level `encounters` field stays `null`; that slot is unused.

You can write one of these by hand. An Encounter Bot file can be copied into this shape later. This build does not import a separate bot format.

## Where the pieces go

Put containers and enemies on the floor:

```json
{
  "format": "ssdns-map-pack",
  "version": 2,
  "maps": [],
  "encounters": null,
  "scenes": [
    {
      "id": "scene_cellar_job",
      "name": "Cellar job",
      "startFloorId": "floor_cellar",
      "floors": [
        {
          "id": "floor_cellar",
          "mapId": "scn_cellar",
          "name": "Cellar",
          "groups": [{ "id": "grp_party", "name": "Party", "isDefault": true }],
          "spawns": [{ "id": "spawn_1", "groupId": "grp_party", "n": 1, "x": 4, "y": 6 }],
          "stairs": [],
          "encounters": {
            "containers": [
              {
                "id": "box_strongbox",
                "kind": "chest",
                "name": "Lockbox",
                "x": 8,
                "y": 5,
                "items": ["Gold bar x2", { "name": "Key", "qty": 1, "catalogId": "iron-key" }],
                "lockDc": 15,
                "forceDc": 15,
                "unlocked": false,
                "allowRetries": false,
                "improvise": false
              }
            ],
            "enemies": [
              {
                "id": "foe_outlaw",
                "bestiaryId": "outlaw",
                "name": "Outlaw",
                "x": 10,
                "y": 5,
                "hidden": true,
                "initGroup": "Cellar",
                "xp": 25,
                "hp": 11
              }
            ]
          }
        }
      ]
    }
  ]
}
```

`kind` is `chest` or `strongbox`. A strongbox with no `forceDc` uses 25. A chest uses 15. `items` is a list of strings (`Name` or `Name x2`) or `{ name, qty, catalogId }`. `catalogId` points at the existing item catalog. Free text is fine. `allowRetries` false means one try per character. `improvise` lets that container be picked at disadvantage without tools. `hidden` defaults to true. `hp` is the creature's hit points on the token. It is never written onto a character.

`scene.encounters` in a saved pack is a summary (`xp`, `containers`, `enemies`, `hidden`, `loot`). You can omit it. On import it is rebuilt from the floors. If you would rather not edit each floor, you can instead set `scene.encounters.floors` to a list of `{ mapId, containers, enemies }` and leave the floor lists empty. Do not put the same piece in both places; import would keep both.

Builtin maps are named by `mapId` (`scn_dustyspur01`, `scn_upstairs`, and the rest of the pack). A custom map also needs a `maps[]` row with `id`, `name`, and `src` (an https URL or a data image). Do not paste a huge image into the file.

## Load into room

Load copies each container onto its floor with the existing chest lock, force, and loot behavior, and each enemy as a token. A piece whose id is already in the room is left alone. Nothing is deleted. Character hit points are not written. The party's active tokens land on the start floor's default spawn spots. Copies that are not the active token stay where they are. Hidden enemies are omitted from the player view until the DM presses Reveal or Reveal all.

Spawns and two-way stairs from earlier slices travel in the same file.
