/**
 * Wren Stonecrow's Force open is Strength +3 plus proficiency +2.
 * The loaded pregen is the sheet the check uses. Healing Libation keeps its name
 * and answers to the old assay id.
 * Sheet 0.3.323 / DMCC 0.2.336.
 *   node tools/test-wren-force-03319.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "/tmp/pw/node_modules/playwright-core/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.323" && ver.dmcc === "0.2.336" && ver.sheetBuild === "sheet-playtest-v03323" && ver.dmccBuild === "dmcc-playtest-v02336");
check("rules.clean", !read("assets/data/rules.js").includes("healing-libation") && !read("database.rules.json").includes("skillProf"));
const pack = JSON.parse(read("showcase/bitter-spring-relay/bitter-spring-relay.ssdns-pack.json"));
const packed = JSON.stringify(pack);
check("pack.libation", packed.includes("healing-libation") && !packed.includes("assay-tonic-trail-draught"));

const file = read("showcase/bitter-spring-relay/pregens/wren-stonecrow.ssdns");
const OUT = "/opt/cursor/artifacts/showcase-fixes";
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
await page.goto("http://127.0.0.1:8765/index.html", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.SSDNSApp && window.SSDNSApp.loadText && window.SSDNSLoot && window.SSDNSLoot.forceOpen && window.SSDNSDmJoin && window.SSDNSDmJoin.buildSnapshot, { timeout: 20000 });
const result = await page.evaluate((text) => {
  window.SSDNSApp.loadText(text, { fileName: "wren-stonecrow.ssdns" });
  const character = window.SSDNSApp.doc().character;
  const box = () => ({
    name: "Stage Strongbox",
    container: "strongbox",
    boxType: "strongbox",
    lock: { dc: 15, forceDc: 25, unlocked: false, method: ["tools", "force"], attempts: {}, forceAttempts: {} }
  });
  const mod = window.SSDNSLoot.checkMod(character, "force");
  const opened = window.SSDNSLoot.forceOpen(box(), character, "wren", () => 0, { nat: 20 });
  const snap = window.SSDNSDmJoin.buildSnapshot();
  const snapMod = window.SSDNSLoot.checkMod(snap, "force");
  const snapOpen = window.SSDNSLoot.forceOpen(box(), snap, "wren", () => 0, { nat: 20 });
  const skill = document.querySelector('[data-calc="skill.Athletics"]');
  const host = document.createElement("div");
  host.id = "forceProof";
  host.style.cssText = "position:fixed;left:24px;bottom:24px;z-index:99999;width:520px;background:#1a140c;color:#f4e6c4;border:2px solid #e2c56a;border-radius:10px;padding:16px 18px;font:18px/1.45 system-ui,sans-serif;";
  host.innerHTML = "<b>Wren Stonecrow</b>" +
    '<p style="margin:6px 0">Athletics ' + (skill ? skill.value : "") + "</p>" +
    '<button type="button" id="forceBtn" style="background:#3a3228;color:#f4e6c4;border:1px solid #c4a35a;border-radius:6px;padding:10px 14px;font:700 18px system-ui">' +
    ("Force open " + (mod >= 0 ? "+" : "") + mod) + "</button>" +
    '<p id="forceLine" style="margin:10px 0 0">' + opened.line + "</p>";
  document.body.appendChild(host);
  return {
    name: character.name,
    level: character.level,
    str: character.abilities && character.abilities.STR,
    athletics: character.skillProf && character.skillProf.Athletics,
    mod: mod,
    success: opened.success,
    total: opened.total,
    line: opened.line,
    skillShown: skill ? skill.value : "",
    snapLevel: snap.level,
    snapAthletics: snap.skillProf && snap.skillProf.Athletics,
    snapMod: snapMod,
    snapSuccess: snapOpen.success,
    snapTotal: snapOpen.total,
    snapLine: snapOpen.line,
    libation: window.SSDNSItems.byId("healing-libation").name,
    alias: window.SSDNSItems.byId("assay-tonic-trail-draught").id
  };
}, file);
check("wren.loaded", result.name === "Wren Stonecrow" && result.level === 3 && result.str === 17 && result.athletics === 1, JSON.stringify(result));
check("wren.force", result.mod === 5 && result.success === true && result.total === 25 && /\+3 Str \+2 Athletics/.test(result.line), result.line);
check("wren.skill", result.skillShown === "+5", result.skillShown);
check("wren.snapshot", result.snapLevel === 3 && result.snapAthletics === 1 && result.snapMod === 5 && result.snapSuccess === true && result.snapTotal === 25, result.snapLine);
check("libation.alias", result.libation === "Healing Libation" && result.alias === "healing-libation", result.alias);
await page.locator("#forceProof").screenshot({ path: path.join(OUT, "wren-force.png") });
await browser.close();

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nwren force 0.3.323 ok");
