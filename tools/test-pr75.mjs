/**
 * PR75: action pips track attacks (Extra Attack), spells by casting time, bonus-action features,
 * Take Cover; manual pip toggles (quiet log); End turn request path (DMCC runs its own Next).
 *   node tools/test-pr75.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id);
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
const read = (r) => fs.readFileSync(path.join(root, r), "utf8");
const dom = new JSDOM('<div class="firearms"><div class="box-head"><h2>Guns</h2></div></div>', { url: "http://127.0.0.1/", runScripts: "dangerously" });
const w = dom.window;
const toasts = [], logs = [];
w.SSDNSToast = (m) => toasts.push(String(m));
w.SSDNSSheet = { addLog: (e) => logs.push(e) };
const run = (rel) => vm.runInContext(read(rel), dom.getInternalVMContext(), { filename: rel });
run("assets/data/rules.js");
let ch = { calling: "gunslinger", level: 5 };
w.SSDNSApp = { doc: () => ({ character: ch }) };
run("assets/js/action-pips.js");
const P = w.SSDNSActionPips, $ = (s) => w.document.querySelector(s);
P.reset(true);

/* Extra Attack from rules.js */
check("ea.gs5", P.attacksPerAction() === 2);
ch.level = 11; check("ea.gs11", P.attacksPerAction() === 3);
ch.level = 20; check("ea.gs20", P.attacksPerAction() === 4);
ch.level = 4; check("ea.gs4", P.attacksPerAction() === 1);
ch = { calling: "tribal-warrior", level: 5 }; check("ea.tw5", P.attacksPerAction() === 2);
ch = { calling: "storyteller", level: 10 }; check("ea.none", P.attacksPerAction() === 1);

/* attacks */
ch = { calling: "gunslinger", level: 5 };
let r = P.attack("Rifle attack");
check("atk.first", !r.over && P.state().action && P.state().attacks === 1);
check("atk.label12", /Action 1\/2/.test($("[data-pip=action]").textContent) && $("[data-pip=action]").classList.contains("partial"));
const nt = toasts.length;
r = P.attack("Rifle attack");
check("atk.second.free", !r.over && P.state().attacks === 2 && toasts.length === nt);
check("atk.label22", /Action 2\/2/.test($("[data-pip=action]").textContent) && !$("[data-pip=action]").classList.contains("partial"));
r = P.attack("Rifle attack");
check("atk.third.warn", r.over && toasts.length === nt + 1);
P.reset(true);
P.spend("action", "Reload");
r = P.attack("Melee attack");
check("atk.afterReload.warn", r.over && /already used your action/.test(toasts.at(-1)));

/* spells */
check("sp.action", P.spellCost("Fire Bolt") === "action");
check("sp.bonus", P.spellCost("Healing Word") === "bonus" && P.spellCost("Hex") === "bonus");
check("sp.reaction", P.spellCost("Shield") === "reaction");
P.reset(true);
P.spell("Healing Word");
check("sp.spendsBonus", P.state().bonus && !P.state().action);
P.spell("Shield");
check("sp.spendsReaction", P.state().reaction);

/* features + Take Cover */
P.reset(true);
check("ft.cost", P.featureCost("Dust Breath (Second Wind - 1st lvl)") === "bonus");
P.feature("Dust Breath (Second Wind - 1st lvl)");
check("ft.spends", P.state().bonus);
check("cover.rules", P.rulesCost("takeCover") === "bonus");
ch = { calling: "tribal-warrior", level: 1 };
check("rage.cost", P.featureCost("Dust Fury (Rage - 1st lvl)") === "bonus");
ch = { calling: "gunslinger", level: 5 };

/* never blocks + turn reset */
P.reset(true);
P.spend("bonus", "TR"); r = P.spend("bonus", "Take Cover");
check("warn.notBlock", r.over && P.state().bonus);
P.onTurn({ order: [{}], round: 2, turn: 1 });
check("turn.reset", !P.state().action && !P.state().bonus && !P.state().reaction);

/* manual toggles: click, quiet log (no toast) */
const t0 = toasts.length, l0 = logs.length;
$("[data-pip=action]").click();
check("tg.actionOn", P.state().action && P.state().actionBy === "manual");
$("[data-pip=bonus]").click();
check("tg.bonusOn", P.state().bonus);
$("[data-pip=bonus]").click();
check("tg.bonusOff", !P.state().bonus);
check("tg.quiet", toasts.length === t0 && logs.length === l0 + 3 && logs.slice(-3).every((e) => /\(manual\)/.test(e.text)));
r = P.attack("Rifle attack");
check("tg.manualActionWarns", r.over);
$("[data-pip=action]").click();
check("tg.actionOff", !P.state().action && P.state().attacks === 0);
check("tg.tooltips", /Click to mark/.test($("[data-pip=bonus]").title) && $("[data-pip=bonus]").textContent === "Bonus");

/* hooks in the source (sheet paths) */
const ex = read("assets/js/sheet-extras.js"), pt = read("assets/js/sheet-playtest.js"), tu = read("assets/js/table-ux.js");
check("hook.gunRoll", /SSDNSActionPips\.attack\(name \+ " attack"\)/.test(ex));
check("hook.gunMelee", /SSDNSActionPips\.attack\(profile\.name\)/.test(ex));
check("hook.spell", /SSDNSActionPips\.spell\(spellName\)/.test(ex));
check("hook.melee", /function rollMeleeNow[\s\S]{0,4000}SSDNSActionPips\.attack/.test(pt));
check("hook.feature", /SSDNSActionPips\.feature\(fuse\)/.test(pt));
check("hook.cover", /rulesCost\("takeCover"\)/.test(tu));

/* End turn: player posts a request; DMCC checks it and runs Next */
const dj = read("assets/js/dm-join.js");
check("et.path", /function postEndTurn[\s\S]{0,900}encounter\/requests\//.test(dj) && /type: "endTurn"/.test(dj));
const rules = JSON.parse(read("database.rules.json"));
const req = rules.rules.rooms.$roomCode.encounter.requests.$id;
check("et.rulesAllowRow", /newData\.child\('from'\)\.val\(\) === auth\.uid/.test(req[".write"]) && ["ts", "from", "targetId", "amount"].every((k) => req[".validate"].includes("'" + k + "'")));
check("et.initDmOnly", /dmUid'\)\.val\(\) === auth\.uid"?$/.test(rules.rules.rooms.$roomCode.table.initiative[".write"]));
const v2 = read("dm/assets/js/v2.js");
const src = v2.match(/function endTurnCheck\(req\) \{[\s\S]*?\n\}/)[0];
const fight = { started: true, round: 3, turn: 1, order: [{ playerId: "a" }, { playerId: "b" }] };
const check2 = new Function("fight", src + "; return endTurnCheck;")(fight);
check("et.ok", check2({ from: "b", round: 3, turn: 1 }) === "");
check("et.stale", check2({ from: "b", round: 3, turn: 0 }) === "stale");
check("et.notMine", check2({ from: "a", round: 3, turn: 1 }) === "not their turn");
check("et.dmNextIntact", /\$\("#btnNextTurn"\)\.addEventListener\("click", nextTurn\)/.test(v2));
check("et.watch", /req\.type === "endTurn"\) \{ if \(fresh\) endTurnRequest/.test(v2));
check("et.button", /id='btnEndTurn' hidden/.test(pt) && /endBtn\.hidden = !endTurnAt/.test(pt));
check("et.map", /id: "endturn"/.test(read("map/ssdns-map-host.js")));
/* Music: no automatic playback on the player side; DMCC fades act directly */
const plays = [];
class FakeAudio { constructor() { this.paused = true; this.volume = 1; this.currentTime = 0; this.src = ""; this.loop = false; }
  play() { this.paused = false; plays.push(this); return Promise.resolve(); } pause() { this.paused = true; }
  addEventListener() {} removeAttribute(k) { this[k] = ""; } load() {} }
w.Audio = FakeAudio;
run("assets/js/music-deck.js");
const M = w.SSDNSMusic;
check("mx.idle", plays.length === 0 && !M.snapshot().music.track);
M.apply({ action: "fade_in", layer: "music", file: "starter/ssdns-theme.mp3", title: "Theme", sec: 0.2, level: 0.9 });
const fin = M.snapshot().music;
check("mx.fadeIn.starts", plays.length === 1 && fin.track && fin.track.title === "Theme" && plays[0].currentTime === 0);
check("mx.fadeIn.silent", plays[0].volume < 0.05, String(plays[0].volume));
await new Promise((r) => setTimeout(r, 350));
check("mx.fadeIn.up", plays[0].volume > 0.4, String(plays[0].volume));
M.apply({ action: "crossfade", layer: "music", file: "starter/ssdns-ambient.mp3", title: "Other", sec: 0.2 });
check("mx.xfade.new", plays.length === 2 && M.snapshot().music.track.title === "Other" && plays[1].volume < 0.05);
await new Promise((r) => setTimeout(r, 350));
check("mx.xfade.oldStopped", plays[0].paused && plays[1].volume > 0.4);
M.apply({ action: "fade_out", layer: "music", sec: 0.2 });
check("mx.fadeOut.stillOn", !!M.snapshot().music.track);
await new Promise((r) => setTimeout(r, 350));
check("mx.fadeOut.stops", !M.snapshot().music.track && plays[1].paused);
const djs = read("assets/js/dm-join.js");
check("mx.noReplay", /cmd\.type === "sfx"\) && \(!ts \|\| Date\.now\(\) - ts > MUSIC_LIVE_MS\)\)/.test(djs) && /MUSIC_LIVE_MS = 15000/.test(djs));
const mdm = read("dm/assets/js/music-dm.js");
check("mx.dm.fadeInPushesTrack", /M\.fadeIn\(k, sec\(k\), t,[\s\S]{0,300}push\(Object\.assign\(\{ action: "fade_in"[\s\S]{0,80}wire\(t\)\)\)/.test(mdm));
check("mx.dm.fadeOutPush", /M\.fadeOut\(k, sec\(k\)\); push\(\{ action: "fade_out"/.test(mdm));
check("mx.dm.xfadePush", /M\.crossfade\(k, t, sec\(k\)[\s\S]{0,60}push\(Object\.assign\(\{ action: "crossfade"/.test(mdm));
check("mx.player.noAutoplayCode", !/SSDNSMusic\.(play|fadeIn|crossfade)\(/.test(read("assets/js/sheet-extras.js") + read("assets/js/sheet-playtest.js") + read("assets/js/app.js")));

/* DMCC scenes + stingers (music-dm.js in a DMCC-like page) */
{
  const dmHtml = read("dm/index.html");
  const panel = dmHtml.slice(dmHtml.indexOf('<section class="panel" id="panel-music"'), dmHtml.indexOf("<!-- NOTES -->"));
  const d2 = new JSDOM("<body>" + panel.replace(" hidden>", ">") + "</body>", { url: "http://127.0.0.1/dm/", runScripts: "dangerously" });
  const W = d2.window, pushed = [], heard = [];
  W.Audio = FakeAudio;
  W.fetch = () => Promise.resolve({ ok: true, json: () => JSON.parse(read("assets/music/tracks.json")) });
  W.DMCC = { pushCommand: (c) => { pushed.push(c); return Promise.resolve(); }, state: { uid: "dm" } };
  W.SSDNSAudio = { play: (e) => heard.push(e), sharedCue: (n) => (["explode", "lightning", "attack"].includes(n) ? n : "") };
  W.confirm = () => true;
  const r2 = (rel) => vm.runInContext(read(rel), d2.getInternalVMContext(), { filename: rel });
  r2("assets/js/music-deck.js"); r2("dm/assets/js/music-dm.js");
  await new Promise((r) => setTimeout(r, 50));
  const MD = W.SSDNSMusicDM, M2 = W.SSDNSMusic, q = (s) => W.document.querySelector(s);
  W.document.getElementById("musicTable").checked = true;
  check("sc.default", MD.scenes().some((s) => s.name === "Saloon") && q('[data-mx-scene="sc-saloon"]'));
  q('[data-mx-scene="sc-saloon"]').click();
  const sn = M2.snapshot();
  check("sc.applies", sn.music.track && sn.ambient.track && Math.abs(sn.music.level - 0.7) < 1e-9 && Math.abs(sn.ambient.level - 0.45) < 1e-9, JSON.stringify(sn));
  check("sc.pushes", pushed.filter((c) => c.type === "music" && c.payload.action === "fade_in").length === 2);
  q("#mxScenePick").value = ""; q("#mxSceneName").value = "Showdown"; q("#mxSceneMusic").value = "ssdns-theme"; q("#mxSceneAmb").value = ""; q("#mxSceneMusicLv").value = "90";
  q("#btnMxSceneSave").click();
  const made = MD.scenes().find((s) => s.name === "Showdown");
  check("sc.create", made && made.music.level === 0.9 && JSON.parse(W.localStorage.getItem("ssdns.dmcc.scenes.v1")).some((s) => s.name === "Showdown"));
  q("#mxSceneName").value = "Showdown 2"; q("#btnMxSceneSave").click();
  check("sc.edit", MD.scenes().filter((s) => s.id === made.id)[0].name === "Showdown 2" && MD.scenes().length === 4);
  pushed.length = 0;
  MD.applyScene(made.id);
  check("sc.emptyFadesAmbient", pushed.some((c) => c.payload.layer === "ambient" && c.payload.action === "fade_out"));
  q("#btnMxSceneDel").click();
  check("sc.delete", !MD.scenes().some((s) => s.id === made.id));
  /* stingers */
  check("st.defaults", MD.stingers().map((s) => s.event).join() === "sting-tension,sting-reveal,explode" && W.document.querySelectorAll("[data-mx-sting]").length === 3);
  pushed.length = 0;
  const before = M2.snapshot();
  q('[data-mx-sting="explode"]').click();
  check("st.plays", heard.at(-1) === "explode" && pushed.length === 1 && pushed[0].type === "sfx" && pushed[0].payload.event === "explode");
  const after = M2.snapshot();
  check("st.layersKeep", after.music.track && after.music.track.title === before.music.track.title && !!after.ambient.track === !!before.ambient.track);
  q("#mxStingerAdd").value = "attack"; q("#mxStingerLabel").value = "Gunshot"; q("#btnMxStingerAdd").click();
  check("st.add", MD.stingers().length === 4 && /Gunshot/.test(q("#mxStingerList").textContent));
  q('[data-mx-sting-del="3"]').click();
  check("st.del", MD.stingers().length === 3);
  check("sfx.dmMaster", !!q("[data-sfx-volume]"));
}
const sheetHtml = read("index.html");
check("sfx.playerMaster", /data-sfx-volume[^>]*SFX volume, this device/.test(sheetHtml));
check("np.label", /id="mxNowPlaying"/.test(sheetHtml) && /paintNow/.test(read("assets/js/sheet-extras.js")));
check("np.personal", /data-mx-pref="music"/.test(sheetHtml));
check("sfx.noReplay", /cmd\.type === "music" \|\| cmd\.type === "sfx"/.test(djs));
check("vol.bigStyle", /data-mx-scene-level/.test(read("assets/js/vol-slider.js")));

check("ver", JSON.parse(read("version.json")).sheet === "0.3.127" && JSON.parse(read("version.json")).dmcc === "0.2.140");

console.log(failures.length ? "\n" + failures.length + " FAILED: " + failures.join(", ") : "\nAll PR75 checks passed.");
process.exit(failures.length ? 1 : 0);
