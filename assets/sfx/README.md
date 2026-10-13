# Sound effects

The sheet and the DM Command Center look up sounds in `sfx.json`. A missing file stays silent. `SSDNSAudio.weaponCue` picks a cue in this order: an explicit `sfx` field, then `weapons[id]` in this file, then the weapon kind. `weapons` values are cue names, not filenames.

`sfx.js` fetches this file as `sfx.json?v=0.3.22`, the same sheet version as the rest of the playtest.

| Event | Filename | When it plays |
|-------|----------|----------------|
| attack | `attack.mp3` | Rifles, carbines, muskets, and any gun without a weapon override |
| revolver | `revolver.mp3` | Navy/Army, Herringer, and Chaosmaker |
| lever-fire | `lever-fire.mp3` | Henrietta and Lancaster repeaters, Dullards tube rifle, Lancaster lever shotgun |
| plinker | `plinker.mp3` | Dullards Plinker, when the sheet passes that weapon id |
| shotgun | `shotgun.mp3` | Farm shotgun and coach gun |
| buffalo | `buffalo-rifle.mp3` | Bison Big Fifty |
| bow | `bow.mp3` | Shortbow, longbow, and the two string bows, by id |
| spear | `spear.mp3` | Javelin and trail spear, and a named spear, javelin, or pike |
| axe | `axe-hit.mp3` | Hatchet, buffalo axe, tomahawk, and other named axes |
| slash | `slash.wav` | Blades, such as a machete |
| thud | `thud.wav` | Bludgeons, such as a sledgehammer |
| twang | `twang.wav` | A bow or thrown weapon that has no catalog id |
| whoosh | `whoosh.wav` | Anything else, such as a net |
| holster | `holster.mp3` | Unload, and Roll next to Initiative. `turn` uses the same file |
| reload | `reload.mp3` | A reload that is not a lever or a revolver |
| reload-lever | `reload-lever.mp3` | Reload when the gun's action says lever |
| reload-revolver | `reload-revolver.mp3` | Reload for a pistol, caster, revolver, derringer, pepperbox, plinker, or Chaosmaker |
| empty-click | `empty-click.mp3` | Firing an empty chamber |
| spellcast | `spellcast.mp3` | A cast that is not an attack and has no special tag |
| spellshot | `spellshot.mp3` | A spell attack |
| pactshot | `pactshot.mp3` | A Pact Seeker spell attack |
| lightning | `lightning.mp3` | A spell whose name says lightning or thunder |
| electric | `electric.mp3` | A spell whose name says shock, galvanic, or electric |
| teleport | `teleport.mp3` | A spell whose name says teleport or misty step. Stays on this client |
| heal | `heal.mp3` | A heal or cure spell, and a DM HP heal. Stays on this client |
| jam | `jam.mp3` | Firearm misfire |
| explode | `explode.mp3` | A cracked gun that blows |
| roll | `roll.mp3` | Ability rolls and the wizard's six scores |
| reward | `reward.mp3` | DM ES reward |

These cues are in the map and play when something sets `sfx` to that name. Nothing calls them on its own yet: `fuse`, `cock`, `revolver-spin`, `arrow-impact`, `silenced`.

Gunshots, melee, bows, spears, axes, and the lightning and electric spell tags can be shared at the table. Reloads, the empty click, holster, turn, reward, heal, and teleport stay on the client that played them.

The volume slider and the Sound checkbox scale every cue, including one that is already playing. Mute drops them to silence. A new cue does not cut off the previous one.
