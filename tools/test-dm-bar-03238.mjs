/* COA #3: DM fight strip matches the player chrome, map tools dock into that
   strip, and dead hostiles leave the turn order. Players, allies, and anyone
   still making death saves stay. */
import fs from "fs";
import vm from "vm";
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
check("ver.sheet", ver.sheet === "0.3.278");
check("ver.dmcc", ver.dmcc === "0.2.291");
check("ver.sheetBuild", ver.sheetBuild === "sheet-playtest-v03278");
check("ver.dmccBuild", ver.dmccBuild === "dmcc-playtest-v02291");
check("rules untouched pin", !read("assets/js/app.js").includes("0.3.237"));

const css = read("map/ssdns-map.css");
const stripAt = css.indexOf("\n.ssm-turnstrip {");
const stripRule = css.slice(stripAt, stripAt + 700);
check("strip.noTealBorder", !/border:\s*2px solid #3fbf9a/.test(stripRule));
check("strip.dark", /background:\s*#12100e/.test(stripRule));
const challenge = css.slice(css.indexOf(".ssm-turnstrip button.ssm-challenge"), css.indexOf(".ssm-turnstrip button.ssm-challenge") + 400);
check("challenge.noGold", /box-shadow:\s*none/.test(challenge) && !/border:\s*2px solid #e2c56a/.test(challenge));
check("tools.slot", css.includes(".ssm-strip-tools") && css.includes(".dm-tools-docked"));
check("player panel still teal", css.includes(".ssdns-map > .ssm-turnhost #turnPanel.turn-panel") && /border:\s*2px solid #3fbf9a/.test(css));

const map = read("map/ssdns-map.js");
check("dock.fn", map.includes("function dockDmMapTools") && map.includes("stripTools"));
check("dock.both", (map.split("dockDmMapTools(strip)").length - 1) >= 2);
check("tail.keepsNext", map.includes("function beginStripTail") && map.includes("tail.appendChild(next)"));
check("challenge.sameEvent", map.includes("emit('challenge:open'"));
check("next.same", map.includes("emit('initiative:next'") && map.includes("emit('initiative:prev'") && map.includes("emit('initiative:end'"));

const v2 = read("dm/assets/js/v2.js");
const sweep = v2.slice(v2.indexOf("function dropDeadHostiles"), v2.indexOf("function nextLivingIndex"));
check("sweep.present", sweep.includes("T.hostileDead"));
check("sweep.noTokenDrop", !sweep.includes("releaseFightToken") && !sweep.includes("dropMapToken") && !sweep.includes("Drop loot"));
check("sweep.advances", sweep.includes("beginTurn") && sweep.includes("sendYourTurn"));
check("sweep.called", v2.includes("dropDeadHostiles();"));
check("player.steps", v2.includes('data-dm-move="5"') && v2.includes("function adjustStripMove"));
check("bestiary cache kept", v2.includes("bestiary.json?v=0.2.249-spell-tokens"));

const dmcc = read("dm/assets/css/dmcc.css");
const dmStrip = dmcc.slice(dmcc.indexOf("#turnStrip.turn-strip {"), dmcc.indexOf("#turnStrip.turn-strip {") + 400);
check("dmcc.noTeal", !/border:\s*2px solid #3fbf9a/.test(dmStrip));

const ctx = { window: {}, console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(read("assets/js/turn-rules.js"), ctx);
const dead = ctx.SSDNSTurn.hostileDead;
check("down stays", dead({ kind: "enemy", status: "Down", hp: 0, deathSaves: { fail: [true, true, false] } }) === false);
check("three fails leave", dead({ kind: "enemy", status: "Down", hp: 0, deathSaves: { fail: [true, true, true] } }) === true);
check("status Dead leaves", dead({ kind: "enemy", status: "Dead", hp: 0 }) === true);
check("disintegrated leaves", dead({ kind: "enemy", status: "Down", disintegrated: true }) === true);
check("player stays", dead({ kind: "player", status: "Dead", hp: 0, deathSaves: { fail: [true, true, true] } }) === false);
check("ally side stays", dead({ kind: "enemy", side: "friendly", status: "Dead" }) === false);
check("ally flag stays", dead({ kind: "enemy", ally: true, status: "Dead" }) === false);
check("living hostile stays", dead({ kind: "enemy", status: "", hp: 12 }) === false);

if (failed) {
  console.log(failed + " failed");
  process.exit(1);
}
console.log("dm bar 0.3.278 ok");
