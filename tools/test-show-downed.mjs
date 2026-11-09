/**
 * Hide Unconscious / 0 HP from targeting and saves until the DM shows them
 * (sheet 0.3.219 / DMCC 0.2.232).
 *   node tools/test-show-downed.mjs
 * rules.js is not edited.
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
check("ver.sheet", version.sheet === "0.3.266" && version.sheetBuild === "sheet-playtest-v03266");
check("ver.dmcc", version.dmcc === "0.2.279" && version.dmccBuild === "dmcc-playtest-v02279");
check("ver.app", read("assets/js/app.js").includes('APP_VERSION = "0.3.266"') && read("assets/js/app.js").includes("sheet-playtest-v03266"));
check("ver.dmjs", read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.279"') && read("dm/assets/js/dmcc.js").includes("dmcc-playtest-v02279"));
const rulesDiff = execSync("git diff --name-only -- assets/data/rules.js", { cwd: root }).toString().trim();
check("rules.untouched", rulesDiff === "", rulesDiff);

const box = { console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array };
box.window = box;
box.globalThis = box;
const events = [];
box.CustomEvent = function CustomEvent(type, init) { this.type = type; this.detail = init && init.detail; };
box.dispatchEvent = function (ev) { events.push(ev); };
vm.createContext(box);
vm.runInContext(read("assets/js/apply-guard.js"), box, { filename: "apply-guard.js" });
const A = box.SSDNSApplied;

const down = { id: "r1", kind: "enemy", name: "Rustler", status: "Down", hp: 0 };
const live = { id: "r2", kind: "enemy", name: "Standing", status: "Hurt", hp: 6, maxHp: 11 };
const fled = { id: "gone", kind: "player", name: "Dolan", status: "Fled", fled: true, hp: 0 };
const unconscious = { id: "sleeper", kind: "enemy", status: "Hurt", hp: 4, conditions: ["Unconscious"] };
const zero = { id: "flat", kind: "enemy", status: "", hp: 0, maxHp: 9 };
const healed = { id: "up", kind: "enemy", status: "Down", hp: 3, maxHp: 9 };
const horse = { id: "horse", kind: "enemy", noHpPool: true, hp: 0, maxHp: 0, status: "" };
const horseOut = { id: "horse2", kind: "enemy", noHpPool: true, hp: 0, maxHp: 0, conditions: [{ name: "Unconscious" }] };

check("default.hide", A.showDowned() === false && A.isDownedTarget(down) && A.isUnusableTarget(down) && !A.isLivingHostile(down));
check("default.live", !A.isDownedTarget(live) && !A.isUnusableTarget(live) && A.isLivingHostile(live));
check("default.zero", A.isDownedTarget(zero) && A.isUnusableTarget(zero));
check("default.unconscious", A.isDownedTarget(unconscious) && A.isUnusableTarget(unconscious));
check("default.healed", !A.isDownedTarget(healed) && !A.isUnusableTarget(healed));
check("default.fled", !A.isDownedTarget(fled) && A.isUnusableTarget(fled));
check("default.horse", !A.isDownedTarget(horse) && !A.isUnusableTarget(horse) && A.isDownedTarget(horseOut) && A.isUnusableTarget(horseOut));

check("show.on", A.setShowDowned(true) === true && A.showDowned() === true && events.length === 1 && events[0].detail.on === true);
check("show.down", !A.isUnusableTarget(down) && A.isLivingHostile(down) && !A.isUnusableTarget(zero) && !A.isUnusableTarget(unconscious));
check("show.fled", A.isUnusableTarget(fled) && !A.isLivingHostile(fled));
check("show.horse", !A.isUnusableTarget(horseOut));
check("show.off", A.setShowDowned(false) === false && A.isUnusableTarget(down) && !A.isUnusableTarget(live));

const map = read("map/ssdns-map.js");
const bar = map.slice(map.indexOf("toolbar.innerHTML"), map.indexOf("el.appendChild(toolbar)"));
check("map.button", bar.includes('data-act="showDownedBtn"') && bar.includes("Show downed: OFF") && bar.indexOf("condPillBtn") < bar.indexOf("showDownedBtn") && bar.indexOf("showDownedBtn") < bar.indexOf("fogBtn"));
check("map.dmOnly", /role === 'dm' \? `<button data-act="showDownedBtn"/.test(bar));
check("map.blast", map.includes("function tokensInBlast") && map.includes("if (hideDownedToken(t)) return;"));
check("map.zones", map.includes("if (hideDownedToken(mover)) return;"));
check("map.pick", map.includes("Down. Turn on Show downed to include them."));
check("map.room", map.includes("table/initiative/showDowned") && map.includes("initiative.showDowned") && map.includes("function adoptShowDowned"));
check("map.pills", map.includes("Unconscious is not a pill") && /\^unconscious\\b/.test(map));

const v2 = read("dm/assets/js/v2.js");
check("dm.publish", v2.includes("showDowned: !!(window.SSDNSApplied && window.SSDNSApplied.showDowned && window.SSDNSApplied.showDowned())"));
check("dm.saveSkip", v2.includes("function downedHidden") && v2.includes("save.skipped") && v2.includes("skipped: true, downed: true"));
check("dm.remember", /remembered && !downedHidden\(remembered\)/.test(v2));
check("dm.toggle", v2.includes("setShowDowned(on)"));

const sheet = read("assets/js/sheet-playtest.js");
check("sheet.list", sheet.includes("function downedHidden") && sheet.includes("if (downedHidden(row))") && sheet.includes('addEventListener("ssdns-show-downed"'));
check("sheet.keep", !/unusableRow\(row\)/.test(sheet.slice(sheet.indexOf("var kept = keep"), sheet.indexOf("var last = sel.getAttribute"))));
check("sheet.turn", sheet.includes("init.showDowned"));
check("sheet.zone", read("assets/js/sheet-extras.js").includes("function downedSaveSkipped"));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nshow downed ok");
