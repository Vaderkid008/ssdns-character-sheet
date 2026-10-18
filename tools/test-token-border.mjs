/**
 * Player tokens: gold ornate ring, token color as a thin inner ring.
 * Enemies stay plain or maroon.
 *   node tools/test-token-border.mjs
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
}
const src = fs.readFileSync(path.join(root, "map/ssdns-map.js"), "utf8");
const cut = src.indexOf("window.SSDNSMap");
check(cut > 0, "border helper sits in front of the map");
const sandbox = { window: {}, Math };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(src.slice(0, cut), sandbox, { filename: "token-border.js" });
const api = sandbox.SSDNSTokenBorder;

function ctx() {
  const ops = [];
  const c = {
    ops,
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 1,
    save() {},
    restore() {},
    beginPath() {},
    arc() { ops.push({ kind: "arc", stroke: c.strokeStyle, fill: c.fillStyle, w: c.lineWidth }); },
    stroke() { ops.push({ kind: "stroke", style: c.strokeStyle, w: c.lineWidth }); },
    fill() { ops.push({ kind: "fill", style: c.fillStyle }); },
    moveTo() {},
    lineTo() {}
  };
  return c;
}

check(api.side({ kind: "player", color: "#112233" }) === "player", "player side");
check(api.side({ ownerUid: "u1" }) === "player", "owned token is a player");
check(api.side({ kind: "enemy" }) === "enemy", "enemy side");
check(api.side({ kind: "friendly" }) === "friendly", "friendly side");

const player = ctx();
api.paint(player, { kind: "player" }, 10, 10, 40, "#112233");
check(player.ops.some((op) => op.kind === "stroke" && String(op.style).toLowerCase() === "#c9a227"), "player ring is gold");
check(player.ops.some((op) => op.kind === "fill" && (String(op.style).toLowerCase() === "#c9a227" || String(op.style).toLowerCase() === "#f6e7b2")), "player ring is drawn with beads");
check(player.ops.some((op) => op.kind === "stroke" && String(op.style).toLowerCase() === "#112233" && op.w < 3), "token color stays a thin inner ring");

const enemy = ctx();
api.paint(enemy, { kind: "enemy" }, 0, 0, 30, "#4a90d9");
check(enemy.ops.some((op) => op.kind === "stroke" && String(op.style).toLowerCase() === "#6e2430"), "enemy without a color is maroon");
check(!enemy.ops.some((op) => String(op.style).toLowerCase() === "#c9a227"), "enemy ring is not gold");

const painted = ctx();
api.paint(painted, { kind: "enemy", color: "#abcdef" }, 0, 0, 30, "#4a90d9");
check(painted.ops.some((op) => op.kind === "stroke" && String(op.style).toLowerCase() === "#abcdef"), "enemy keeps a plain custom color");
check(!painted.ops.some((op) => String(op.style).toLowerCase() === "#c9a227"), "custom enemy border is not the gold ring");

const ally = ctx();
api.paint(ally, { kind: "friendly" }, 0, 0, 30, "#2a9d8f");
check(ally.ops.some((op) => op.kind === "stroke" && String(op.style).toLowerCase() === "#2a9d8f"), "friendly keeps a plain color");
check(!ally.ops.some((op) => String(op.style).toLowerCase() === "#c9a227"), "friendly is not the gold ring");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("ok token border");
