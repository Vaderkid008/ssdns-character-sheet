/**
 * Map condition word pills (sheet 0.3.219 / DMCC 0.2.232).
 * Symbols stay on the sheet portrait. Map tokens paint olive/gold word pills over the token.
 * Unconscious is not a pill. Compact is a smaller bubble, saved per viewer.
 * rules.js is not edited.
 *   node tools/test-cond-pills.mjs
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
check("ver.sheet", version.sheet === "0.3.287" && version.sheetBuild === "sheet-playtest-v03287");
check("ver.dmcc", version.dmcc === "0.2.300" && version.dmccBuild === "dmcc-playtest-v02300");
check("ver.app", read("assets/js/app.js").includes('APP_VERSION = "0.3.287"') && read("assets/js/app.js").includes("sheet-playtest-v03287"));
check("ver.dmjs", read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.300"') && read("dm/assets/js/dmcc.js").includes("dmcc-playtest-v02300"));
const rulesDiff = execSync("git diff --name-only -- assets/data/rules.js", { cwd: root }).toString().trim();
check("rules.untouched", rulesDiff === "", rulesDiff);

const sheet = read("assets/css/sheet.css");
const dmcc = read("dm/assets/css/dmcc.css");
check("css.pills", sheet.includes(".status-chips .chip.cond, .status-chips .cond { background: #6e2430; color: #fff; font-size: 17px; padding: 6px 14px; gap: 5px; }"));
check("css.badge", /width: 42px; height: 42px;/.test(sheet) && /font-size: 24px/.test(sheet.slice(sheet.indexOf(".cond-badge"))));
check("css.dmChip", dmcc.includes("font-size: 17px; padding: 6px 14px"));

const html = read("index.html");
const dm = read("dm/index.html");
check("html.sheet", html.includes("map/ssdns-map.js?v=0.3.287-playfix") && html.includes("assets/js/conditions.js?v=0.3.210-pills") && html.includes("assets/js/app.js?v=0.3.287-playfix"));
check("html.dm", dm.includes("../map/ssdns-map.js?v=0.2.300-playfix") && dm.includes("../assets/js/conditions.js?v=0.2.223-pills") && dm.includes("assets/js/dmcc.js?v=0.2.300-playfix"));
check("html.demo", read("map/demo.html").includes("ssdns-map.js?v=0.3.287-playfix"));

const map = read("map/ssdns-map.js");
check("map.pills", map.includes("function paintCondWordPills") && map.includes("pillWordFit") && map.includes("paintCondWordPills(ctx, s, r, condRaws)"));
check("map.noDiscs", !map.includes("disc(condIcon") && !map.includes("MAP_COND_ICONS") && !map.includes("function condIcon"));
check("map.olive", map.includes("rgba(36,36,16,0.92)") && map.includes("rgba(195,185,110,1)") && map.includes("rgba(230,225,170,1)") && !map.includes("rgba(110,36,48,0.94)"));
const bar = map.slice(map.indexOf("toolbar.innerHTML"), map.indexOf("el.appendChild(toolbar)"));
check("map.toggle", bar.includes('data-act="condPillBtn"') && bar.includes("Pills: Normal") && bar.indexOf("condPillBtn") < bar.indexOf("role === 'dm'") && map.includes("ssdns.map.condPills") && map.includes("function paintCondPillBtn"));
check("portrait.symbols", read("assets/js/table-ux.js").includes("Cond.icon(row)") && read("assets/js/table-ux.js").includes("class='cond-badge'"));

const box = { console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array };
box.window = box;
box.globalThis = box;
vm.createContext(box);
vm.runInContext(read("assets/js/conditions.js"), box, { filename: "conditions.js" });
const C = box.SSDNSConditions;
const words = ["Blinded", "Charmed", "Deafened", "Frightened", "Grappled", "Incapacitated", "Invisible", "Paralyzed", "Petrified", "Poisoned", "Prone", "Restrained", "Stunned", "Unconscious"];
check("word.catalog", words.every((n) => C.pillWord(n) === n.toUpperCase()), words.filter((n) => C.pillWord(n) !== n.toUpperCase()).join());
check("word.poisoned", C.pillWord("Poisoned") === "POISONED" && C.pillWord({ name: "Prone" }) === "PRONE");
check("word.rounds", C.pillWord({ name: "Blinded", rounds: 3 }) === "BLINDED 3R");
check("word.exh", C.pillWord({ name: "Exhaustion", level: 2 }) === "EXHAUSTION 2" && C.pillWord("Exhaustion 4") === "EXHAUSTION 4");
check("word.exhTight", C.pillWord({ name: "Exhaustion", level: 2 }, { tight: true }) === "EXH 2" && C.pillWord("Exhaustion", { tight: true }) === "EXH");
check("word.empty", C.pillWord("") === "" && C.pillWord(null) === "");
check("word.notIcon", C.pillWord("Poisoned") !== C.icon("Poisoned") && C.icon("Poisoned") !== C.icon("Unconscious") && C.icon("nonsense") === "\u25CF");

function textW(txt) { return String(txt).length * 8; }
const poisoned = textW("POISONED");
check("fit.medium", C.pillWordFit({ name: "Exhaustion", level: 2 }, textW, poisoned) === "EXH 2");
check("fit.wide", C.pillWordFit({ name: "Exhaustion", level: 2 }, textW, textW("EXHAUSTION 2")) === "EXHAUSTION 2");
check("fit.other", C.pillWordFit("Incapacitated", textW, poisoned) === "INCAPACITATED");
check("fit.noMeasure", C.pillWordFit({ name: "Exhaustion", level: 6 }) === "EXHAUSTION 6");

const calls = [];
const fills = [];
const strokes = [];
const texts = [];
const ctx = {
  save() {},
  restore() {},
  beginPath() {},
  moveTo() {},
  arcTo() {},
  closePath() {},
  fill() { fills.push(this.fillStyle); },
  stroke() { strokes.push({ style: this.strokeStyle, width: this.lineWidth }); },
  measureText(txt) { return { width: String(txt).length * 8 }; },
  fillText(txt, x, y) { calls.push(txt); texts.push({ txt: txt, x: x, y: y }); }
};
const host = { console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array };
host.window = host;
host.globalThis = host;
host.localStorage = { getItem() { return null; } };
host.condTextWidth = function (c, txt) { return c.measureText(txt).width; };
vm.createContext(host);
vm.runInContext(read("assets/js/conditions.js"), host, { filename: "conditions.js" });
const paintSrc = map.slice(map.indexOf("function condPillCompact"), map.indexOf("function paintRangeControls"));
vm.runInContext(paintSrc + "\nglobalThis.__paint = paintCondWordPills;", host, { filename: "paintCondWordPills.js" });
host.__paint(ctx, { x: 200, y: 200 }, 30, ["Poisoned"]);
check("paint.one", calls.join("|") === "POISONED" && ctx.font === "bold 11px system-ui, sans-serif", calls.join("|") + " " + ctx.font);
check("paint.olive", fills[0] === "rgba(36,36,16,0.92)" && strokes[0] && strokes[0].style === "rgba(195,185,110,1)" && strokes[0].width === 1.3 && ctx.fillStyle === "rgba(230,225,170,1)");
check("paint.over", texts[0] && texts[0].x === 200 && texts[0].y === 156.5, JSON.stringify(texts[0]));
calls.length = 0;
fills.length = 0;
strokes.length = 0;
texts.length = 0;
host.__paint(ctx, { x: 200, y: 200 }, 30, ["Poisoned", { name: "Exhaustion", level: 3 }, "Prone", "Stunned"]);
check("paint.words", calls[0] === "POISONED" && calls[1] === "EXH 3" && calls[2] === "+2", calls.join("|"));
check("paint.stackUp", texts[0] && texts[1] && texts[1].y < texts[0].y && texts[0].y < 170, JSON.stringify(texts));
calls.length = 0;
texts.length = 0;
host.__paint(ctx, { x: 200, y: 200 }, 30, ["Unconscious", { name: "Unconscious", rounds: 2 }, "Poisoned"]);
check("paint.skipUnconscious", calls.join("|") === "POISONED", calls.join("|"));
calls.length = 0;
host.__paint(ctx, { x: 200, y: 200 }, 30, ["Unconscious"]);
check("paint.unconsciousOnly", calls.length === 0, calls.join("|"));
calls.length = 0;
fills.length = 0;
strokes.length = 0;
texts.length = 0;
host.localStorage = { getItem(k) { return k === "ssdns.map.condPills" ? "compact" : null; } };
host.__paint(ctx, { x: 200, y: 200 }, 30, ["Poisoned", "Prone"]);
check("paint.compact", calls.join("|") === "POISONED|PRONE" && ctx.font === "bold 8px system-ui, sans-serif" && strokes[0] && strokes[0].width === 1 && texts[0] && texts[0].y === 160.5, calls.join("|") + " " + ctx.font + " " + JSON.stringify(texts[0]));
check("paint.font", ctx.font && /bold (8|11)px/.test(ctx.font), ctx.font);
check("paint.locked", /pillH = compact \? 11 : 15/.test(paintSrc) && /fontPx = compact \? 8 : 11/.test(paintSrc) && /lift = compact \? 10 : 14/.test(paintSrc));
const fx = read("map/ssdns-map-fx.js");
const sick = fx.slice(fx.indexOf("function sickRay"), fx.indexOf("function weaponEdge"));
check("fx.quietNoWord", /if\s*\(\s*!G\.quiet\s*\)\s*pill\(/.test(sick) && sick.includes('"POISONED"'));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\ncond pills ok");
