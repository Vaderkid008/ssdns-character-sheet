/**
 * Music end to end (sheet 0.3.54 / DMCC 0.2.67): starter pack, pasted link, Storage upload (mocked).
 * DM page (jsdom, real Music panel HTML + music-deck + media-upload + music-dm) pushes commands;
 * a player page (jsdom, music-deck) applies them. Every method must push the same shape and the
 * player must end in the same state.   node tools/test-music-e2e.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id);
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function fakeAudioClass(win, log) {
  return class FakeAudio {
    constructor() { this.paused = true; this.volume = 1; this.currentTime = 0; this.duration = 90; this.loop = false; this._s = ""; this.l = {}; log.push(this); }
    set src(v) { this._s = v; if (v) setTimeout(() => (this.l.loadedmetadata || []).forEach((f) => f()), 2); }
    get src() { return this._s; }
    addEventListener(n, f) { (this.l[n] = this.l[n] || []).push(f); }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
    removeAttribute() { this._s = ""; } load() {}
  };
}
function page(html, url, scripts, setup) {
  const dom = new JSDOM("<!doctype html><html><body>" + html + "</body></html>", { url, runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window, audios = [];
  w.Audio = fakeAudioClass(w, audios);
  if (setup) setup(w);
  scripts.forEach((s) => w.eval(read(s)));
  return { w, audios };
}

const dmHtml = (() => { const s = read("dm/index.html"); const a = s.indexOf('<section class="panel" id="panel-music"'); return s.slice(a, s.indexOf("</section>", a) + 10); })();
const tracksJson = read("assets/music/tracks.json");
const pushes = [];
const DM = page(dmHtml, "http://localhost/dm/", ["assets/js/music-deck.js", "assets/js/media-upload.js", "dm/assets/js/music-dm.js"], (w) => {
  w.fetch = async () => ({ ok: true, json: async () => JSON.parse(tracksJson) });
  w.confirm = () => true;
  w.DMCC = { state: { uid: "dmUID0001", demo: false, app: {} }, pushCommand: async (cmd) => { pushes.push(JSON.parse(JSON.stringify(cmd))); } };
});
const P = page('<button id="btnTapHear" hidden>Tap to enable sound</button>', "http://localhost/", ["assets/js/music-deck.js"]);
const dw = DM.w, d = dw.document, PM = P.w.SSDNSMusic, DMM = dw.SSDNSMusic;
await wait(30);
d.getElementById("musicTable").checked = true;

const $ = (s) => d.querySelector(s);
const layerBox = (k) => d.querySelector('[data-mx-layer="' + k + '"]');
const click = (el) => el.dispatchEvent(new dw.MouseEvent("click", { bubbles: true }));
const btn = (k, a) => click(layerBox(k).querySelector('[data-mx="' + a + '"]'));
function pick(k, id) { const sel = layerBox(k).querySelector("[data-mx-track]"); sel.value = id; return sel.value === id; }
function deliver() { while (pushes.length) { const c = pushes.shift(); delivered.push(c); P.w.SSDNSMusic.apply(c.payload); } }
const delivered = [];

// Method setup -------------------------------------------------------------
// 1 starter
const starterOk = pick("music", "test-tone");
check("starter.listed", starterOk && fs.existsSync(path.join(root, "assets/music/starter/test-tone.mp3")));
// 2 link (Dropbox share link -> direct), Test then Add
$("#mxLinkUrl").value = "https://www.dropbox.com/scl/fi/abc/ride.mp3?rlkey=k&dl=0";
$("#mxLinkTitle").value = "Ride (link)";
$("#mxLinkLayer").value = "music";
click($("#btnMxTest")); await wait(20);
check("link.test.ok", /^OK/.test($("#mxLinkMsg").textContent), $("#mxLinkMsg").textContent);
click($("#btnMxAddLink")); await wait(20);
const linkRow = dw.SSDNSMusicDM.tracks().find((t) => t.title === "Ride (link)");
check("link.added", linkRow && linkRow.url === "https://dl.dropboxusercontent.com/scl/fi/abc/ride.mp3?rlkey=k" && linkRow.linked);
// 3 upload (Storage mocked)
dw.SSDNSMedia.upload = async (blob, kind, name) => ({ url: "https://firebasestorage.googleapis.com/v0/b/x/o/dm%2FdmUID0001%2Faudio%2Fboss.mp3?alt=media", path: "dm/dmUID0001/audio/boss", size: 1234, name });
const realHint = dw.SSDNSMedia.storageHint, realUpload = dw.SSDNSMedia.upload;
dw.SSDNSMedia.storageHint = () => "";
const file = new dw.File([new Uint8Array(1234)], "boss.mp3", { type: "audio/mpeg" });
Object.defineProperty($("#mxFile"), "files", { value: [file], configurable: true });
$("#mxTitle").value = "Boss (upload)"; $("#mxLayer").value = "music";
click($("#btnMxUpload")); await wait(20);
const upRow = dw.SSDNSMusicDM.tracks().find((t) => t.title === "Boss (upload)");
check("upload.added", upRow && /firebasestorage/.test(upRow.url));

// Same control script per method ---------------------------------------------
const results = {};
const shape = (c) => Object.keys(c.payload).filter((k) => !["file", "url", "title"].includes(k)).sort().join(",") + "|" + c.type + "|" + c.to;
for (const [name, id] of [["starter", "test-tone"], ["link", linkRow.id], ["upload", upRow.id]]) {
  delivered.length = 0;
  const ok = [];
  pick("music", id);
  layerBox("music").querySelector("[data-mx-loop]").checked = true;
  layerBox("music").querySelector("[data-mx-level]").value = "70";
  btn("music", "play"); await wait(10); deliver();
  let ps = PM.snapshot();
  ok.push(["play", ps.music.playing && ps.music.loop === true && Math.abs(ps.music.level - 0.7) < 1e-9 && (ps.music.track.url || ps.music.track.file) === (DMM.snapshot().music.track.url || DMM.snapshot().music.track.file)]);
  btn("music", "pause"); deliver(); ok.push(["pause", PM.snapshot().music.paused === true]);
  btn("music", "play"); deliver(); ok.push(["resume", PM.snapshot().music.playing === true && !PM.snapshot().music.paused]);
  const lp = layerBox("music").querySelector("[data-mx-loop]"); lp.checked = false; lp.dispatchEvent(new dw.Event("change", { bubbles: true })); deliver();
  ok.push(["loop", PM.snapshot().music.loop === false]);
  const lv = layerBox("music").querySelector("[data-mx-level]"); lv.value = "40"; lv.dispatchEvent(new dw.Event("input", { bubbles: true })); lv.dispatchEvent(new dw.Event("change", { bubbles: true })); deliver();
  ok.push(["volume", Math.abs(PM.snapshot().music.level - 0.4) < 1e-9 && Math.abs(DMM.snapshot().music.level - 0.4) < 1e-9]);
  // ambient layer alongside
  pick("ambient", "ssdns-ambient"); btn("ambient", "play"); deliver();
  ps = PM.snapshot(); ok.push(["two.layers", ps.music.playing && !!ps.ambient.track]);
  // fades
  layerBox("music").querySelector("[data-mx-sec]").innerHTML += '<option value="0.05">t</option>';
  layerBox("music").querySelector("[data-mx-sec]").value = "0.05";
  btn("music", "fade_in"); deliver(); await wait(120); ok.push(["fade_in", PM.snapshot().music.playing]);
  // crossfade to the starter track
  pick("music", "saloon"); btn("music", "crossfade"); deliver(); await wait(120);
  ok.push(["crossfade", PM.snapshot().music.track && PM.snapshot().music.track.file === "saloon.mp3"]);
  btn("music", "fade_out"); deliver(); await wait(150); ok.push(["fade_out", !PM.snapshot().music.track]);
  pick("music", id); btn("music", "play"); deliver(); btn("music", "stop"); deliver(); ok.push(["stop", !PM.snapshot().music.track]);
  click($("#btnMusicStopAll")); deliver(); await wait(2100);
  ok.push(["stop_all", !PM.snapshot().ambient.track && !PM.snapshot().music.track]);
  results[name] = { ok, shapes: delivered.map(shape) };
}
for (const m of Object.keys(results)) {
  results[m].ok.forEach(([k, v]) => check(m + "." + k, v));
}
check("same.pushes.starter=link", results.starter.shapes.join(";") === results.link.shapes.join(";"));
check("same.pushes.starter=upload", results.starter.shapes.join(";") === results.upload.shapes.join(";"));
check("pushes.to.all", delivered.every((c) => c.type === "music" && c.to === "all"));

// Player-only controls
PM.play("music", { file: "starter/test-tone.mp3" }, {});
PM.setMuted(true);
const el = P.audios[P.audios.length - 1];
check("player.mute", el.volume === 0);
PM.setMuted(false); PM.setPref("music", 0.5);
check("player.volume", Math.abs(el.volume - Math.pow(PM.snapshot().music.level * 0.5, 2)) < 1e-9);
// Blocked autoplay -> tap prompt
P.w.Audio.prototype.play = function () { const e = new Error("x"); e.name = "NotAllowedError"; return Promise.reject(e); };
let tapped = false; PM.onBlocked(() => { tapped = true; });
PM.play("ambient", { file: "starter/ssdns-ambient.mp3" }, {}); await wait(10);
check("player.tapPrompt", tapped && PM.blocked());

// No Storage: hint, not error
dw.SSDNSMedia.storageHint = realHint; let uploadCalled = false; dw.SSDNSMedia.upload = async () => { uploadCalled = true; throw new Error("x"); };
dw.DMCC.state.demo = true;
const hint = dw.SSDNSMedia.storageHint();
check("nostorage.hint", /optional/.test(hint) && /link/.test(hint));
const before = dw.SSDNSMusicDM.tracks().length;
Object.defineProperty($("#mxFile"), "files", { value: [file], configurable: true });
click($("#btnMxUpload")); await wait(10);
check("nostorage.noUpload", !uploadCalled && dw.SSDNSMusicDM.tracks().length === before && /optional/.test($("#mxMeter").textContent));

const rules = read("storage.rules");
check("rules.allowlist", /dmAllowlist\(\)/.test(rules) && /REPLACE_WITH_DM_UID/.test(rules) && /15 \* 1024 \* 1024/.test(rules) && /1 \* 1024 \* 1024/.test(rules) && /audio\/\.\*/.test(rules) && /image\/\.\*/.test(rules) && /allow read: if request.auth != null/.test(rules));
check("ui.uid", /id="mxUid"/.test(read("dm/index.html")) && /REPLACE_WITH_DM_UID/.test(read("setup/index.html")));
if (failures.length) { console.log(failures.length + " failed"); process.exit(1); }
console.log("music e2e ok");
process.exit(0);
