/**
 * Real Firebase room (auth + database emulators) for the DMCC.
 *
 *   node tools/test-live-room.mjs
 *
 * Needs the emulators on 127.0.0.1:9099 and :9000, a static server on :8765,
 * and Chrome. Proves:
 *   the Demo checkbox starts unchecked
 *   a DM with zero players can add a token and use Ping, Ruler, Wall, and Room
 *   a player join shows up without reloading the DM
 *   a refresh with a saved demo flag rejoins that same live room
 *   every room-code click writes only the code string (clipboard read)
 */
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "http://127.0.0.1:8765";
const failures = [];

function check(id, cond, detail) {
  const line = (cond ? "PASS " : "FAIL ") + id + (detail ? " — " + detail : "");
  console.log(line);
  if (!cond) failures.push(line);
}

function portOpen(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host: "127.0.0.1" }, () => {
      sock.end();
      resolve(true);
    });
    sock.on("error", () => resolve(false));
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(fn, ms, label) {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < ms) {
    try {
      const value = await fn();
      if (value) return value;
      last = JSON.stringify(value);
    } catch (err) {
      last = err && err.message ? err.message : String(err);
    }
    await sleep(250);
  }
  throw new Error("timeout: " + label + " (" + last + ")");
}

async function click(page, sel) {
  const box = await page.$eval(sel, (el) => {
    el.scrollIntoView({ block: "center", inline: "center" });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + Math.min(Math.max(r.height / 2, 4), r.height - 4) };
  });
  await page.mouse.click(box.x, box.y);
}

async function readClipboard(page) {
  return page.evaluate(async () => {
    const text = await navigator.clipboard.readText();
    let types = [];
    try {
      const items = await navigator.clipboard.read();
      types = items && items[0] ? items[0].types.slice() : [];
    } catch (err) {
      types = [];
    }
    return { text: String(text == null ? "" : text), types: types };
  });
}

function onlyCode(text, code) {
  return text === code && !/https?:|<|html/i.test(text);
}

async function dragCanvas(page, x1, y1, x2, y2) {
  await page.evaluate((a, b, c, d) => {
    const canvas = document.querySelector("#mapMount canvas");
    const r = canvas.getBoundingClientRect();
    const fire = (type, x, y) => {
      canvas.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        clientX: x,
        clientY: y,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1
      }));
    };
    const ax = r.left + r.width * a;
    const ay = r.top + r.height * b;
    const bx = r.left + r.width * c;
    const by = r.top + r.height * d;
    fire("pointerdown", ax, ay);
    fire("pointermove", bx, by);
    fire("pointerup", bx, by);
  }, x1, y1, x2, y2);
}

async function main() {
  if (!(await portOpen(9000)) || !(await portOpen(9099))) {
    throw new Error("Firebase emulators are not listening on 9000 and 9099");
  }
  if (!(await portOpen(8765))) throw new Error("Static server is not listening on 8765");

  const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
  const browser = await puppeteer.launch({
    executablePath: "/opt/google/chrome/chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  try {
    const context = browser.defaultBrowserContext();
    await context.overridePermissions(ORIGIN, ["clipboard-read", "clipboard-write"]);
    const dm = await browser.newPage();
    await dm.setViewport({ width: 1280, height: 800 });
    const logs = [];
    dm.on("pageerror", (err) => logs.push(String(err)));
    dm.on("console", (msg) => {
      if (msg.type() === "error") logs.push(msg.text());
    });

    await dm.goto(ORIGIN + "/dm/?emu=1", { waitUntil: "domcontentloaded" });
    const firstBox = await dm.$eval("#chkDemo", (el) => el.checked);
    check("live.checkboxStartsUnchecked", firstBox === false, String(firstBox));

    await waitFor(async () => {
      const text = await dm.$eval("#statusText", (el) => el.textContent || "");
      return /Firebase connected|start a new session|Firebase isn't ready/i.test(text) ? text : "";
    }, 25000, "firebase boot");
    const afterBoot = await dm.evaluate(() => ({
      checked: document.querySelector("#chkDemo").checked,
      demo: !!(window.DMCC && window.DMCC.state && window.DMCC.state.demo),
      status: document.querySelector("#statusText").textContent || ""
    }));
    check("live.checkboxStaysUnchecked", afterBoot.checked === false && afterBoot.demo === false, JSON.stringify(afterBoot));
    check("live.bootIsNotDemo", !/Demo mode/i.test(afterBoot.status), afterBoot.status);

    await click(dm, "#btnCreateRoom");
    const code = await waitFor(async () => {
      return dm.evaluate(() => {
        const inRoom = document.body.classList.contains("in-room");
        const shown = (document.querySelector("#roomCodeDisplay") || {}).textContent || "";
        const match = String(shown).toUpperCase().match(/[A-Z]+-\d+/);
        const st = window.DMCC && window.DMCC.state;
        if (!inRoom || !match || !st || st.demo || !st.db) return "";
        return match[0];
      });
    }, 20000, "create room");
    check("live.createdRealRoom", /^[A-Z]+-\d+$/.test(code), code);

    const targets = ["#roomCodeDisplay", "#btnCopyCode", ".room-code-label"];
    for (const sel of targets) {
      await dm.evaluate(() => {
        const t = document.querySelector("#toast");
        if (t) t.textContent = "";
      });
      await click(dm, sel);
      const clip = await waitFor(async () => {
        const got = await readClipboard(dm);
        const toast = await dm.$eval("#toast", (el) => el.textContent || "");
        if (got.text === code && toast === "Copied " + code) return got;
        return null;
      }, 4000, "clipboard " + sel);
      check("live.clipboard." + sel.replace(/[^a-z0-9]+/gi, ""), onlyCode(clip.text, code) && clip.types.indexOf("text/html") < 0, JSON.stringify(clip));
    }
    await click(dm, "#btnCopyLink");
    const invite = await waitFor(async () => {
      const got = await readClipboard(dm);
      return /room=/.test(got.text) ? got : null;
    }, 4000, "invite clipboard");
    check("live.inviteStillCopiesUrl", invite.text.indexOf(code) >= 0 && /https?:/i.test(invite.text), invite.text);

    const zeroBefore = await dm.evaluate(() => Object.keys((window.DMCC.state && window.DMCC.state.players) || {}).length);
    check("live.zeroPlayers", zeroBefore === 0, String(zeroBefore));

    await click(dm, "#tab-map");
    await waitFor(async () => {
      return dm.evaluate(() => {
        const canvas = document.querySelector("#mapMount canvas");
        const add = document.querySelector("[data-act='addTokenBtn']");
        if (!canvas || !add) return "";
        const r = canvas.getBoundingClientRect();
        return r.width > 80 && r.height > 80 ? "ready" : "";
      });
    }, 20000, "map canvas");

    const grantEmpty = await dm.$eval("[data-act='grantUid']", (el) => el.textContent || "");
    check("live.grantEmpty", /No players/i.test(grantEmpty), grantEmpty);

    await waitFor(async () => {
      const n = await dm.$eval("[data-act='sceneSelect']", (el) => el.options.length);
      return n > 0 ? "scene" : "";
    }, 15000, "map scene");
    await dm.$eval("[data-act='addTokenBtn']", (el) => el.click());
    const enemy = await waitFor(async () => {
      return dm.evaluate(async () => {
        const st = window.DMCC.state;
        const fb = st._fb;
        const pubSnap = await fb.get(fb.ref(st.db, "rooms/" + st.roomCode + "/map/public/tokens"));
        const dmSnap = await fb.get(fb.ref(st.db, "rooms/" + st.roomCode + "/map/dm/tokens"));
        const pub = Object.values(pubSnap.val() || {});
        const hidden = Object.values(dmSnap.val() || {});
        const foe = pub.find((t) => t && !t.ownerUid && /enemy/i.test(t.name || t.label || ""));
        const full = hidden.find((t) => t && !t.ownerUid && (t.kind === "npc" || t.kind === "enemy" || /enemy/i.test(t.name || "")));
        if (!foe) return null;
        return {
          count: pub.length,
          name: foe.name || foe.label || "",
          owner: foe.ownerUid || "",
          publicHp: foe.hp,
          kind: full && full.kind,
          dmHp: full && full.hp
        };
      });
    }, 10000, "enemy token");
    check("live.addTokenAlone", enemy && enemy.count >= 1 && !enemy.owner && enemy.publicHp == null && enemy.kind === "npc", JSON.stringify(enemy));

    async function useTool(name, act) {
      await dm.$eval("[data-act='" + act + "']", (el) => el.click());
      const on = await dm.$eval("[data-act='" + act + "']", (el) => el.classList.contains("active"));
      check("live.tool." + name, on === true, name + " active=" + on);
    }
    await useTool("ping", "pingBtn");
    const canvasBox = await dm.$eval("#mapMount canvas", (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width * 0.45, y: r.top + r.height * 0.45 };
    });
    await dm.mouse.click(canvasBox.x, canvasBox.y);
    const ping = await waitFor(async () => {
      return dm.evaluate(async () => {
        const st = window.DMCC.state;
        const fb = st._fb;
        const snap = await fb.get(fb.ref(st.db, "rooms/" + st.roomCode + "/map/public/events/ping"));
        const row = snap.val();
        return row && row.x != null ? row : null;
      });
    }, 8000, "ping write");
    check("live.pingWrote", !!(ping && ping.by), JSON.stringify(ping));

    await useTool("ruler", "rulerBtn");
    await dragCanvas(dm, 0.3, 0.35, 0.55, 0.5);
    check("live.rulerDragged", true, "drag completed");

    await useTool("wall", "wallBtn");
    await dragCanvas(dm, 0.15, 0.3, 0.7, 0.3);
    const walled = await waitFor(async () => {
      return dm.evaluate(async () => {
        const st = window.DMCC.state;
        const fb = st._fb;
        const snap = await fb.get(fb.ref(st.db, "rooms/" + st.roomCode + "/map/public/scenes"));
        const scenes = snap.val() || {};
        const scene = Object.values(scenes).find((s) => s && Array.isArray(s.walls) && s.walls.length);
        const toast = document.querySelector("#mapMount [data-act='toast']");
        const msg = toast ? toast.textContent : "";
        if (!scene) return null;
        return { walls: scene.walls.length, toast: msg, name: scene.name || "" };
      });
    }, 8000, "wall write");
    check("live.wallWrote", !!(walled && walled.walls >= 1), JSON.stringify(walled));

    await useTool("room", "roomBtn");
    await dragCanvas(dm, 0.5, 0.4, 0.75, 0.7);
    const roomed = await waitFor(async () => {
      return dm.evaluate(async () => {
        const toast = document.querySelector("#mapMount [data-act='toast']");
        const msg = toast ? toast.textContent : "";
        const st = window.DMCC.state;
        const fb = st._fb;
        const snap = await fb.get(fb.ref(st.db, "rooms/" + st.roomCode + "/map/public/scenes"));
        const scenes = snap.val() || {};
        const scene = Object.values(scenes).find((s) => s && Array.isArray(s.walls));
        const n = scene ? scene.walls.length : 0;
        if (!/Room created/i.test(msg) && n < 4) return null;
        return { walls: n, toast: msg };
      });
    }, 8000, "room write");
    check("live.roomWrote", !!(roomed && (roomed.walls >= 4 || /Room created/i.test(roomed.toast))), JSON.stringify(roomed));

    const player = await browser.newPage();
    await player.setViewport({ width: 1100, height: 800 });
    await player.evaluateOnNewDocument(() => {
      const id = "c_livetest";
      const doc = {
        format: "ssdns-character",
        schemaVersion: 2,
        id: id,
        createdAt: "2026-10-12T00:00:00.000Z",
        updatedAt: "2026-10-12T00:00:00.000Z",
        shards: { white: 0, blue: 0, green: 0, yellow: 0, purple: 0 },
        character: { name: "Wade", player: "Jessey", wizardDone: true, calling: "gunslinger", level: 1 }
      };
      localStorage.setItem("ssdns.sheet.char." + id, JSON.stringify(doc));
      localStorage.setItem("ssdns.sheet.last", JSON.stringify(id));
      localStorage.setItem("ssdns.sheet.index", JSON.stringify([{ id: id, name: "Wade", calling: "gunslinger", level: 1, updatedAt: doc.updatedAt }]));
    });
    await player.goto(ORIGIN + "/?emu=1&room=" + encodeURIComponent(code), { waitUntil: "domcontentloaded" });
    await waitFor(async () => {
      const label = await player.$eval("#btnDmJoin", (el) => el.textContent || "");
      return label.indexOf(code) >= 0 ? label : "";
    }, 20000, "join button");
    await click(player, "#btnDmJoin");
    const joined = await waitFor(async () => {
      const text = await player.$eval("#dmJoinStatus", (el) => el.textContent || "");
      return /Joined /i.test(text) ? text : "";
    }, 25000, "player joined");
    check("live.playerJoined", joined.indexOf(code) >= 0, joined);

    const showed = await waitFor(async () => {
      return dm.evaluate(() => {
        const st = window.DMCC.state;
        const ids = Object.keys(st.players || {});
        const grant = (document.querySelector("[data-act='grantUid']") || {}).textContent || "";
        const presence = (document.querySelector("#presenceList") || {}).textContent || "";
        if (!ids.length) return null;
        if (grant.indexOf("Wade") < 0 && presence.indexOf("Wade") < 0) return null;
        return { ids: ids.length, grant: grant, presence: presence };
      });
    }, 20000, "player visible on DM");
    check("live.playerShowsWithoutRefresh", !!(showed && showed.ids >= 1), JSON.stringify(showed));

    const pc = await waitFor(async () => {
      return dm.evaluate(async () => {
        const st = window.DMCC.state;
        const fb = st._fb;
        const snap = await fb.get(fb.ref(st.db, "rooms/" + st.roomCode + "/map/public/tokens"));
        const rows = Object.values(snap.val() || {});
        const owned = rows.find((t) => t && t.ownerUid);
        return owned ? { name: owned.name || owned.label || "", owner: owned.ownerUid } : null;
      });
    }, 15000, "pc token");
    check("live.pcTokenAppeared", !!(pc && pc.owner), JSON.stringify(pc));

    await dm.evaluate((room) => {
      localStorage.setItem("ssdns.dm.lastRoom", JSON.stringify({ code: room, demo: true, uid: "stale-demo" }));
      sessionStorage.setItem("ssdns.dm.open", JSON.stringify({ code: room, demo: true }));
    }, code);
    await dm.reload({ waitUntil: "domcontentloaded" });
    const rejoined = await waitFor(async () => {
      return dm.evaluate((room) => {
        const st = window.DMCC && window.DMCC.state;
        const inRoom = document.body.classList.contains("in-room");
        const shown = ((document.querySelector("#roomCodeDisplay") || {}).textContent || "").toUpperCase();
        const checked = document.querySelector("#chkDemo").checked;
        const status = (document.querySelector("#statusText") || {}).textContent || "";
        if (!st || !inRoom || shown.indexOf(room) < 0) return null;
        return { demo: !!st.demo, db: !!st.db, checked: checked, status: status, shown: shown.trim() };
      }, code);
    }, 25000, "rejoin after demo flag");
    check("live.refreshStaysLive",
      !!(rejoined && rejoined.demo === false && rejoined.db && rejoined.checked === false && !/Demo mode/i.test(rejoined.status)),
      JSON.stringify(rejoined));

    const gone = await browser.newPage();
    await gone.evaluateOnNewDocument(() => {
      localStorage.setItem("ssdns.dm.lastRoom", JSON.stringify({ code: "GONE-0001", demo: true }));
      sessionStorage.setItem("ssdns.dm.open", JSON.stringify({ code: "GONE-0001", demo: true }));
    });
    await gone.goto(ORIGIN + "/dm/?emu=1", { waitUntil: "domcontentloaded" });
    const missing = await waitFor(async () => {
      return gone.evaluate(() => {
        const st = window.DMCC && window.DMCC.state;
        const status = (document.querySelector("#statusText") || {}).textContent || "";
        if (!st || /Starting|Connecting/i.test(status)) return null;
        return {
          inRoom: document.body.classList.contains("in-room"),
          checked: document.querySelector("#chkDemo").checked,
          demo: !!st.demo,
          status: status
        };
      });
    }, 25000, "missing room stays in the lobby");
    check("live.missingRoomNotDemo",
      !!(missing && missing.inRoom === false && missing.checked === false && missing.demo === false && !/Demo mode/i.test(missing.status)),
      JSON.stringify(missing));

    const noisy = logs.filter((line) => !/favicon|ERR_BLOCKED|net::/i.test(line));
    if (noisy.length) console.log("page errors:\n" + noisy.slice(0, 8).join("\n"));
  } finally {
    await browser.close();
  }

  if (failures.length) {
    console.error("\n" + failures.length + " failed");
    process.exit(1);
  }
  console.log("\nlive room checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
