#!/usr/bin/env node
/* Call the referee in the Firebase emulator and read the rows it wrote.
   No live project. Re-runs itself under emulators:exec when started alone. */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const project = "demo-ssdns";

function launch() {
  const bin = path.join(root, "tools/node_modules/.bin/firebase");
  if (!fs.existsSync(bin)) {
    console.error("Install emulator deps first: npm install --prefix tools");
    process.exit(1);
  }
  if (!fs.existsSync(path.join(root, "functions/node_modules/firebase-admin"))) {
    console.error("Install function deps first: npm install --prefix functions");
    process.exit(1);
  }
  const result = spawnSync(bin, [
    "emulators:exec",
    "--only", "auth,database,functions",
    "--project", project,
    "node tools/test-referee-emulator-0340.mjs"
  ], { cwd: root, stdio: "inherit", env: process.env });
  process.exit(result.status == null ? 1 : result.status);
}

async function post(url, body, headers) {
  const res = await fetch(url, {
    method: "POST",
    headers: Object.assign({ "content-type": "application/json" }, headers || {}),
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) {}
  return { status: res.status, json, text };
}

async function signIn() {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
  const res = await post("http://" + host + "/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo", {
    returnSecureToken: true
  });
  const token = res.json && res.json.idToken;
  if (!token) throw new Error("auth emulator did not return a token: " + res.text.slice(0, 300));
  return { token, uid: res.json.localId };
}

async function call(token, data) {
  const res = await post("http://127.0.0.1:5001/" + project + "/us-central1/referee", { data }, {
    authorization: "Bearer " + token
  });
  return res;
}

async function main() {
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) launch();
  const require = createRequire(path.join(root, "functions/package.json"));
  const admin = require("firebase-admin");
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: project,
      databaseURL: "https://" + project + "-default-rtdb.firebaseio.com"
    });
  }
  const { token } = await signIn();
  const room = "COIL4792";
  const first = await call(token, {
    roomId: room,
    action: { name: "moveToken", seq: 11, payload: { tokenId: "tok1", x: 3, y: 4 } },
    now: 5000
  });
  if (!first.json || !first.json.result || !first.json.result.action || first.json.result.action.seq !== 1) {
    throw new Error("first move failed: " + first.text.slice(0, 500));
  }
  const replay = await call(token, {
    roomId: room,
    action: { name: "moveToken", seq: 11, payload: { tokenId: "tok1", x: 3, y: 4 } },
    now: 5000
  });
  if (!replay.json || !replay.json.result || replay.json.result.duplicate !== true) {
    throw new Error("replay was not a duplicate: " + replay.text.slice(0, 500));
  }
  const pos = (await admin.database().ref("rooms/" + room + "/map/public/tokens/tok1/pos").get()).val();
  if (!pos || pos.x !== 3 || pos.y !== 4 || pos.seq !== 1) throw new Error("pos not written: " + JSON.stringify(pos));
  let rejected = null;
  for (let i = 0; i < 8; i++) {
    const step = await call(token, {
      roomId: room,
      action: { name: "moveToken", seq: 100 + i, payload: { tokenId: "tok1", x: i, y: 1 } },
      now: 5000
    });
    if (!step.json || !step.json.result || step.json.result.ok !== true) rejected = step;
  }
  if (!rejected) throw new Error("a 9th move in the same second was accepted");
  const anon = await post("http://127.0.0.1:5001/" + project + "/us-central1/referee", {
    data: { roomId: room, action: { name: "setHp", payload: { id: "bandit", hp: 1, maxHp: 4 } } }
  });
  if (anon.status < 400) throw new Error("anonymous call was accepted");
  const hp = await call(token, {
    roomId: "ROOM2",
    action: { name: "setHp", seq: 1, payload: { id: "bandit", hp: 3, maxHp: 9 } }
  });
  if (!hp.json || !hp.json.result || !hp.json.result.ok) throw new Error("hp failed: " + hp.text.slice(0, 500));
  const row = (await admin.database().ref("rooms/ROOM2/encounter/hp/bandit").get()).val();
  if (!row || row.hp !== 3 || row.maxHp !== 9) throw new Error("hp not written: " + JSON.stringify(row));
  console.log("referee emulator ok");
  await admin.app().delete();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
