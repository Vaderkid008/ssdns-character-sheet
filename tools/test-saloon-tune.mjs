/**
 * Saloon: two-deck blackjack, once-per-session cheat, chat lines, slots RTP, phone layout.
 *   node tools/test-saloon-tune.mjs
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const bj = read("games/blackjack/game.js");
const bjHtml = read("games/blackjack/index.html");
const slots = read("games/slot-machine/game.js");
const wallet = read("games/ssdns-wallet.js");
const theme = read("games/saloon-theme.css");
const sheet = read("assets/css/sheet.css");
const join = read("assets/js/dm-join.js");
const bridge = read("assets/js/ssdns-bridge.js");
const guard = read("assets/js/apply-guard.js");

check("shoe.two", bj.includes("SHOE_DECKS = 2") && bj.includes("RESHUFFLE_AT = 52") && bj.includes("function buildShoe"), "two-deck shoe reshuffled at half");
check("shoe.between", bj.includes("phase === PHASE.IDLE || phase === PHASE.DONE") && /maybeReshuffle\(\);\s*phase = PHASE\.PLAYER/.test(bj), "reshuffle waits for a hand to end");
check("bj.threeTwo", bj.includes("Math.floor(bet * 2.5)") && bjHtml.includes("3:2"), "naturals stay 3:2");
check("bj.allIn", bj.includes('allBtn.textContent = "All In"') && !/MAX_BET|maxBet|bet cap/i.test(bj), "All In stays and there is no bet cap");
check("bj.cheat", bj.includes("SSDNSSaloon.attempt") && bjHtml.includes('id="cheatBtn"') && bjHtml.includes('id="highRoller"'), "blackjack cheat control");

check("slots.live", slots.includes("PAYOUT_THREE_MULT = 10") && slots.includes("enumerateRtp"), "live slots math is the rebalanced table");
check("slots.noOldAssign", !/PAYOUT_\w+\s*=\s*22\d/.test(slots), "old 220% multipliers are not assigned");
check("phone.flavor", theme.includes(".flavor-row") && theme.includes("flex-direction: column") && theme.includes(".oscar-row"), "side copy stacks on a phone");
check("phone.credits", theme.includes(".balance-bar") && theme.includes("position: static") && sheet.includes("flex: 1 1 140px") && sheet.includes("#dlgSaloon"), "credits bar and saloon shards are not stuck to the card");
check("chat.tableLine", join.includes('msg.type === "tableLine"') && join.includes("postChat") && join.includes("postLedger"), "results and a caught notice reach the table");
check("wallet.fields", bridge.includes("out.sleight") && bridge.includes("out.tokenColor") && read("assets/js/app.js").includes('skills["Sleight of Hand"]'), "sheet wallet carries sleight and token color");

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/games/blackjack/index.html", runScripts: "dangerously" });
const w = dom.window;
w.SSDNSBridge = { cpValue() { return 0; }, applyDelta() { return null; }, readWallet() { return { characterName: "Dusty", tokenColor: "#c45a22", sleight: 5 }; }, onChange() {} };
w.SSDNSGame = { id: "blackjack", get() { return 0; }, set() {}, busy() { return false; } };
w.eval(wallet);
check("line.win", w.SSDNSSaloon.line("Dusty", "win", 12, "Blackjack") === "Dusty wins 12 at Blackjack");
check("line.lose", w.SSDNSSaloon.line("Dusty", "lose", 5, "Dusty Wheel") === "Dusty loses 5 at Dusty Wheel");
check("line.push", w.SSDNSSaloon.line("Dusty", "push", 0, "Oscar Slots") === "Dusty pushes at Oscar Slots");
const posted = w.SSDNSSaloon.post("win", 12, "Blackjack");
check("post.shape", posted.type === "tableLine" && posted.text === "Dusty wins 12 at Blackjack" && posted.color === "#c45a22" && !!posted.id);

const success = w.SSDNSSaloon.attempt({ mod: 0, roll: () => 20 });
check("cheat.success", success.success === true && success.caught === false && success.dc === 13 && success.total === 20);
const again = w.SSDNSSaloon.attempt({ mod: 5, roll: () => 20 });
check("cheat.once", again.blocked === true && again.ok === false);
w.sessionStorage.clear();
const near = w.SSDNSSaloon.attempt({ mod: 0, roll: () => 9, high: false });
check("cheat.fail4", near.success === false && near.caught === false && near.total === 9 && near.dc === 13, JSON.stringify(near));
w.sessionStorage.clear();
const caught = w.SSDNSSaloon.attempt({ mod: 0, roll: () => 8, high: true });
check("cheat.fail5", caught.caught === true && caught.success === false && caught.dc === 16 && caught.total === 8, JSON.stringify(caught));
check("cheat.ban", w.SSDNSSaloon.banned() === true && w.SSDNSSaloon.used() === true);

const guardBox = { window: {}, SSDNSTokenColors: { dusty: "#c45a22" } };
guardBox.globalThis = guardBox;
guardBox.window = guardBox;
vm.createContext(guardBox);
vm.runInContext(guard, guardBox, { filename: "apply-guard.js" });
const colored = guardBox.SSDNSApplied.leadNameHtml("Dusty wins 12 at Blackjack");
check("color.name", colored.indexOf('class="ssm-who"') >= 0 && colored.indexOf(">Dusty<") >= 0 && /color:#/i.test(colored), colored);
const still = guardBox.SSDNSApplied.leadNameHtml("Dusty: howdy");
check("color.colon", still.indexOf('class="ssm-who"') >= 0 && still.indexOf(">Dusty<") >= 0, still);

const slotPage = new JSDOM(read("games/slot-machine/index.html"), {
  url: "http://localhost/games/slot-machine/index.html",
  runScripts: "outside-only"
});
slotPage.window.eval(slots);
const slot = slotPage.window;
for (const tier of [0, 1, 2, 3]) {
  const rtp = slot.SSDNSSlotsMath.enumerateRtp(tier);
  check("rtp." + tier, rtp < 100 && rtp > 40 && (rtp < 200 || rtp > 250), String(rtp));
}
check("rtp.payouts", slot.SSDNSSlotsMath.payouts.three === 10 && slot.SSDNSSlotsMath.payouts.wildThree === 25);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("ok saloon tune");
process.exit(0);
