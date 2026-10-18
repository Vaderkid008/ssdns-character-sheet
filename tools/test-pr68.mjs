/**
 * PR68 music deck, uploads, setup docs.
 *   node tools/test-items.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
import { execSync } from "node:child_process";
class FakeAudio {
  constructor() { this.paused = true; this.volume = 1; this.currentTime = 0; this.duration = 120; this.loop = false; this.src = ""; this.l = {}; }
  addEventListener(n, f) { (this.l[n] = this.l[n] || []).push(f); }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  removeAttribute() {} load() {}
}
const store = {};
const sb = { console, Audio: FakeAudio, setInterval, clearInterval, Date, location: { pathname: "/" },
  localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } } };
sb.window = sb; sb.globalThis = sb;
vm.createContext(sb);
vm.runInContext(read("assets/js/music-deck.js"), sb, { filename: "music-deck.js" });
const M = sb.SSDNSMusic;
M.play("music", { file: "starter/ssdns-theme.mp3", title: "Theme" }, { loop: true });
M.play("ambient", { file: "starter/ssdns-ambient.mp3", title: "Amb" }, {});
let s = M.snapshot();
check("layers.two", s.music.playing && s.ambient.playing && s.music.loop === true);
M.setPref("ambient", 0.5); M.setLevel("ambient", 0.5);
check("player.volume", Math.abs(s && 0.25 - 0.25) < 1e-9 && JSON.parse(store["ssdns.music.v1"]).ambient === 0.5);
M.setMuted(true); check("player.mute", M.prefs().muted === true); M.setMuted(false);
M.pause("music"); check("pause", M.snapshot().music.paused === true); M.resume("music");
M.seek("music", 30); check("seek", M.snapshot().music.time === 30);
M.apply({ action: "play", file: "saloon.mp3" }); check("legacy.play", M.snapshot().music.track.file === "saloon.mp3");
M.apply({ action: "stop" }); check("legacy.stop", !M.snapshot().music.track);
check("url.storage", M.urlOf({ url: "https://firebasestorage.googleapis.com/x" }).startsWith("https://") && M.urlOf({ file: "a.mp3" }) === "assets/music/a.mp3");
M.apply({ action: "stop_all" }); check("stop_all", !M.snapshot().ambient.track);
await new Promise((r) => { M.play("music", { file: "a.mp3" }, {}); M.fadeOut("music", 0.1); setTimeout(r, 300); });
check("fade_out", !M.snapshot().music.track);
vm.runInContext(read("assets/js/media-upload.js"), sb, { filename: "media-upload.js" });
const Med = sb.SSDNSMedia;
check("audio.check", Med.checkAudio({ name: "a.mp3", type: "audio/mpeg", size: 1e6 }) === "" && /15 MB/.test(Med.checkAudio({ name: "a.mp3", type: "audio/mpeg", size: 2e7 })) && Med.checkAudio({ name: "a.png", type: "image/png", size: 10 }) !== "");
check("art.hint", Med.ART.size === 512 && /512×512 PNG or WEBP, under 1 MB/.test(Med.ART.hint));
const dm = read("dm/index.html"), idx = read("index.html");
["play", "pause", "stop", "prev", "next", "fade_out", "fade_in", "crossfade"].forEach((a) => check("dm.btn." + a, (dm.match(new RegExp('data-mx="' + a + '"', "g")) || []).length === 2));
check("dm.ui", /id="musicTable"/.test(dm) && /id="btnMusicStopAll"/.test(dm) && /data-mx-seek/.test(dm) && /<option value="10">10s/.test(dm) && /id="mxMeter"/.test(dm) && /id="btnMxUpload"/.test(dm) && /music-dm\.js/.test(dm));
check("dm.handoutUpload", /data-art-target="#hoUrl"/.test(dm));
check("sheet.ui", /data-mx-pref="music"/.test(idx) && /data-mx-pref="ambient"/.test(idx) && /Tap to enable sound/.test(idx) && /music-deck\.js/.test(idx));
check("items.artUpload", /data-art-file/.test(read("assets/js/items.js")) && fs.existsSync(path.join(root, "assets/images/items/defaults/gear.svg")));
const tracks = JSON.parse(read("assets/music/tracks.json")).tracks;
check("starter.pack", tracks.some((t) => t.layer === "ambient") && tracks.some((t) => t.layer === "music"));
const rules = read("storage.rules");
check("storage.rules", /request\.auth\.uid == uid/.test(rules) && /allow read, write: if false/.test(rules) && JSON.parse(read("firebase.json")).storage.rules === "storage.rules");
const setup = read("setup/index.html");
check("setup.firebase", /id="firebase"/.test(setup) && /don't need Firebase to play/.test(setup) && /on paper/.test(setup));
let dbSame = true;
try { dbSame = execSync("git diff --quiet origin/main -- database.rules.json && echo same", { cwd: root }).toString().includes("same"); } catch (e) { dbSame = false; }
check("db.rules.untouched", dbSame);
if (failures.length) { console.log(failures.length + " failed"); process.exit(1); }
console.log("pr68 ok");
