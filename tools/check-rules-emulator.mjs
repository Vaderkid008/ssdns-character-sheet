#!/usr/bin/env node
/**
 * Run every DM Command Center and character-sheet room read, listen, and
 * write against database.rules.json in the Realtime Database emulator.
 *
 *   node tools/check-rules-emulator.mjs
 *
 * Covers, as the DM and as a player (and unauthenticated where noted):
 *   get and onValue for every path those apps read or listen to
 *   set, update, remove, and runTransaction for every path they write
 *   the empty playerInit parent listen that failed on a new room
 *   a second ruleset with that parent .read removed, which must deny the listen
 *   DM-only nodes the player must not read: commands, rolls, archives,
 *   encounter/hp, encounter/requests, conditions, messages
 *
 * .info/connected is a Firebase system path, not a room rule, so it is skipped.
 * The sheet no longer listens to commands. Players receive broadcast and inbox.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = [
  "dm/assets/js/dmcc.js",
  "dm/assets/js/v2.js",
  "assets/js/dm-join.js"
];
const ROOM = "rooms/COIL-4792";
const DM_UID = "dm-uid";
const PLAYER_UID = "player-uid";
const TS = "2026-10-06T06:00:00.000Z";

const MUST_FIND = [
  "meta",
  "players",
  "players/$id/presence/conns/$id",
  "ledger",
  "rolls",
  "messages",
  "handouts",
  "commands",
  "broadcast",
  "inbox",
  "table",
  "table/inspiration",
  "tableFeed",
  "playerInit",
  "chat",
  "archives",
  "archives/addiction",
  "encounter/hp",
  "encounter/public",
  "encounter/requests",
  "conditions"
];

function addPath(found, raw) {
  let p = String(raw || "").trim().replace(/\/+$/, "");
  if (!p || /\s/.test(p) || p.startsWith(".") || p === "rooms") return;
  if (!/^(meta|players|ledger|rolls|messages|handouts|commands|broadcast|inbox|table|tableFeed|playerInit|chat|archives|encounter|conditions)(\/|$)/.test(p)) return;
  found.add(p);
}

function extractPaths(src) {
  const found = new Set();
  const patterns = [
    /(?:roomRef|roomPath|listenRef)\(\s*["']([^"']+)["']/g,
    /\bbind\(\s*["']([^"']+)["']/g,
    /["']((?:meta|players|ledger|rolls|messages|handouts|commands|broadcast|inbox|table|tableFeed|playerInit|chat|archives|encounter|conditions)[^"']*)["']/g
  ];
  patterns.forEach((re) => {
    let m;
    while ((m = re.exec(src))) addPath(found, m[1]);
  });
  if (src.includes('"/presence/conns/"') || src.includes('"/presence"')) found.add("players/$id/presence/conns/$id");
  return found;
}

function scanSources() {
  const found = new Set();
  SOURCES.forEach((rel) => {
    const src = fs.readFileSync(path.join(root, rel), "utf8");
    extractPaths(src).forEach((p) => found.add(p));
  });
  return [...found].sort();
}

function caseCovers(extracted, rel) {
  if (extracted === "players/$id/presence") return /^players\/[^/]+\/presence$/.test(rel);
  if (extracted === "players/$id/presence/conns/$id") return /^players\/[^/]+\/presence\/conns\/[^/]+$/.test(rel);
  return rel === extracted || rel.startsWith(extracted + "/");
}

function coverageProblems(found, cases) {
  const problems = [];
  MUST_FIND.forEach((p) => {
    if (!found.includes(p)) problems.push("source scan missed " + p);
  });
  found.forEach((p) => {
    if (!MUST_FIND.includes(p)) problems.push("unlisted room path in source: " + p);
    const hit = cases.some((c) => caseCovers(p, c.path.slice(ROOM.length + 1)));
    if (!hit) problems.push("no emulator case for " + p);
  });
  const playerCommands = cases.some((c) => c.role === "player" && c.op === "listen" && c.path.endsWith("/commands") && c.expect === "deny");
  if (!playerCommands) problems.push("player listen of commands must be an explicit deny");
  const parentInit = cases.some((c) => c.role === "dm" && c.op === "listen" && c.path.endsWith("/playerInit") && c.expect === "allow");
  if (!parentInit) problems.push("DM listen of playerInit must be allowed");
  return problems;
}

function launchEmulator() {
  const bin = path.join(root, "tools/node_modules/.bin/firebase");
  if (!fs.existsSync(bin)) {
    console.error("Install emulator deps first: npm install --prefix tools");
    process.exit(1);
  }
  const result = spawnSync(bin, [
    "emulators:exec",
    "--only", "database",
    "--project", "demo-ssdns",
    "node tools/check-rules-emulator.mjs"
  ], { cwd: root, stdio: "inherit", env: process.env });
  process.exit(result.status == null ? 1 : result.status);
}

function dbFor(env, role) {
  if (role === "dm") return env.authenticatedContext(DM_UID).database();
  if (role === "player") return env.authenticatedContext(PLAYER_UID).database();
  if (role === "other") return env.authenticatedContext("other-uid").database();
  return env.unauthenticatedContext().database();
}

function listenOnce(dbMod, database, nodePath) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const r = dbMod.ref(database, nodePath);
    const unsub = dbMod.onValue(r, (snap) => {
      if (settled) return;
      settled = true;
      try { unsub(); } catch (e) {}
      resolve(snap.val());
    }, (err) => {
      if (settled) return;
      settled = true;
      try { unsub(); } catch (e) {}
      reject(err);
    });
  });
}

function withTimeout(promise, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout " + label)), 8000))
  ]);
}

function opPromise(dbMod, database, item) {
  const r = dbMod.ref(database, item.path);
  if (item.op === "get") return dbMod.get(r);
  if (item.op === "listen") return listenOnce(dbMod, database, item.path);
  if (item.op === "set") return dbMod.set(r, item.payload);
  if (item.op === "update") return dbMod.update(r, item.payload);
  if (item.op === "remove") return dbMod.remove(r);
  if (item.op === "transaction") {
    return dbMod.runTransaction(r, () => item.payload);
  }
  return Promise.reject(new Error("unknown op " + item.op));
}

function buildCases() {
  const meta = { code: "COIL-4792", dmUid: DM_UID, createdAt: TS, status: "live", name: "Coil" };
  const playerNode = {
    id: PLAYER_UID,
    uid: PLAYER_UID,
    presence: { online: true, lastSeen: TS },
    snapshot: { name: "Wade", updatedAt: TS, player: "Wade" }
  };
  const ledger = { id: "led1", ts: TS, type: "join", who: "Wade" };
  const roll = { id: "r1", ts: TS, who: "Wade", result: 14, uid: PLAYER_UID, label: "Initiative" };
  const feed = { id: "r1", ts: TS, from: PLAYER_UID, text: "Initiative = 14" };
  const dmFeed = { id: "rdm", ts: TS, from: DM_UID, text: "DM roll = 10" };
  const message = { id: "m1", ts: TS, from: DM_UID, to: PLAYER_UID, text: "watch the door" };
  const handout = { id: "h1", ts: TS, name: "Wanted", text: "Poster" };
  const command = { id: "c1", ts: TS, type: "reward_note", to: "all" };
  const broadcast = { id: "c1", ts: TS, type: "reward_note", to: "all" };
  const inbox = { id: "c2", ts: TS, type: "message", to: PLAYER_UID };
  const initRow = { ts: TS, init: 14, name: "Wade" };
  const pub = { e1: { name: "Outlaw 1", status: "Unhurt" } };
  const hp = { e1: { hp: 11, maxHp: 11, ac: 12 } };
  const request = { ts: TS, from: PLAYER_UID, targetId: "e1", amount: 4 };
  const chat = { id: "chat1", ts: TS, from: DM_UID, text: "Hold", to: "all" };
  const playerChat = { id: "chat2", ts: TS, from: PLAYER_UID, text: "Ready" };
  const tableUpdate = {
    initiative: { round: 1, turn: 0, order: [] },
    store: [],
    packs: [],
    storeOpen: false,
    damageMode: "auto",
    updatedAt: TS
  };
  const spend = { count: 1, last: { id: "ins1", ts: TS, delta: -1, by: PLAYER_UID, text: "spent" } };
  const grant = { count: 2, last: { id: "ins2", ts: TS, delta: 1, by: DM_UID, text: "granted" } };
  const readRoles = [
    ["dm", "meta"],
    ["player", "meta"],
    ["dm", "players"],
    ["player", "players"],
    ["dm", "ledger"],
    ["player", "ledger"],
    ["dm", "rolls"],
    ["dm", "messages"],
    ["dm", "handouts"],
    ["player", "handouts"],
    ["dm", "commands"],
    ["dm", "broadcast"],
    ["player", "broadcast"],
    ["dm", "inbox/" + PLAYER_UID],
    ["player", "inbox/" + PLAYER_UID],
    ["dm", "table"],
    ["player", "table"],
    ["dm", "tableFeed"],
    ["player", "tableFeed"],
    ["dm", "playerInit"],
    ["player", "playerInit"],
    ["dm", "chat"],
    ["player", "chat"],
    ["dm", "archives"],
    ["dm", "archives/addiction"],
    ["dm", "encounter/hp"],
    ["dm", "encounter/public"],
    ["player", "encounter/public"],
    ["dm", "encounter/requests"],
    ["dm", "conditions"],
    ["player", "conditions"]
  ];
  const cases = [];
  readRoles.forEach(([role, rel]) => {
    cases.push({ role, op: "get", path: ROOM + "/" + rel, expect: "allow" });
    cases.push({ role, op: "listen", path: ROOM + "/" + rel, expect: "allow" });
  });
  [
    ["none", "playerInit"],
    ["player", "commands"],
    ["player", "rolls"],
    ["player", "messages"],
    ["player", "archives"],
    ["player", "archives/addiction"],
    ["player", "encounter/hp"],
    ["player", "encounter/requests"],
    ["player", "inbox/other-uid"],
    ["other", "inbox/" + PLAYER_UID]
  ].forEach(([role, rel]) => {
    cases.push({ role, op: "get", path: ROOM + "/" + rel, expect: "deny" });
    cases.push({ role, op: "listen", path: ROOM + "/" + rel, expect: "deny" });
  });
  cases.push(
    { role: "dm", op: "set", path: ROOM + "/meta", payload: meta, expect: "allow" },
    { role: "player", op: "update", path: ROOM + "/meta", payload: { status: "ended" }, expect: "deny" },
    { role: "dm", op: "set", path: ROOM + "/players/" + PLAYER_UID, payload: playerNode, expect: "allow" },
    { role: "player", op: "set", path: ROOM + "/players/" + PLAYER_UID, payload: playerNode, expect: "allow" },
    { role: "player", op: "update", path: ROOM + "/players/" + PLAYER_UID + "/presence", payload: { online: false, lastSeen: TS }, expect: "allow" },
    { role: "player", op: "set", path: ROOM + "/players/" + PLAYER_UID + "/presence/conns/conn1", payload: { online: true, lastSeen: TS }, expect: "allow" },
    { role: "player", op: "remove", path: ROOM + "/players/" + PLAYER_UID + "/presence/conns/conn1", expect: "allow" },
    { role: "other", op: "set", path: ROOM + "/players/" + PLAYER_UID + "/presence/conns/conn2", payload: { online: true, lastSeen: TS }, expect: "deny" },
    { role: "player", op: "set", path: ROOM + "/ledger/led1", payload: ledger, expect: "allow" },
    { role: "dm", op: "set", path: ROOM + "/ledger/led2", payload: Object.assign({}, ledger, { id: "led2", who: "DM" }), expect: "allow" },
    { role: "player", op: "remove", path: ROOM + "/ledger/led2", expect: "deny" },
    { role: "dm", op: "remove", path: ROOM + "/ledger/led2", expect: "allow" },
    { role: "player", op: "set", path: ROOM + "/rolls/r1", payload: roll, expect: "allow" },
    { role: "dm", op: "set", path: ROOM + "/rolls/rdm", payload: { id: "rdm", ts: TS, who: "DM", result: 10, uid: DM_UID }, expect: "allow" },
    { role: "player", op: "set", path: ROOM + "/tableFeed/r1", payload: feed, expect: "allow" },
    { role: "dm", op: "set", path: ROOM + "/tableFeed/rdm", payload: dmFeed, expect: "allow" },
    { role: "dm", op: "set", path: ROOM + "/messages/m1", payload: message, expect: "allow" },
    { role: "player", op: "set", path: ROOM + "/messages/m2", payload: { id: "m2", ts: TS, from: PLAYER_UID, to: DM_UID, text: "no" }, expect: "allow" },
    { role: "dm", op: "set", path: ROOM + "/handouts/h1", payload: handout, expect: "allow" },
    { role: "player", op: "set", path: ROOM + "/handouts/h2", payload: handout, expect: "deny" },
    { role: "dm", op: "set", path: ROOM + "/commands/c1", payload: command, expect: "allow" },
    { role: "player", op: "set", path: ROOM + "/commands/c9", payload: command, expect: "deny" },
    { role: "dm", op: "set", path: ROOM + "/broadcast/c1", payload: broadcast, expect: "allow" },
    { role: "player", op: "set", path: ROOM + "/broadcast/c9", payload: broadcast, expect: "deny" },
    { role: "dm", op: "set", path: ROOM + "/inbox/" + PLAYER_UID + "/c2", payload: inbox, expect: "allow" },
    { role: "player", op: "set", path: ROOM + "/inbox/" + PLAYER_UID + "/c9", payload: inbox, expect: "deny" },
    { role: "dm", op: "update", path: ROOM + "/table", payload: tableUpdate, expect: "allow" },
    { role: "player", op: "update", path: ROOM + "/table", payload: { storeOpen: true }, expect: "deny" },
    { role: "player", op: "transaction", path: ROOM + "/table/inspiration", payload: spend, expect: "allow" },
    { role: "dm", op: "transaction", path: ROOM + "/table/inspiration", payload: grant, expect: "allow" },
    { role: "player", op: "set", path: ROOM + "/playerInit/" + PLAYER_UID, payload: initRow, expect: "allow" },
    { role: "dm", op: "set", path: ROOM + "/playerInit/" + PLAYER_UID, payload: initRow, expect: "deny" },
    { role: "player", op: "set", path: ROOM + "/playerInit/" + DM_UID, payload: initRow, expect: "deny" },
    { role: "dm", op: "set", path: ROOM + "/encounter/public", payload: pub, expect: "allow" },
    { role: "player", op: "set", path: ROOM + "/encounter/public", payload: pub, expect: "deny" },
    { role: "dm", op: "set", path: ROOM + "/encounter/hp", payload: hp, expect: "allow" },
    { role: "player", op: "set", path: ROOM + "/encounter/hp", payload: hp, expect: "deny" },
    { role: "player", op: "set", path: ROOM + "/encounter/requests/req1", payload: request, expect: "allow" },
    { role: "dm", op: "set", path: ROOM + "/conditions/enemy1", payload: { name: "Prone", subjectId: "enemy1", subjectKind: "enemy", updatedAt: TS, by: DM_UID }, expect: "allow" },
    { role: "player", op: "set", path: ROOM + "/conditions/mine", payload: { name: "Poisoned", subjectId: PLAYER_UID, subjectKind: "player", updatedAt: TS, by: PLAYER_UID }, expect: "allow" },
    { role: "player", op: "set", path: ROOM + "/conditions/theirs", payload: { name: "Blinded", subjectId: "other-uid", subjectKind: "player", updatedAt: TS, by: PLAYER_UID }, expect: "deny" },
    { role: "player", op: "set", path: ROOM + "/conditions/not-enemy", payload: { name: "Prone", subjectId: "enemy1", subjectKind: "enemy", updatedAt: TS, by: PLAYER_UID }, expect: "deny" },
    { role: "player", op: "remove", path: ROOM + "/conditions/seed-own", expect: "allow" },
    { role: "player", op: "remove", path: ROOM + "/conditions/seed-other", expect: "deny" },
    { role: "dm", op: "remove", path: ROOM + "/conditions/seed-other", expect: "allow" },
    { role: "dm", op: "set", path: ROOM + "/conditions", payload: { nope: true }, expect: "deny" },
    { role: "player", op: "set", path: ROOM + "/conditions", payload: { nope: true }, expect: "deny" },
    { role: "dm", op: "set", path: ROOM + "/chat/chat1", payload: chat, expect: "allow" },
    { role: "player", op: "set", path: ROOM + "/chat/chat2", payload: playerChat, expect: "allow" },
    { role: "player", op: "remove", path: ROOM + "/chat/seed-a", expect: "deny" },
    { role: "dm", op: "remove", path: ROOM + "/chat/seed-a", expect: "allow" },
    { role: "dm", op: "set", path: ROOM + "/archives/arch1", payload: { archivedAt: TS, recap: "recap" }, expect: "allow" },
    { role: "player", op: "set", path: ROOM + "/archives/arch2", payload: { archivedAt: TS }, expect: "deny" },
    { role: "dm", op: "set", path: ROOM + "/archives/addiction/" + PLAYER_UID, payload: { addicted: false, uses: 0 }, expect: "allow" },
    { role: "dm", op: "update", path: ROOM + "/meta", payload: { status: "ended", endedAt: TS }, expect: "allow" }
  );
  return cases;
}

async function main() {
  const found = scanSources();
  const cases = buildCases();
  const problems = coverageProblems(found, cases);
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  if (process.argv.includes("--scan")) {
    console.log(found.join("\n"));
    return;
  }
  if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) {
    launchEmulator();
    return;
  }

  const { initializeTestEnvironment, assertSucceeds, assertFails } = await import("@firebase/rules-unit-testing");
  const dbMod = await import("firebase/database");
  const rules = fs.readFileSync(path.join(root, "database.rules.json"), "utf8");
  const parsed = JSON.parse(rules);
  const initNode = parsed.rules.rooms.$roomCode.playerInit;
  if (initNode[".read"] !== "auth != null") {
    console.error("playerInit parent .read must be auth != null");
    process.exit(1);
  }
  const hostPort = process.env.FIREBASE_DATABASE_EMULATOR_HOST.split(":");
  const host = hostPort[0];
  const port = Number(hostPort[1]);
  const env = await initializeTestEnvironment({
    projectId: "demo-ssdns",
    database: { rules, host, port }
  });
  try {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.database();
      await dbMod.set(dbMod.ref(db, ROOM + "/meta"), {
        code: "COIL-4792", dmUid: DM_UID, createdAt: TS, status: "live"
      });
      await dbMod.set(dbMod.ref(db, ROOM + "/table/inspiration"), {
        count: 2, last: { delta: 1, by: DM_UID }
      });
      await dbMod.set(dbMod.ref(db, ROOM + "/chat/seed-a"), {
        ts: TS, from: DM_UID, text: "seed", to: "all"
      });
      await dbMod.set(dbMod.ref(db, ROOM + "/conditions/seed-own"), {
        name: "Poisoned", subjectId: PLAYER_UID, subjectKind: "player", updatedAt: TS
      });
      await dbMod.set(dbMod.ref(db, ROOM + "/conditions/seed-other"), {
        name: "Blinded", subjectId: "other-uid", subjectKind: "player", updatedAt: TS
      });
    });

    const failures = [];
    for (let i = 0; i < cases.length; i++) {
      const item = cases[i];
      const label = item.expect + " " + item.role + " " + item.op + " " + item.path;
      const database = dbFor(env, item.role);
      const run = withTimeout(opPromise(dbMod, database, item), label);
      try {
        if (item.expect === "allow") await assertSucceeds(run);
        else await assertFails(run);
      } catch (err) {
        failures.push(label + " — " + ((err && err.message) || err));
      }
    }
    if (failures.length) {
      console.error(failures.join("\n"));
      process.exit(1);
    }

    const broken = JSON.parse(rules);
    delete broken.rules.rooms.$roomCode.playerInit[".read"];
    const brokenEnv = await initializeTestEnvironment({
      projectId: "demo-ssdns-broken",
      database: { rules: JSON.stringify(broken), host, port }
    });
    try {
      const denied = await assertFails(withTimeout(
        listenOnce(dbMod, brokenEnv.authenticatedContext(DM_UID).database(), ROOM + "/playerInit"),
        "broken playerInit listen"
      )).then(() => true).catch((err) => err);
      if (denied !== true) {
        console.error("regression: DM listen of playerInit succeeded after removing the parent .read");
        process.exit(1);
      }
    } finally {
      await brokenEnv.cleanup();
    }

    const byOp = {};
    cases.forEach((c) => { byOp[c.op] = (byOp[c.op] || 0) + 1; });
    console.log("ok " + cases.length + " emulator checks");
    console.log("ops " + JSON.stringify(byOp));
    console.log("source paths " + found.join(", "));
    console.log("playerInit parent read allowed for dm and player; unauthenticated denied");
    console.log("regression: parent .read removed denies the DM playerInit listen");
  } finally {
    await env.cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
