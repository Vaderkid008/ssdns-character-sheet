# SSDNS Character Sheet

Fillable character sheet for **Six-Shooters & Sorcery: Dust and Shadows** (v0.2.3).

## Open it on your phone

In your phone’s browser, open:

**https://vaderkid008.github.io/ssdns-character-sheet/**

That page is the sheet. Nothing to install.

## Saving

Your character stays on your device. **Save** writes a `.ssdns` file (plain JSON you can keep, move, or send yourself). **Open** loads one of those files back in.

Nothing is uploaded to GitHub. This site only serves the blank sheet.

`example.ssdns` in this repo is a filled-in sample. Download it, then use **Open** on the sheet if you want to see one already filled out.

## DM Command Center

The **DM Command Center** lives at [`/dm/`](./dm/) in this repo (GitHub Pages). It is the same visual family as the character sheet (Rye / Fell / Oswald / Crimson) but with a darker gunmetal palette and Eldorite teal accents.

- **Demo mode** works fully offline (`/dm/?demo=1`) with fake players — no Firebase required.
- **Live rooms** sync through the Firebase project `ssdns-dm-hub` (Realtime Database + Anonymous auth). Characters still stay on each device as `.ssdns` files; only table snapshots, ledger, rolls, handouts, and DM commands go through the cloud.
- Players join from the sheet’s **Table** bar (room code like `DUST-4821`). See `DM-SETUP.md` for console steps and `PLAYER-JOIN-PATCH.md` for sheet wiring.

Config is shared in `assets/js/firebase-config.js`. Deploy `database.rules.json` to the Realtime Database before going live.
