/**
 * Lobby status strip after End Session, Leave room, and New code.
 * An ended room is never LIVE, and the in-room "players stay connected" line does not stick.
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
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const sandbox = { console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.runInNewContext(read("assets/js/apply-guard.js"), sandbox, { filename: "apply-guard.js" });
const Applied = sandbox.SSDNSApplied;

const ended = Applied.sessionStrip("end", { code: "RUST-2487", roomStatus: "live", demo: false });
check(ended.mode === "offline" && ended.text === "Session ended", "end session says the session ended");
check(ended.mode !== "live" && !/players stay connected/i.test(ended.text), "end session is not the in-room live line");

const endedRoom = Applied.sessionStrip("leave", { code: "RUST-2487", roomStatus: "ended", demo: false });
check(endedRoom.mode === "offline" && endedRoom.text === "Session ended", "a room that already ended stays ended");
check(!Applied.liveStripAllowed("live", "Live · RUST-2487 · players stay connected", { roomStatus: "ended", inRoom: false }), "ended room refuses LIVE");
check(!Applied.liveStripAllowed("live", "Live · RUST-2487 · players stay connected", { roomStatus: "ended", inRoom: true }), "ended room refuses LIVE even in the shell");
check(!Applied.liveStripAllowed("live", "Live · resume RUST-2487 or start a new session", { roomStatus: "ended", inRoom: false }), "ended room refuses a resume LIVE line");
check(!Applied.liveStripAllowed("live", "Live · RUST-2487 · players stay connected", { roomStatus: "moved", inRoom: false }), "a moved room refuses the old LIVE line");

const left = Applied.sessionStrip("leave", { code: "RUST-2487", roomStatus: "live", demo: false });
check(left.mode === "live" && /resume RUST-2487/.test(left.text), "leave keeps a resumable table on the resume line");
check(!/players stay connected/i.test(left.text), "leave drops the in-room connected line");
check(!Applied.liveStripAllowed("live", "Live · RUST-2487 · players stay connected", { roomStatus: "live", inRoom: false }), "lobby refuses the in-room LIVE line");
check(Applied.liveStripAllowed("live", left.text, { roomStatus: "live", inRoom: false }), "lobby resume line is allowed while the table is open");

const moved = Applied.sessionStrip("move", { code: "IRON-1001", roomStatus: "live", demo: false });
check(moved.mode === "live" && moved.text.indexOf("IRON-1001") >= 0 && moved.text.indexOf("RUST-2487") < 0, "new code names the new room");
check(Applied.liveStripAllowed("live", moved.text, { roomStatus: "live", inRoom: true }), "new code stays LIVE while the DM is in that room");

const demoEnd = Applied.sessionStrip("end", { code: "DUST-4821", roomStatus: "live", demo: true });
check(demoEnd.mode !== "live" && !/players stay connected/i.test(demoEnd.text), "demo end is not LIVE");
const demoLeave = Applied.sessionStrip("leave", { code: "DUST-4821", roomStatus: "live", demo: true });
check(demoLeave.mode === "demo" && /resume DUST-4821/.test(demoLeave.text) && !/players stay connected/i.test(demoLeave.text), "demo leave resets the strip");
const demoMove = Applied.sessionStrip("move", { code: "ASH-2222", roomStatus: "live", demo: true });
check(demoMove.mode === "demo" && demoMove.text.indexOf("ASH-2222") >= 0, "demo new code names the new room");

const dmcc = read("dm/assets/js/dmcc.js");
const leaveBody = dmcc.slice(dmcc.indexOf("function leaveRoom"), dmcc.indexOf("async function copyText"));
const moveBody = dmcc.slice(dmcc.indexOf("async function newRoomCode"), dmcc.indexOf("function renderKicked"));
const endBody = dmcc.slice(dmcc.indexOf("async function endSession"), dmcc.indexOf("function wireTabs"));
check(leaveBody.indexOf('paintSession("leave"') >= 0, "leave room paints the strip");
check(moveBody.indexOf('paintSession("move"') >= 0, "new code paints the strip");
check(endBody.indexOf('paintSession("end"') >= 0 && endBody.indexOf("finally") >= 0, "end session paints the strip even if the lobby throws");
check(dmcc.indexOf("liveStripAllowed") >= 0, "setStatus refuses a stale LIVE line");

const version = JSON.parse(read("version.json"));
check(version.dmcc === "0.2.23" && version.dmccBuild === "dmcc-hidden-stats-v0223", "dmcc 0.2.23");
check(version.sheet === "0.3.12" && version.sheetBuild === "sheet-store-v0312", "sheet 0.3.12");
check(read("dm/index.html").indexOf("dmcc.js?v=0.2.23") >= 0, "cache bust");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("ok session status");
