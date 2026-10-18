/**
 * PR #65 (sheet 0.3.46 / DMCC 0.2.59): DM tools + dice run.
 *   node tools/test-pr65.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

function diceDom(url) {
  const dom = new JSDOM("<!doctype html><body><div id='diceBar' data-dice-bar></div><div id='diceStage' hidden></div></body>", { url, runScripts: "dangerously" });
  dom.window.eval(read("assets/js/dice-art.js"));
  return dom;
}

// Dice builder
const dom = diceDom("http://x/index.html");
const w = dom.window;
const D = w.SSDNSDice;
const bar = w.document.getElementById("diceBar");
D.mount(bar);
check("builder.markup", bar.querySelector("[data-dice-count]") && bar.querySelector("[data-dice-mod]") && bar.querySelector("[data-dice-pool]"));
let got = null;
D.onBarRoll = (r) => { got = r; };
const up = (k) => bar.querySelector('[data-dice-step="' + k + '"][data-delta="1"]').click();
const down = (k) => bar.querySelector('[data-dice-step="' + k + '"][data-delta="-1"]').click();
bar.querySelector('[data-die="20"]').click();
check("legacy.single", got && got.formula === "1d20" && !got.pool && got.face >= 1);
up("count"); up("mod");
check("steppers.paint", bar.querySelector("[data-dice-count]").textContent === "2" && bar.querySelector("[data-dice-mod]").textContent === "1");
bar.querySelector('[data-die="6"]').click();
check("roll.2d6+1", got && got.formula === "2d6+1" && got.faces.length === 2 && got.result === got.faces[0] + got.faces[1] + 1, got && got.formula);
check("stage.all", w.document.querySelectorAll("#diceStage .die-face").length === 2);
down("mod"); down("mod");
check("mod.negative", bar.querySelector("[data-dice-mod]").textContent === "−1");
up("mod");
// pool via shift-click
down("count");
const shift = (n) => bar.querySelector('[data-die="' + n + '"]').dispatchEvent(new w.MouseEvent("click", { bubbles: true, shiftKey: true }));
got = null;
shift(6); shift(6); shift(4);
check("pool.noRoll", got === null);
check("pool.text", bar.querySelector("[data-dice-pool-text]").textContent === "2d6+1d4" && !bar.querySelector("[data-dice-pool]").hidden, bar.querySelector("[data-dice-pool-text]").textContent);
bar.querySelector("[data-dice-pool-roll]").click();
check("pool.roll", got && got.formula === "2d6+1d4" && got.dice.length === 3 && got.dice[2].sides === 4);
check("pool.cleared", bar.querySelector("[data-dice-pool]").hidden);
check("stage.mixed", w.document.querySelectorAll("#diceStage .die-face").length === 3 && w.document.querySelector('#diceStage [data-sides="4"]'));

// chat condensing
const five = D.rollPool([{ sides: 6, count: 5 }], 2, () => 0.5);
const line = D.lead({ formula: five.formula, rolls: five.faces, detail: five.detail, result: five.result }, "DM · 5d6+2 = " + five.result);
check("chat.condense", (line.match(/die-extra/g) || []).length === 2 && line.includes("data-die-more") && line.includes(">+2<"), line.slice(0, 200));
const four = D.lead({ formula: "4d6", rolls: [1, 2, 3, 4], result: 10 }, "4d6 = 10");
check("chat.four", (four.match(/die-face/g) || []).length === 4 && !four.includes("die-more"));
const mixed = D.lead({ formula: "2d6+1d4+1", dice: [{ sides: 6, face: 4 }, { sides: 6, face: 3 }, { sides: 4, face: 2 }], result: 10 }, "Roll 2d6+1d4+1 = 10");
check("chat.mixed", mixed.includes("d4.webp") && (mixed.match(/die-face/g) || []).length === 3 && mixed.includes(">2<"));
const multi = D.lead({ formula: "1d20+1" }, "Hit 1d20+1 = 9 · 1d4+1 = 3");
check("chat.multiTerm", multi.includes("d20.webp") && multi.includes("d4.webp"));
const textMixed = D.lead({ formula: "2d6+1d4", detail: "5 + 1 + 3", result: 9 }, "Roll 2d6+1d4 = 9 (5 + 1 + 3)");
check("chat.fromDetail", textMixed.includes(">5<") && textMixed.includes(">3<") && textMixed.includes("d4.webp"));
// tap to expand
w.document.body.insertAdjacentHTML("beforeend", "<div id=c>" + line + "</div>");
w.document.querySelector("#c [data-die-more]").click();
check("chat.expand", w.document.querySelector("#c .die-group").classList.contains("die-open"));

// dice test page paths
const tdom = diceDom("http://x/ssdns-character-sheet/tools/dice-test.html");
check("dicetest.path", tdom.window.SSDNSDice.src(4) === "../assets/img/dice/d4.webp");
check("dm.path", diceDom("http://x/dm/index.html").window.SSDNSDice.src(6) === "../assets/img/dice/d6.webp");

// layout: table bar + autosave above dice
const sheet = read("index.html");
check("sheet.order", sheet.indexOf('id="saveBar"') < sheet.indexOf('id="dmJoinBar"') && sheet.indexOf('id="dmJoinBar"') < sheet.indexOf('id="diceBar"'));
const dm = read("dm/index.html");
check("dm.order", dm.indexOf('id="statusBar"') < dm.indexOf('id="diceBar"'));

// Lock/Undo/Redo inside DM Tools; chat grip + minimize
const map = read("map/ssdns-map.js");
const rightSrc = map.slice(map.indexOf("rightbar.innerHTML"), map.indexOf("el.appendChild(rightbar)"));
check("moves.dmtools", rightSrc.indexOf("DM Tools") < rightSrc.indexOf('data-act="lockBtn"') && rightSrc.includes('data-act="redoBtn"'));
check("chat.grip", map.includes('data-act\', \'chatResize\'') || map.includes("chatResize"));
check("chat.height.saved", map.includes("ssdns.map.chatHeight."));
check("chat.minibar", read("map/ssdns-map.css").includes('.ssm-chat-shut .ssdns-chathead > :not([data-act="chatToggle"])') && map.includes("' new)'"));

// Fight tab
check("fight.plusEnemy", dm.includes('id="btnPlusEnemy"') && dm.includes("+ Enemy"));
check("fight.rollInit", dm.includes('id="btnRollInitAll"') && dm.includes(">Roll Initiative<"));
const v2 = read("dm/assets/js/v2.js");
check("fight.fn", v2.includes("function rollInitiativeForAll") && v2.includes('type: "init_prompt"') && v2.includes('type: "init_set"') && v2.includes("playerInitBonus(snap)"));
const join = read("assets/js/dm-join.js");
check("player.cases", join.includes('case "init_prompt"') && join.includes('case "init_set"') && join.includes("function fadeToast"));
check("player.css", read("assets/css/sheet.css").includes(".fade-toast.out") && read("assets/css/sheet.css").includes("pointer-events: none"));

// fading toast runtime
const jdom = new JSDOM("<!doctype html><body></body>", { url: "http://x/index.html", runScripts: "dangerously" });
const fadeSrc = join.slice(join.indexOf("function fadeToast"), join.indexOf("function saveLocal"));
jdom.window.eval("var root = window;" + fadeSrc + ";window.__fade = fadeToast;");
const t = jdom.window.__fade("Initiative: 17", 50);
check("toast.shown", t && jdom.window.document.querySelector(".fade-toast").textContent === "Initiative: 17");
await new Promise((r) => setTimeout(r, 120));
check("toast.gone", !jdom.window.document.querySelector(".fade-toast"));

check("rules.untouched", !read("database.rules.json").includes("init_prompt"));

if (failures.length) { console.error(failures.length + " failed"); process.exit(1); }
console.log("pr65 ok");
