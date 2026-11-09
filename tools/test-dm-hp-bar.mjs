/**
 * DM portrait HP bar (sheet 0.3.219 / DMCC 0.2.232).
 * The bar sits under the nameplate, below the ring. It is not clipped to the portrait.
 * Players keep the under-name bar and do not gain this DM bar.
 * Unknown max draws nothing. 0 HP is an empty track. rules.js is not edited.
 *   node tools/test-dm-hp-bar.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const version = JSON.parse(read("version.json"));
check("ver.sheet", version.sheet === "0.3.254" && version.sheetBuild === "sheet-playtest-v03254");
check("ver.dmcc", version.dmcc === "0.2.267" && version.dmccBuild === "dmcc-playtest-v02267");
check("ver.app", read("assets/js/app.js").includes('APP_VERSION = "0.3.254"') && read("assets/js/app.js").includes("sheet-playtest-v03254"));
check("ver.dmjs", read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.267"') && read("dm/assets/js/dmcc.js").includes("dmcc-playtest-v02267"));
const rulesDiff = execSync("git diff --name-only -- assets/data/rules.js", { cwd: root }).toString().trim();
check("rules.untouched", rulesDiff === "", rulesDiff);

const html = read("index.html");
const dm = read("dm/index.html");
check("html.sheet", html.includes("map/ssdns-map.js?v=0.3.254-playfix") && html.includes("assets/js/app.js?v=0.3.254-playfix") && html.includes("map/ssdns-map-fx.js?v=0.3.254-p1c"));
check("html.dm", dm.includes("../map/ssdns-map.js?v=0.2.267-playfix") && dm.includes("assets/js/dmcc.js?v=0.2.267-playfix") && dm.includes("assets/js/v2.js?v=0.2.267-playfix"));
check("html.demo", read("map/demo.html").includes("ssdns-map.js?v=0.3.254-playfix"));

const map = read("map/ssdns-map.js");
const call = map.slice(map.indexOf("const barHp = underTokenHp"), map.indexOf("Guardian budget is a number"));
check("call.dmOnly", call.includes("role === 'dm' && barHp && !t.spellPiece && t.kind !== 'asset' && t.kind !== 'chest'") && call.includes("paintDmTokenHpBar(ctx, s, r, barHp, nameY + Math.max(14, nameFont + 2))"));
const playerAt = map.indexOf("Under-name bar stays the player view");
const playerBar = map.slice(playerAt, map.indexOf("live rect preview", playerAt));
check("player.kept", playerBar.includes("role !== 'dm' && barHp && barHp.max") && !playerBar.includes("paintDmTokenHpBar"));
check("player.unchangedFill", playerBar.includes("pct > 0.5 ? '#4caf50' : pct > 0.25 ? '#ff9800' : '#f44336'"));
check("downed.x", map.includes("ctx.strokeStyle = '#e74c3c'") && map.includes("Unconscious is not a pill"));
check("src.noTemp", map.includes("Temp HP stays on the card") && !map.slice(map.indexOf("function paintDmTokenHpBar"), map.indexOf("function paintRangeControls")).includes("hp.temp"));

const barStart = map.indexOf("window.SSDNSMapBar");
const barEnd = map.indexOf("window.SSDNSMap =");
const barSb = { console, isFinite, Number };
barSb.window = barSb;
barSb.globalThis = barSb;
vm.createContext(barSb);
vm.runInContext(map.slice(barStart, barEnd), barSb, { filename: "ssdns-map-bar.js" });
const B = barSb.SSDNSMapBar.hp;
check("bar.dm", JSON.stringify(B({ role: "dm", dmCur: 5, dmMax: 11 })) === JSON.stringify({ cur: 5, max: 11 }));
check("bar.zero", JSON.stringify(B({ role: "dm", dmCur: 0, dmMax: 11 })) === JSON.stringify({ cur: 0, max: 11 }));
check("bar.noMax", B({ role: "dm", dmCur: 4, dmMax: null, tokenHp: 4, tokenMax: null }) == null);
check("bar.noPool", B({ role: "dm", noHpPool: true, dmCur: 0, dmMax: 9 }) == null);
check("bar.playerHidden", B({ role: "player", canControl: false, ownCur: 9, ownMax: 12 }) == null);
check("bar.playerOwn", JSON.stringify(B({ role: "player", canControl: true, ownCur: 9, ownMax: 12 })) === JSON.stringify({ cur: 9, max: 12 }));
check("bar.revealed", JSON.stringify(B({ role: "player", canControl: false, revealed: { hp: 6, maxHp: 11 } })) === JSON.stringify({ cur: 6, max: 11 }));

let compact = false;
const host = { console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array };
host.window = host;
host.globalThis = host;
host.localStorage = { getItem(k) { return k === "ssdns.map.condPills" && compact ? "compact" : null; } };
host.condTextWidth = function (c, txt) { return c.measureText(txt).width; };
vm.createContext(host);
const paintSrc = map.slice(map.indexOf("function condPillCompact"), map.indexOf("function paintRangeControls"));
vm.runInContext(paintSrc + "\nglobalThis.__bar = paintDmTokenHpBar;", host, { filename: "paintDmTokenHpBar.js" });

function fakeCtx() {
  const rects = [];
  const strokes = [];
  const texts = [];
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "",
    textBaseline: "",
    lineJoin: "",
    save() {},
    restore() {},
    beginPath() {},
    arc() {},
    clip() { this.clipped = true; },
    clipped: false,
    fillRect(x, y, w, h) { rects.push({ x: x, y: y, w: w, h: h, fill: this.fillStyle }); },
    strokeRect(x, y, w, h) { strokes.push({ x: x, y: y, w: w, h: h, style: this.strokeStyle }); },
    measureText(txt) { return { width: String(txt).length * 5 }; },
    fillText(txt, x, y) { texts.push({ txt: txt, x: x, y: y, fill: this.fillStyle, font: this.font }); },
    strokeText() {}
  };
  return { ctx: ctx, rects: rects, strokes: strokes, texts: texts };
}
function paint(hp, r) {
  const box = fakeCtx();
  host.__bar(box.ctx, { x: 200, y: 200 }, r == null ? 30 : r, hp);
  return box;
}
function belowRing(rect, r) {
  return rect.y >= 200 + r - 0.01;
}

const full = paint({ cur: 17, max: 20 });
check("paint.track", full.rects.length >= 2 && full.rects[0].fill === "rgba(18,14,10,0.92)" && belowRing(full.rects[0], 30) && !full.ctx.clipped, JSON.stringify(full.rects[0]));
check("paint.green", full.rects[1].fill === "#4caf50" && Math.abs(full.rects[1].w / full.rects[0].w - 17 / 20) < 0.02 && belowRing(full.rects[1], 30), JSON.stringify(full.rects[1]));
check("paint.number", full.texts.some((t) => t.txt === "17/20" && t.fill === "#fff8e8"), JSON.stringify(full.texts));
check("paint.edge", full.strokes[0] && full.strokes[0].style === "rgba(232,220,200,0.92)");

const bloodied = paint({ cur: 5, max: 11 });
check("paint.orange", bloodied.rects[1] && bloodied.rects[1].fill === "#ff9800" && bloodied.texts.some((t) => t.txt === "5/11"), JSON.stringify(bloodied.rects[1]));
const low = paint({ cur: 2, max: 11 });
check("paint.red", low.rects[1] && low.rects[1].fill === "#f44336" && low.texts.some((t) => t.txt === "2/11"));

const dead = paint({ cur: 0, max: 11 });
check("paint.empty", dead.rects.length === 1 && dead.rects[0].fill === "rgba(18,14,10,0.92)" && belowRing(dead.rects[0], 30), JSON.stringify(dead.rects));
check("paint.deadEdge", dead.strokes.some((s) => s.style === "#e74c3c") && dead.texts.some((t) => t.txt === "0/11" && t.fill === "#f0b4ae"));

const none = paint(null);
const unknown = paint({ cur: 4, max: 0 });
const blank = paint({ cur: 4 });
check("paint.hidden", none.rects.length === 0 && unknown.rects.length === 0 && blank.rects.length === 0 && none.texts.length === 0);

compact = true;
const small = paint({ cur: 5, max: 11 });
check("paint.compact", small.texts.length === 0 && small.rects[0] && small.rects[0].h <= 4 && small.rects[1] && small.rects[1].fill === "#ff9800", JSON.stringify(small.rects[0]));
compact = false;

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\ndm hp bar ok");
