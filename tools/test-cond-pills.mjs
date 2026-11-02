/**
 * Map condition word pills (sheet 0.3.211 / DMCC 0.2.224).
 * Symbols stay on the sheet portrait. Map tokens paint POISONED-style pills.
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
check("ver.sheet", version.sheet === "0.3.211" && version.sheetBuild === "sheet-playtest-v03211");
check("ver.dmcc", version.dmcc === "0.2.224" && version.dmccBuild === "dmcc-playtest-v02224");
check("ver.app", read("assets/js/app.js").includes('APP_VERSION = "0.3.211"') && read("assets/js/app.js").includes("sheet-playtest-v03211"));
check("ver.dmjs", read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.224"') && read("dm/assets/js/dmcc.js").includes("dmcc-playtest-v02224"));
const rulesDiff = execSync("git diff --name-only -- assets/data/rules.js", { cwd: root }).toString().trim();
check("rules.untouched", rulesDiff === "", rulesDiff);

const sheet = read("assets/css/sheet.css");
const dmcc = read("dm/assets/css/dmcc.css");
check("css.pills", sheet.includes(".status-chips .chip.cond, .status-chips .cond { background: #6e2430; color: #fff; font-size: 17px; padding: 6px 14px; gap: 5px; }"));
check("css.badge", /width: 42px; height: 42px;/.test(sheet) && /font-size: 24px/.test(sheet.slice(sheet.indexOf(".cond-badge"))));
check("css.dmChip", dmcc.includes("font-size: 17px; padding: 6px 14px"));

const html = read("index.html");
const dm = read("dm/index.html");
check("html.sheet", html.includes("map/ssdns-map.js?v=0.3.211-light") && html.includes("assets/js/conditions.js?v=0.3.210-pills") && html.includes("assets/js/app.js?v=0.3.211-light"));
check("html.dm", dm.includes("../map/ssdns-map.js?v=0.2.224-light") && dm.includes("../assets/js/conditions.js?v=0.2.223-pills") && dm.includes("assets/js/dmcc.js?v=0.2.224-light"));

const map = read("map/ssdns-map.js");
check("map.pills", map.includes("function paintCondWordPills") && map.includes("pillWordFit") && map.includes("paintCondWordPills(ctx, s, r, condRaws)"));
check("map.noDiscs", !map.includes("disc(condIcon") && !map.includes("MAP_COND_ICONS") && !map.includes("function condIcon"));
check("map.optionB", map.includes("Math.max(22, Math.min(28, r * 0.97))") && map.includes("ctx.lineWidth = 2"));
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
const ctx = {
  save() {},
  restore() {},
  beginPath() {},
  moveTo() {},
  arcTo() {},
  closePath() {},
  fill() {},
  stroke() {},
  measureText(txt) { return { width: String(txt).length * 8 }; },
  fillText(txt) { calls.push(txt); }
};
const host = { console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array };
host.window = host;
host.globalThis = host;
host.condTextWidth = function (c, txt) { return c.measureText(txt).width; };
vm.createContext(host);
vm.runInContext(read("assets/js/conditions.js"), host, { filename: "conditions.js" });
const paintSrc = map.slice(map.indexOf("function paintCondWordPills"), map.indexOf("function paintRangeControls"));
vm.runInContext(paintSrc + "\nglobalThis.__paint = paintCondWordPills;", host, { filename: "paintCondWordPills.js" });
host.__paint(ctx, { x: 200, y: 200 }, 30, ["Poisoned"]);
check("paint.one", calls.join("|") === "POISONED" && ctx.font === "bold 13px system-ui, sans-serif", calls.join("|") + " " + ctx.font);
calls.length = 0;
host.__paint(ctx, { x: 200, y: 200 }, 30, ["Poisoned", { name: "Exhaustion", level: 3 }, "Prone", "Stunned"]);
check("paint.words", calls[0] === "POISONED" && calls[1] === "EXH 3" && calls[2] === "+2", calls.join("|"));
check("paint.font", ctx.font && /bold (1[0-4])px/.test(ctx.font), ctx.font);
check("paint.optionB", /Math\.max\(22, Math\.min\(28, r \* 0\.97\)\)/.test(paintSrc));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\ncond pills ok");
