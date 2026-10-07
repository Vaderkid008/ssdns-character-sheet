# Run your own table

Six-Shooters & Sorcery: Dust and Shadows — character sheet and DM Command Center.

The same guide as a web page (easier on a phone):

**https://vaderkid008.github.io/ssdns-character-sheet/setup/**

This page is for a DM who wants their own table. You make a copy of the app, connect a Firebase project on your Google account, and send your players your link. The foundation is solid, and the tool will keep improving.

The first time through is a string of clicks on GitHub and Firebase. After that, a night starts with **Create room**.

You need a free GitHub account and a Google account. Firebase’s free plan covers a home game. If it offers Hosting or an upgrade, skip both.

These clicks are easier on a computer. The sheet and the DM screen themselves are comfortable on a phone.

---

## What this is

Two pages, one game.

| | |
|---|---|
| Player sheet | https://vaderkid008.github.io/ssdns-character-sheet/ |
| DM Command Center | https://vaderkid008.github.io/ssdns-character-sheet/dm/ |
| Demo mode (start here, no account) | https://vaderkid008.github.io/ssdns-character-sheet/dm/?demo=1 |

**Open the demo first.** Demo mode works offline. It fills the screen with sample players so you can learn the buttons. It does not use Firebase, and the sample room code exists only in that browser.

Each character stays on its own phone or computer as a `.ssdns` file. That file is a save you can keep, move, or send. **Save** writes it. **Open** loads it. Nothing about the character is stored on GitHub.

**Firebase** is Google’s backend. Here it only syncs the live table: the room, rolls, chat, HP pushes, handouts, and the other things the table shares while you play. It is a private channel for one DM’s session, and each DM creates their own project.

---

## Quick start

Use this if you want to learn the screens on the public site before you host anything. A live room of your own still needs the fork in the next section.

1. **Learn the screen in Demo.** Open the [demo DM Command Center](https://vaderkid008.github.io/ssdns-character-sheet/dm/?demo=1). Click through Table, Fight, Store, and the feed. Leave **Demo** checked. That practice table is not a live room.

2. **Create your own Firebase project.** Sign in at [console.firebase.google.com](https://console.firebase.google.com/) with a Google account. Click **Add project**. Name it anything. Google Analytics is optional; you can turn it off.

3. **Turn on Realtime Database and Anonymous sign-in.**
   - **Realtime Database** is the shared notebook for the room. Left sidebar: **Build → Realtime Database → Create Database**. If you see Firestore, that is a different product. Leave it alone.
   - **Anonymous** sign-in lets the DM and the players connect without an email. Firebase gives each browser an id. **Build → Authentication → Sign-in method → Anonymous → Enable → Save**. Click **Get started** first if Authentication asks.

4. **Add authorized domains.** An authorized domain is a website address Firebase will accept sign-ins from. Open **Authentication → Settings → Authorized domains → Add domain**.
   - Add `vaderkid008.github.io`
   - Add `localhost` (for tests on your own computer)

   Adding `vaderkid008.github.io` does not move the public sheet onto your project. That site already has its own config in its files. Your real domain is the one you add after you fork: `your-username.github.io`.

5. **Create a Web app and copy the config.** Gear icon → **Project settings** → **Your apps** → the Web icon (`</>`). Nickname it anything. Skip Firebase Hosting. Click **Register app**. Copy `apiKey`, `authDomain`, `databaseURL`, `projectId`, `storageBucket`, `messagingSenderId`, and `appId`. If the snippet also shows `measurementId`, you can leave that one out.

6. **Your config belongs in your fork.** The pages at vaderkid008.github.io already contain a Firebase config, and only the owner of that repository can change those files. Your config has to live in a copy you control. **Fork the repo, turn on GitHub Pages, and paste your config there.** That is the next section, and it is the path for a real table.

---

## Fork and host your own copy

A **fork** is your own copy of the project on GitHub. **GitHub Pages** is GitHub’s free host for the files in that copy. Firebase stays on your Google account. Players use your Pages address, and your rooms live in your database.

1. **Fork the repository.**
   1. Sign in at [github.com](https://github.com/).
   2. Open [Vaderkid008/ssdns-character-sheet](https://github.com/Vaderkid008/ssdns-character-sheet).
   3. Click **Fork** (top right).
   4. Leave the name as `ssdns-character-sheet` and click **Create fork**.

   If you already use git on your computer, cloning and pushing to a new repository works too. The clicks above are enough.

2. **Turn on GitHub Pages.**
   1. On *your* fork, click **Settings**. That is the repository settings tab, not your account settings.
   2. In the left sidebar, click **Pages**.
   3. Under Build and deployment, choose **Deploy from a branch**.
   4. Branch: **main**. Folder: **/ (root)**. Click **Save**.
   5. Wait until Pages says the site is live. The first build often takes a minute or two. A yellow dot means it is still working.

3. **Your sheet address:** `https://<your-username>.github.io/ssdns-character-sheet/`

   Use the lowercase form of your GitHub username. If you renamed the fork, use that repository name in the address instead of `ssdns-character-sheet`.

4. **Your DM Command Center:** `https://<your-username>.github.io/ssdns-character-sheet/dm/`

   This guide is on your copy too, at `…/setup/`.

5. **Create a Firebase project.**
   1. Open [the Firebase console](https://console.firebase.google.com/) and sign in with a Google account.
   2. Click **Add project**. Name it anything, such as `dust-table`.
   3. Google Analytics is optional. You can turn it off.
   4. Wait until the project overview opens.

6. **Create the Realtime Database.**
   1. Left sidebar: **Build → Realtime Database**.
   2. Click **Create Database**.
   3. Prefer location **us-central1** when it is offered. That matches a database address ending in `-default-rtdb.firebaseio.com`.
   4. If the console only offers another region, create it there. Then copy the database URL shown on the **Data** tab. You will paste that exact URL into `databaseURL` in step 10. A mismatched URL is a common reason Live mode fails.
   5. Start in **locked mode**. Locked mode denies everyone until you publish rules in the next step. Test mode would leave the room readable for a while. Choose locked mode.

7. **Publish the database rules.**
   1. On your fork, open [`database.rules.json`](./database.rules.json). Select all of it and copy.
   2. In Firebase: **Realtime Database → Rules**.
   3. Replace the rules in the editor with what you copied.
   4. Click **Publish**.

   Until you publish, the app can sign in and still be refused when it tries to write a room.

   If you already use the Firebase command-line tool, this repo includes `firebase.json`. From your clone, run `firebase use --add` and pick your project, then `firebase deploy --only database`. The console paste is enough.

8. **Turn on Anonymous sign-in.**
   1. **Build → Authentication**.
   2. If you see **Get started**, click it.
   3. Open the **Sign-in method** tab.
   4. Click **Anonymous**, switch **Enable** on, and click **Save**.

   The DM and the players both sign in this way. The DM’s id is what marks that browser as the one running the room.

9. **Add a Web app and copy the config.**
   1. Gear icon → **Project settings**.
   2. Scroll to **Your apps**.
   3. Click the Web icon (`</>`).
   4. Nickname: anything, such as `ssdns-table`. Skip Firebase Hosting.
   5. Click **Register app**.
   6. Copy `apiKey`, `authDomain`, `databaseURL`, `projectId`, `storageBucket`, `messagingSenderId`, and `appId`.

   That block is client config. The browser has to be able to read it, so it is public by design for this kind of web app. It is not a server password. The rules file is what decides who can read and write.

10. **Put your config in the fork.** A fresh fork still has the original project’s config in `assets/js/firebase-config.js`. Replace all seven values before you create a live room. Until you do, leave **Demo** on.
    1. On your fork, open `assets/js/firebase-config.js`.
    2. Click the pencil (**Edit this file**). You need to be signed in as the owner of the fork.
    3. Replace the seven values inside `SSDNS_FIREBASE_CONFIG`. Leave the rest of the file as it is.
    4. Click **Commit changes**. Choose **Commit directly to the `main` branch**. A message such as “Use my Firebase project for live rooms” is plenty.
    5. Wait until GitHub Pages is green again. Settings → Pages, or the Actions tab, shows the build.

    The values look like this. Yours will be different. A long `apiKey` is normal.

    ```javascript
    root.SSDNS_FIREBASE_CONFIG = {
      apiKey: "PASTE_YOURS",
      authDomain: "YOUR-PROJECT.firebaseapp.com",
      databaseURL: "https://YOUR-PROJECT-default-rtdb.firebaseio.com",
      projectId: "YOUR-PROJECT",
      storageBucket: "YOUR-PROJECT.firebasestorage.app",
      messagingSenderId: "PASTE_YOURS",
      appId: "PASTE_YOURS"
    };
    ```

    `databaseURL` must be the URL from your Realtime Database **Data** tab, including `https://`. One file serves both the sheet and the DM screen.

11. **Authorize your website.**
    1. Firebase → **Authentication → Settings → Authorized domains**.
    2. Click **Add domain**.
    3. Add `<your-username>.github.io` with no `https://` and no path.
    4. Add `localhost` if you will test on your own computer. If the address bar says `127.0.0.1`, add `127.0.0.1` as well.

    To poke at the files before Pages finishes, from a clone of your fork:

    ```bash
    python3 -m http.server 8765
    ```

    Then open `http://localhost:8765/dm/` for the DM screen and `http://localhost:8765/` for the sheet.

12. **Open a room.**
    1. Open your `/dm/` address from step 4.
    2. If the page still looks like the copy you forked, hard-refresh so the browser loads the new config. On Windows or Linux: Ctrl+F5. On a Mac: Cmd+Shift+R. On a phone, close the tab and open the link again.
    3. Turn **Demo** off. The status line should say Firebase is connected. If it snaps back to Demo, use the troubleshooting table.
    4. Type your name, and a session name if you want one.
    5. Click **Create room**.
    6. A code appears, shaped like `DUST-4821`. **Copy invite link** (or tap the big code) for a link players can open. **Copy code** if you only want the code.

13. **Players join.**
    1. Each player opens *your* sheet address from step 3.
    2. If the new-character wizard is on screen, finish it first. Join waits until a character exists. A character already on the device can join right away.
    3. On the **Table** bar, paste the code. An invite link fills the code in and still waits for one click.
    4. Click **Join**.

    Their card should show on your Table tab.

14. **End the session when you are done.** Click **End Session**. The ledger (the money log) is archived by default. An optional checkbox can also wipe the live room data.

    **Leave room / New session** only returns you to the lobby. The table keeps running until you end it.

---

## Running a session

A short map of the DM screen once a room is open.

**Lobby.** Opening `/dm/` stays on the lobby. If this browser still remembers a room, you get **Resume** (that room code) and **Start a new session**. Start a new session scrolls to the session name and puts the cursor there. It does not create a room, and it does not clear what you already typed. **Create room** is the button that opens a table.

**Invite link and room code.** **Copy invite link** builds a player link with `?room=CODE` from your site’s address. The big code copies that same link. The sheet fills in the code and still waits for **Join**.

**Fight strip and Next turn.** The Table tab shows a turn strip. The Fight tab has **Next turn**, and `N` does the same thing when you are not typing in a field. The screen says who is on deck. The fight layout is still getting easier to scan.

**Store.** Stock a General Store, Gun Store, Music Store, or Traveling Merchant. What you stage stays on the DM screen until you open the store for the table.

**Handouts.** Send a named note or an image link to one player or the whole table. A pack is a saved set of links.

**Rewards.** Push Eldorite shards (ES), an item, or a note to one player or everyone. The keyboard shortcut opens the form. It does not send until you confirm.

**Feed.** On a wide screen the table feed is the column on the right. On a phone it is a bottom sheet with an unread count. Filters are All, Chat, Money, Rolls, and Alerts. The box at the bottom messages the whole table or one player.

### Keyboard shortcuts

On the DM Command Center, these keys work when focus is not in a text field, a menu, or a checkbox, and not while an input method editor is composing. That editor is the popup some phones use to build a character before it lands in the field.

| Key | Action |
|-----|--------|
| `N` | Next turn in the fight tracker |
| `Alt+Shift+R` | Open the Rewards tab with the form ready. It does not send until you confirm. |
| `Alt+Shift+S` | Play the attack sound on this browser and send that cue to the table |
| `M` | Play or stop the track selected on the Music tab |

Plain `R` and `S` do nothing, so typing a name cannot grant shards or fire a sound. On an Elgato Stream Deck, map `Alt+Shift+R` and `Alt+Shift+S` to hotkey buttons. `M` stays quiet until a music file is in the folder below.

### Sound and music

Gun, holster, reload, reward, jam, and spell-shot cues already sit in `assets/sfx/`. A missing file stays silent. Music tracks are named in `assets/music/tracks.json` (`saloon.mp3`, `trail.mp3`, `gunfight.mp3`, `hex.mp3`). Those music files are optional. Add them beside the README when you want table music. Each folder’s README says how to add another file.

Players hear a track when you turn on **Also play on players' devices**. Their browser may wait until they tap **Tap to hear**.

---

## Troubleshooting

| What you see | What to do |
|---|---|
| Demo works. Turning Demo off snaps back. | Create the Realtime Database and turn on Anonymous sign-in. Set `databaseURL` to the URL on the Data tab, including the region when it is not us-central1. A 404 on that URL means the database was never created. The status line shows the Firebase message. |
| Couldn’t sync to players: permission denied | Publish [`database.rules.json`](./database.rules.json) on Realtime Database → Rules. An older paste refuses newer writes (table chat, private rolls, Inspiration). Confirm Anonymous is enabled so the browser is signed in. |
| `auth/unauthorized-domain` | Add the exact host under Authentication → Settings → Authorized domains. For Pages that is `your-username.github.io`, with no `https://` and no path. For a local test, add `localhost` or `127.0.0.1` to match the address bar. Reload after you add it. |
| Players never appear, or the sheet says “No room with code” and mentions Demo rooms. | They need the live code from **Create room** after Demo is off. A Demo code stays on the DM’s browser. The DM’s screen has to be in that live room when they click Join. |
| Players opened the public sheet and the code does nothing. | Send your fork’s sheet address. The public sheet talks to the Firebase config shipped with that site. Your room lives in the project you pasted into your fork. |
| The sheet works fine and never shows the table. | Solo play keeps the character on the device. The table starts when they paste the live code and click **Join**. |
| You committed the config and the DM screen is unchanged. | Wait for the green Pages check, then hard-refresh with Ctrl+F5 or Cmd+Shift+R. On a phone, close the tab and open the link again. |
| Create room sits on “Connecting…” | Anonymous sign-in or the database URL is still unfinished. Stay in Demo until the status line says Firebase is connected. Create room stays disabled while it is still connecting. |

---

## Privacy and ownership

Your fork is your copy of the app. Your Firebase project is where your rooms live. Each DM creates a project on their own Google account and points their fork at it.

Keep service-account files off the site and out of chat. A service account is a private key Firebase gives to servers (Project settings → Service accounts). It does not belong in `firebase-config.js`.

The seven values in `assets/js/firebase-config.js` are client config. Browsers have to read them, so they are public by design for this web app. They do not unlock the database. The published rules do. Share room codes with your players. Keep admin keys to yourself.

Characters remain `.ssdns` files on each device. Ending a session archives the ledger in your database. It does not upload character files to GitHub.
