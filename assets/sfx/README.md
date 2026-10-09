# Sound effects

The sheet and the DM Command Center look up sounds in `sfx.json`. A missing file stays silent. `roll.mp3` (and `roll.wav`) play on ability rolls and the wizard's six scores. `explode.mp3` is mapped for a gun that blows; the file is not in the repo yet, so that cue stays silent.

| Event | Filename | Length | When it plays |
|-------|----------|--------|----------------|
| attack | `attack.mp3` | 5.0s | Gun attacks. Every gun uses this cue unless a weapon sets its own `sfx` |
| slash | `slash.wav` | short | Blades and slashing weapons, such as a scimitar or machete |
| thud | `thud.wav` | short | Bludgeoning weapons and unarmed strikes |
| twang | `twang.wav` | short | Bows and thrown weapons |
| whoosh | `whoosh.wav` | short | Anything that is not a gun, blade, bludgeon, bow, or thrown weapon |
| holster | `holster.mp3` | 1.5s | **Unload**, and **Roll** next to Initiative (drawing the gun) |
| reload | `reload.mp3` | 0.7s | **Reload** (including Tactical Reload) once rounds go in, and loading a hex shell |

The volume slider and the Sound checkbox scale every cue, including one that is already playing. Mute drops them to silence. A new cue does not cut off the previous one.

These names are still in `sfx.json` and play when a file is added later:

| Event | Filename | When it plays |
|-------|----------|----------------|
| spellcast | `spellcast.mp3` | Casting a spell, including Cast through gun |
| reward | `reward.mp3` | DM ES reward |
| jam | `jam.mp3` | Firearm misfire |
| explode | `explode.mp3` | Cracked gun fails its explode check |

WAV works too. Point the JSON value at the filename, for example `"jam": "jam.wav"`.

To add a new event, add a key to `assets/sfx/sfx.json` and call `SSDNSAudio.play("your-event")` from the sheet or DMCC. Put the file next to this README.
