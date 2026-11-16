/**
 * Two characters with the same name stay distinct.
 * Sheet 0.3.332 / DMCC 0.2.345.
 *   node tools/test-same-name-03331.mjs
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
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const version = JSON.parse(read("version.json"));
check("ver.sheet", version.sheet === "0.3.332" && version.sheetBuild === "sheet-playtest-v03332");
check("ver.dmcc", version.dmcc === "0.2.345" && version.dmccBuild === "dmcc-playtest-v02345");
const dmcc = read("dm/assets/js/dmcc.js");
const v2 = read("dm/assets/js/v2.js");
const map = read("map/ssdns-map.js");
const join = read("assets/js/dm-join.js");
check("src.portrait", dmcc.includes("spec.playerId") && dmcc.includes("hits.length === 1"));
check("src.match", dmcc.includes("byName.length === 1") && dmcc.includes("byPlayer.length === 1"));
check("src.find", v2.includes("if (hits.length === 1) row = hits[0]"));
check("src.colors", map.includes("counts[key] === 1") && join.includes("SSDNSNameColors"));
check("src.warn", dmcc.includes("warnDuplicateNames") && join.includes("Another character is also named"));
check("rules.untouched", !read("assets/data/rules.js").includes("displayTags") && !read("database.rules.json").includes("displayTags"));

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", runScripts: "dangerously" });
const s = dom.window.document.createElement("script");
s.textContent = read("assets/js/turn-rules.js");
dom.window.document.body.appendChild(s);
const T = dom.window.SSDNSTurn;
const tags = T.displayTags([
  { id: "a", name: "Wren" },
  { id: "b", name: "Caleb" },
  { id: "c", name: "Wren" }
]);
check("tag.first", tags.a === "Wren (1)", tags.a);
check("tag.second", tags.c === "Wren (2)", tags.c);
check("tag.unique", tags.b === "Caleb", tags.b);
check("dups", T.duplicateNames([{ id: "a", name: "Wren" }, { id: "c", name: "wren" }]).length === 1);

const init = { order: [
  { id: "p1", playerId: "p1", kind: "player", name: "Wren" },
  { id: "p2", playerId: "p2", kind: "player", name: "Wren" },
  { id: "bare1", kind: "player", name: "Wren" },
  { id: "bare2", kind: "player", name: "Wren" }
] };
check("row.uid", T.rowFor(init, "p2", "Wren").id === "p2");
check("row.name.ambiguous", T.rowFor(init, "", "Wren") == null);
const one = { order: [{ id: "only", kind: "player", name: "Wren" }] };
check("row.name.one", T.rowFor(one, "", "Wren").id === "only");

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nsame name 0.3.332 ok");
