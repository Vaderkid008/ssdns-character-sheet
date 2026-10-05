# Sound effects

The sheet and the DM Command Center look up sounds in `sfx.json`. No audio ships with the repo. If a file is missing, playback fails silently.

Drop MP3 or WAV files in this folder (`assets/sfx/`) using these names:

| Event | Filename | When it plays |
|-------|----------|----------------|
| attack | `attack.mp3` | Gun attack roll, or tapping a loaded chamber |
| reload | `reload.mp3` | Reload |
| spellcast | `spellcast.mp3` | Hex lead shell / casting |
| reward | `reward.mp3` | DM ES reward |
| jam | `jam.mp3` | Firearm natural 1 |
| explode | `explode.mp3` | Cracked gun fails its explode check |

WAV works too. Point the JSON value at the filename, for example `"attack": "attack.wav"`.

To add a new event, add a key to `assets/sfx/sfx.json` and call `SSDNSAudio.play("your-event")` from the sheet or DMCC. Put the file next to this README.
