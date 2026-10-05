# Table music

The DM Command Center loads this list from `tracks.json`. No audio ships with the repo. If a file is missing, play fails silently (the DM panel notes that the file is not there yet).

Drop MP3 or WAV files in this folder (`assets/music/`):

- `saloon.mp3`
- `trail.mp3`
- `gunfight.mp3`
- `hex.mp3`

To add a track, add an object to the `tracks` array:

```json
{ "id": "night-ride", "title": "Night ride", "file": "night-ride.mp3" }
```

`id` is a short key. `file` is the filename in this folder. Then refresh the DMCC Music tab.

Players only hear a track when the DM turns on **Also play on players' devices**. Their browsers may block autoplay until they tap **Tap to hear**.
