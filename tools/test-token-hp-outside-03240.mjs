/* Token HP bars sit below the ring on the player map and the DM map.
   A larger footprint uses that token's own ring. rules.js is not edited.
   node tools/test-token-hp-outside-03240.mjs
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
check("ver.sheet", version.sheet === "0.3.314" && version.sheetBuild === "sheet-playtest-v03314");
check("ver.dmcc", version.dmcc === "0.2.327" && version.dmccBuild === "dmcc-playtest-v02327");
const rulesDiff = execSync("git diff --name-only -- assets/data/rules.js database.rules.json", { cwd: root }).toString().trim();
check("rules.untouched", rulesDiff === "", rulesDiff);

const map = read("map/ssdns-map.js");
const painter = map.slice(map.indexOf("function paintDmTokenHpBar"), map.indexOf("function paintRangeControls"));
check("dm.noClip", !painter.includes(".clip(") && !painter.includes("ctx.clip"));
check("dm.underName", map.includes("paintDmTokenHpBar(ctx, s, r, barHp, nameY + Math.max(14, nameFont + 2))"));
check("player.underName", map.includes("const nameY = s.y + r + 4") && map.includes("const barY = nameY + Math.max(14, nameFont + 2)"));
check("player.notDmBar", map.includes("role !== 'dm' && barHp && barHp.max"));
check("who.unchanged", map.includes("role === 'dm' && barHp && !t.spellPiece && t.kind !== 'asset' && t.kind !== 'chest'"));

const host = { console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array };
host.window = host;
host.globalThis = host;
host.localStorage = { getItem() { return null; } };
host.condTextWidth = function (c, txt) { return c.measureText(txt).width; };
vm.createContext(host);
const paintSrc = map.slice(map.indexOf("function condPillCompact"), map.indexOf("function paintRangeControls"));
vm.runInContext(paintSrc + "\nglobalThis.__bar = paintDmTokenHpBar;", host, { filename: "hp-outside.js" });

function fakeCtx() {
  const rects = [];
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
    fillRect(x, y, w, h) { rects.push({ x, y, w, h, fill: this.fillStyle }); },
    strokeRect() {},
    measureText(txt) { return { width: String(txt).length * 5 }; },
    fillText() {},
    strokeText() {}
  };
  return { ctx, rects };
}
function place(r, top) {
  const box = fakeCtx();
  host.__bar(box.ctx, { x: 100, y: 100 }, r, { cur: 12, max: 16 }, top);
  return box;
}
function playerTop(r) {
  const nameFont = Math.max(11, r * 0.4);
  const nameY = 100 + r + 4;
  return nameY + Math.max(14, nameFont + 2);
}

[30, 80].forEach((r) => {
  const top = playerTop(r);
  const box = place(r, top);
  const track = box.rects[0];
  check("below." + r, track && track.y >= 100 + r && track.y === top && !box.ctx.clipped, JSON.stringify(track));
  check("fill." + r, box.rects[1] && box.rects[1].fill === "#4caf50" && box.rects[1].y === track.y);
});
const fallback = place(48);
check("fallback.below", fallback.rects[0] && fallback.rects[0].y >= 100 + 48 && !fallback.ctx.clipped, JSON.stringify(fallback.rects[0]));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\ntoken hp outside ok");
