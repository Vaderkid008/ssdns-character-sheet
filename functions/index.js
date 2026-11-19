/* Firebase shell for the referee. The rules live in referee.js so a
   desktop host can import that file and skip this one.
   App Check is ready and off. Set SSDNS_ENFORCE_APP_CHECK=1 in
   functions/.env before a deploy only after the console registration
   in docs/architecture-split.md. This file does not deploy itself. */
import { initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { apply } from "./referee.js";

const project = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "ssdns-dm-hub";

export function appCheckRequired() {
  return process.env.SSDNS_ENFORCE_APP_CHECK === "1";
}

initializeApp({
  projectId: project,
  databaseURL: "https://" + project + "-default-rtdb.firebaseio.com"
});

const ROOM = /^[A-Za-z0-9-]{2,24}$/;

export const referee = onCall({
  region: "us-central1",
  memory: "256MiB",
  timeoutSeconds: 10,
  maxInstances: 10,
  concurrency: 5,
  invoker: "public",
  enforceAppCheck: appCheckRequired()
}, async (request) => {
  if (appCheckRequired() && !request.app) {
    throw new HttpsError("failed-precondition", "App Check token required.");
  }
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError("unauthenticated", "Sign in first.");
  }
  const data = request.data || {};
  const roomId = String(data.roomId || "");
  if (!ROOM.test(roomId)) throw new HttpsError("invalid-argument", "Unknown room.");
  const incoming = data.action || {};
  const uid = String(request.auth.uid);
  const db = getDatabase();
  const gate = db.ref("rooms/" + roomId + "/referee/gate");
  const now = process.env.FUNCTIONS_EMULATOR && Number(data.now) ? Number(data.now) : Date.now();
  let decision = null;
  let tx = null;
  try {
    tx = await gate.transaction((current) => {
      decision = apply(current, incoming, {
        uid,
        now,
        clientSeq: incoming && incoming.seq
      });
      if (decision.duplicate) return;
      if (!decision.ok && !decision.persist) return;
      return decision.state;
    });
  } catch (err) {
    if (!(decision && decision.duplicate)) throw err;
  }
  if (decision && decision.duplicate) {
    const prior = await db.ref("rooms/" + roomId + "/referee/log/" + decision.seq).get();
    return { ok: true, duplicate: true, action: prior.val() || null };
  }
  if (!decision || !decision.ok) {
    throw new HttpsError("resource-exhausted", (decision && decision.reason) || "Not applied.");
  }
  if (!tx.committed) {
    throw new HttpsError("aborted", "Not applied.");
  }
  await db.ref("rooms/" + roomId).update(decision.writes);
  return { ok: true, action: decision.action };
});
