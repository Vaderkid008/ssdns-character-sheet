/* COA #4: gear rows, attack rows, and drawer fields share one token set
   on the player card and the DM drawer. The parchment sheet cannot lighten
   the player fields. rules.js and database.rules.json stay untouched. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
let failed = 0;
function check(name, ok) {
  if (!ok) { failed += 1; console.log("FAIL", name); }
  else console.log("ok", name);
}

const ver = JSON.parse(read("version.json"));
check("ver.sheet", ver.sheet === "0.3.263");
check("ver.dmcc", ver.dmcc === "0.2.276");
check("ver.sheetBuild", ver.sheetBuild === "sheet-playtest-v03263");
check("ver.dmccBuild", ver.dmccBuild === "dmcc-playtest-v02276");

const rules = read("assets/data/rules.js");
const db = read("database.rules.json");
check("rules.untouched", !rules.includes("--drawer-row-bg") && !rules.includes("0.3.263"));
check("db.untouched", !db.includes("--drawer-row-bg") && !db.includes("0.2.276"));

const css = read("map/ssdns-map.css");
const block = css.slice(css.indexOf("/* N62 list chrome"));
check("tokens.shared", block.includes(".ssdns-playercard,\n.ssm-drawer {\n  --drawer-row-bg:"));
check("tokens.oneSet", (block.match(/--drawer-row-bg:/g) || []).length === 1);
check("rows.both", block.includes(".ssdns-playercard .ssm-item") && block.includes(".ssm-drawer .ssm-item") && block.includes(".ssdns-playercard .ssm-gear li") && block.includes(".ssm-drawer .ssm-gear li"));
check("attacks.both", block.includes(".ssdns-playercard .n62 button.ssm-atk") && block.includes(".ssm-drawer.n62 button.ssm-atk"));
check("fields.beatParchment", block.includes(".page .ssdns-playercard select") && block.includes(".page .ssm-drawer select") && block.includes("-webkit-text-fill-color: var(--drawer-row-ink)"));
check("uses.variables", block.includes("background: var(--drawer-row-bg)") && !/background:\s*#14181c/.test(block));
check("arm.kept", block.includes("button.ssm-atk.ssm-arm") && block.includes("2px dashed #c0583a"));
const skins = read("assets/css/cast-skins.css");
check("cast.card.untouched", skins.includes(".n62 .n61-card") && skins.includes("linear-gradient(180deg, #241c14, #14110e)"));

if (failed) {
  console.log(failed + " failed");
  process.exit(1);
}
console.log("n62 drawer lists 0.3.263 ok");
