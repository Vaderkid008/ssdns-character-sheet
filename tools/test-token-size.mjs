/**
 * Token size by creature size (Jessey 2026-10-20 3:42 PM CT).
 * Tiny/Small/Medium 1 square, Large 2x2, Huge 3x3, Gargantuan 4x4, read from the bestiary / enemy "size".
 * PCs are Medium. Snapping, dragging, click target, Hide and auto-placement work on the whole footprint;
 * auto-placement also keeps name labels (and DM HP bars) off other tokens and labels.
 *   node tools/test-token-size.mjs   (browser part: ssdns-test-all's :8765; SSDNS_TOKEN_SHOTS=DIR saves screenshots)
 */
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

/* ---- unit: map/token-size.js */
const box = {}; box.globalThis = box; box.window = box;
vm.runInNewContext(read("map/token-size.js"), box);
const T = box.SSDNSTokenSize;
check("u.api", T && ["squares", "footprint", "labelBand", "areaTaken", "fits", "findSpot", "clampPos"].every((k) => typeof T[k] === "function"));
const want = { Tiny: 1, Small: 1, Medium: 1, Large: 2, Huge: 3, Gargantuan: 4 };
check("u.squares.names", Object.keys(want).every((k) => T.squares(k) === want[k] && T.squares(k.toLowerCase()) === want[k] && T.squares(k.toUpperCase()) === want[k]));
check("u.squares.default", T.squares("") === 1 && T.squares(null) === 1 && T.squares(undefined) === 1 && T.squares("Colossal") === 1 && T.squares({}) === 1);
check("u.squares.numbers", T.squares(2) === 2 && T.squares("3") === 3 && T.squares(9) === 4 && T.squares(0) === 1 && T.squares(0.5) === 1 && T.squares(-2) === 1);
check("u.squares.phrase", T.squares("Large (swarm of Tiny)") === 2 && T.squares(" Huge ") === 3);
const beasts = JSON.parse(read("dm/assets/data/bestiary.json")).filter((b) => b && !b.template);
const odd = beasts.filter((b) => !(b.size in want)).map((b) => b.id + "=" + b.size);
check("data.sizesKnown", !odd.length, odd.join());
check("data.bigOnes", T.squares(beasts.find((b) => b.id === "kraken").size) === 4 && T.squares(beasts.find((b) => b.id === "mesa-rattler").size) === 3 &&
  T.squares(beasts.find((b) => b.id === "buffalo-bull").size) === 2 && T.squares(beasts.find((b) => b.id === "rattlesnake").size) === 1);
const tok = (x, y, size, label) => ({ id: label || (x + "," + y), pos: { x, y }, size, label: label || "" });
check("u.footprint", JSON.stringify(T.footprint(tok(3, 4, 3))) === JSON.stringify({ x: 3, y: 4, w: 3, h: 3 }));
const band = T.labelBand(tok(2, 2, 2, "Thunder Eagle 2"));
check("u.band.row", band.y === 4 && band.h === 1 && Math.abs(band.x + band.w / 2 - 3) < 1e-9 && band.w >= 2, JSON.stringify(band));
check("u.band.minWidth", T.labelBand(tok(0, 0, 4, "K")).w === 4 && T.labelBand(tok(0, 0, 1, "")).w === 1);
check("u.band.zoomedOut", T.labelCells("Thunderbird Hatc", 1, 33.6) > T.labelCells("Thunderbird Hatc", 1, 70) * 1.8 && T.labelCells("Thunderbird Hatc", 1, 140) <= T.labelCells("Thunderbird Hatc", 1, 70) + 1e-9);
check("u.band.medFont", Math.abs(T.labelFontCells(1) - 0.17) < 1e-9 && T.labelFontCells(4) === T.labelFontCells(2));
check("u.overlap.edges", !T.overlap({ x: 0, y: 0, w: 2, h: 2 }, { x: 2, y: 0, w: 1, h: 1 }) && T.overlap({ x: 0, y: 0, w: 2, h: 2 }, { x: 1, y: 1, w: 1, h: 1 }));
const big = [tok(5, 5, 4, "The Kraken")];
check("u.areaTaken.inside", T.areaTaken(8, 8, 1, big) && T.areaTaken(4, 4, 2, big) && !T.areaTaken(9, 5, 1, big) && !T.areaTaken(3, 3, 2, big));
check("u.clamp", JSON.stringify(T.clampPos(29, 19, 4, { cols: 30, rows: 20 })) === '{"x":26,"y":16}' && JSON.stringify(T.clampPos(-3, 2, 1)) === '{"x":0,"y":2}');
check("u.fits.grid", !T.fits(27, 0, 4, "", [], { cols: 30, rows: 20 }, true) && T.fits(26, 16, 4, "", [], { cols: 30, rows: 20 }, true));
/* auto-placement: a crowd of mixed sizes and long names never overlaps footprints or labels */
const grid = { cols: 30, rows: 20 };
const placed = [];
const crowd = ["Tiny", "Medium", "Large", "Large", "Large", "Huge", "Gargantuan", "Small", "Medium", "Large", "Huge"];
crowd.forEach((sz, i) => {
  const label = (sz === "Large" ? "Thunder Eagle " : "Creature ") + (i + 1);
  const spot = T.findSpot({ x: 12, y: 8 }, sz, label, placed, grid);
  if (spot) placed.push(tok(spot.x, spot.y, T.squares(sz), label));
});
check("u.place.all", placed.length === crowd.length, placed.length + "/" + crowd.length);
check("u.place.sizes", placed.every((t, i) => t.size === T.squares(crowd[i])));
check("u.place.inGrid", placed.every((t) => t.pos.x >= 0 && t.pos.y >= 0 && t.pos.x + t.size <= 30 && t.pos.y + t.size <= 20));
check("u.place.integer", placed.every((t) => Number.isInteger(t.pos.x) && Number.isInteger(t.pos.y)));
let clash = [];
placed.forEach((a, i) => placed.forEach((b, j) => {
  if (j <= i) return;
  const fa = T.footprint(a), fb = T.footprint(b), la = T.labelBand(a), lb = T.labelBand(b);
  if (T.overlap(fa, fb) || T.overlap(fa, lb) || T.overlap(la, fb) || T.overlap(la, lb)) clash.push(a.label + "/" + b.label);
}));
check("u.place.noOverlap", !clash.length, clash.join());
/* the thunderbird ladder placed with the DM zoomed out to 0.48 (33.6px squares): names stay clear at that zoom */
const tbs = [["Small", "Thunderbird Hatc"], ["Medium", "Thunderbird Hatc"], ["Large", "Young Thunderbir"], ["Huge", "Widower Thunderb"], ["Gargantuan", "Elder Thunderbir"], ["Large", "Thunder Eagle"]];
const tbPlaced = [];
tbs.forEach(([sz, label]) => { const p = T.findSpot({ x: 15, y: 10 }, sz, label, tbPlaced, grid, 33.6); if (p) tbPlaced.push(tok(p.x, p.y, T.squares(sz), label)); });
const tbClash = [];
tbPlaced.forEach((a, i) => tbPlaced.forEach((b, j) => {
  if (j <= i) return;
  const fa = T.footprint(a), fb = T.footprint(b), la = T.labelBand(a, null, 33.6), lb = T.labelBand(b, null, 33.6);
  if (T.overlap(fa, fb) || T.overlap(fa, lb) || T.overlap(la, fb) || T.overlap(la, lb)) tbClash.push(a.label + "/" + b.label);
}));
check("u.place.thunderbirdsZoomedOut", tbPlaced.length === tbs.length && !tbClash.length, tbPlaced.length + " " + tbClash.join());
/* first token sits at the start when free; a full map falls back to footprint-only, then null */
check("u.place.start", JSON.stringify(T.findSpot({ x: 3, y: 3 }, "Huge", "X", [], grid)) === '{"x":3,"y":3}');
check("u.place.clampStart", JSON.stringify(T.findSpot({ x: 29, y: 19 }, "Gargantuan", "X", [], grid)) === '{"x":26,"y":16}');
const tight = { cols: 4, rows: 2 };
const s1 = T.findSpot({ x: 0, y: 0 }, "Medium", "A long name here", [], tight);
const s2 = T.findSpot({ x: 0, y: 0 }, "Medium", "Another long name", [tok(s1.x, s1.y, 1, "A long name here")], tight);
check("u.place.fallback", s1 && s2 && !(s1.x === s2.x && s1.y === s2.y), JSON.stringify([s1, s2]));
check("u.place.full", T.findSpot({ x: 0, y: 0 }, "Large", "", [tok(0, 0, 2), tok(2, 0, 2)], tight) === null);

/* ---- code wiring */
const map = read("map/ssdns-map.js");
const v2 = read("dm/assets/js/v2.js");
check("code.makeToken.size", /const squares = tokSquares\(spec\.size\);/.test(map) && /\n    size: squares,\n/.test(map) && !/\n    size: 1,\n    color: spec\.color/.test(map));
check("code.place.footprint", /const spot = nextFreeSpot\(spec\.size, /.test(map));
check("code.drag.footprint", /areaTaken\(newX, newY, tsz, state\.drag\.starts\)/.test(map) && /clampFootprint\(state\.drag\.starts\[id\]\.x \+ dx/.test(map));
check("code.drag.grab", /ox: Math\.round\(w\.x \/ gpx - 0\.5\), oy: Math\.round\(w\.y \/ gpx - 0\.5\)/.test(map));
check("code.drag.wallCentre", /crossesWall\(t\.pos\.x \+ half, t\.pos\.y \+ half, newX \+ half, newY \+ half\)/.test(map));
check("code.hit.footprint", /if \(wx >= left && wx <= left \+ size \* px && wy >= top && wy <= top \+ size \* px\) return t;/.test(map));
check("code.hidden.players", /if \(role !== 'dm' && t\.hidden\) return false;/.test(map) && /!\(role !== 'dm' && t\.hidden\)/.test(map));
check("code.publicToken.noHidden", /function publicToken\(t\) \{\n    if \(!t \|\| t\.hidden\) return null;/.test(map));
check("code.v2.beastRow", /size: b\.size \|\| "Medium",/.test(v2));
check("code.v2.patch", /size: player \? "Medium" : rowSize\(row\)/.test(v2) && /function rowSize\(row\)/.test(v2));
const dmHtml = read("dm/index.html"), sheetHtml = read("index.html");
check("code.script.dm", dmHtml.indexOf("../map/token-size.js?v=") > 0 && dmHtml.indexOf("../map/token-size.js?v=") < dmHtml.indexOf("../map/ssdns-map.js?v="));
check("code.script.sheet", sheetHtml.indexOf("map/token-size.js?v=") > 0 && sheetHtml.indexOf("map/token-size.js?v=") < sheetHtml.indexOf("map/ssdns-map.js?v="));
check("rules.untouched", !/size/i.test(JSON.stringify(JSON.parse(read("database.rules.json")).rules.rooms ? "" : "")) && !/token-size/.test(read("assets/data/rules.js")));

/* ---- browser */
const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8765";
const SHOTS = process.env.SSDNS_TOKEN_SHOTS || "";
const up = await new Promise((res) => { const u = new URL(ORIGIN); const s = net.connect(Number(u.port || 80), u.hostname, () => { s.end(); res(true); }); s.on("error", () => res(false)); });
if (!up) console.log("skip  browser part: no static server at " + ORIGIN + " (run via ssdns-test-all)");
else {
  const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
  const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pairs = (list, fn) => { const out = []; list.forEach((a, i) => list.forEach((b, j) => { if (j > i && fn(a, b)) out.push(a.label + "/" + b.label); })); return out; };
  try {
    /* DMCC: real Fight-tab adds from the bestiary */
    const pg = await browser.newPage(); const errs = [];
    pg.on("pageerror", (e) => errs.push(String(e)));
    await pg.setViewport({ width: 1600, height: 1100 });
    await pg.goto(ORIGIN + "/dm/index.html", { waitUntil: "domcontentloaded" });
    await pg.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /load demo table/i.test(b.textContent)), { timeout: 25000 });
    await sleep(1500);
    await pg.evaluate(() => [...document.querySelectorAll("button")].find((b) => /load demo table/i.test(b.textContent)).click());
    await sleep(2000);
    const tab = (n) => pg.evaluate((n) => [...document.querySelectorAll("[role=tab],.tab,[data-tab]")].find((t) => t.textContent.trim() === n).click(), n);
    await tab("Map");
    await pg.waitForFunction(() => window.SSDNSMapHost && window.SSDNSMapHost.tokensLoaded && window.SSDNSMapHost.tokensLoaded(), { timeout: 20000 });
    await sleep(800);
    const before = await pg.evaluate(() => window.SSDNSMapHost.tokenBoxes());
    await tab("Fight"); await sleep(500);
    const adds = ["buffalo-bull", "mesa-rattler", "kraken", "thunder-eagle", "thunder-eagle", "thunder-eagle", "prairie-coyote", "rattlesnake", "spectral-horse"];
    for (const id of adds) { await pg.evaluate((id) => document.querySelector('[data-add-beast="' + id + '"]').click(), id); await sleep(450); }
    await tab("Map"); await sleep(1200);
    await pg.evaluate(() => { const b = document.getElementById("btnMapFull"); if (b) b.click(); });
    await sleep(800);
    /* whole map in view: Reset view (centre, zoom 1), then wheel out at the centre */
    const canvasAt = async () => pg.evaluate(() => { const c = document.querySelector("#mapMount canvas, .ssdns-map canvas"); const r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    await pg.evaluate(() => { const r = document.querySelector('.ssdns-map [data-act="reset"]'); if (r) r.click(); });
    await sleep(300);
    const cv = await canvasAt();
    await pg.mouse.move(cv.x + cv.w / 2, cv.y + cv.h / 2);
    for (let i = 0; i < 10; i++) { await pg.mouse.wheel({ deltaY: 100 }); await sleep(40); }
    await sleep(400);
    let boxes = await pg.evaluate(() => window.SSDNSMapHost.tokenBoxes());
    const by = (label) => boxes.find((b) => b.label === label);
    const sizeOf = (l) => (by(l) || {}).size;
    check("b.size.medium", before.length > 0 && before.every((b) => b.size === 1));
    check("b.size.pcs", boxes.filter((b) => b.kind === "player").length >= 3 && boxes.filter((b) => b.kind === "player").every((b) => b.size === 1));
    check("b.size.large", sizeOf("Buffalo Bull") === 2 && ["Thunder Eagle", "Thunder Eagle 2", "Thunder Eagle 3", "Spectral Horse"].every((l) => sizeOf(l) === 2), JSON.stringify(boxes.map((b) => [b.label, b.size])));
    check("b.size.huge", sizeOf("Mesa Rattler") === 3);
    check("b.size.garg", sizeOf("The Kraken") === 4);
    check("b.size.small", sizeOf("Prairie Coyote") === 1 && sizeOf("Rattlesnake") === 1);
    const newBoxes = boxes.filter((b) => !before.some((o) => o.id === b.id));
    const tk = (b) => ({ pos: { x: b.x, y: b.y }, size: b.size, label: b.label });
    const ov = (a, b) => T.overlap(T.footprint(tk(a)), T.footprint(tk(b)));
    check("b.place.noFootprintOverlap", !pairs(boxes, (a, b) => (newBoxes.includes(a) || newBoxes.includes(b)) && ov(a, b)).length, pairs(boxes, ov).join());
    const lab = (a, b) => {
      const fa = T.footprint(tk(a)), fb = T.footprint(tk(b)), la = T.labelBand(tk(a)), lb = T.labelBand(tk(b));
      return T.overlap(fa, lb) || T.overlap(la, fb) || T.overlap(la, lb);
    };
    const labelClash = pairs(boxes, (a, b) => (newBoxes.includes(a) || newBoxes.includes(b)) && lab(a, b));
    check("b.place.labelsClear", !labelClash.length, labelClash.join());
    check("b.place.square", boxes.every((b) => Math.abs((b.screen.x2 - b.screen.x1) - (b.screen.y2 - b.screen.y1)) < 0.5));
    const k = by("The Kraken"), m1 = boxes.find((b) => b.kind === "player");
    check("b.screen.ratio", k && m1 && Math.abs((k.screen.x2 - k.screen.x1) / (m1.screen.x2 - m1.screen.x1) - 4) < 0.01);
    /* click target: the Kraken's far corner square opens its drawer */
    const cell = (k.screen.x2 - k.screen.x1) / 4;
    const cx = cv.x + k.screen.x2 - cell * 0.15, cy = cv.y + k.screen.y2 - cell * 0.15;
    const onCanvas = cx > cv.x && cy > cv.y && cx < cv.x + cv.w && cy < cv.y + cv.h;
    check("b.click.visible", onCanvas, JSON.stringify({ cx, cy, cv }));
    if (onCanvas) {
      await pg.mouse.click(cx, cy); await sleep(400);
      check("b.click.corner", (await pg.evaluate(() => window.SSDNSMapHost.drawerTokenId())) === k.id);
      /* drag by that corner: moves by whole squares with no jump to the grab point */
      const free = (dx, dy) => !boxes.some((o) => o.id !== k.id && T.overlap({ x: k.x + dx, y: k.y + dy, w: 4, h: 4 }, T.footprint(tk(o))));
      const dirs = [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => k.x + dx >= 0 && k.y + dy >= 0 && k.x + dx + 4 <= 30 && k.y + dy + 4 <= 20 && free(dx, dy));
      if (!dirs.length) check("b.drag.room", false, "no open spot next to the Kraken");
      else {
        const [dx, dy] = dirs[0];
        await pg.mouse.move(cx, cy); await pg.mouse.down();
        for (let s = 1; s <= 6; s++) { await pg.mouse.move(cx + dx * cell * s / 6, cy + dy * cell * s / 6); await sleep(30); }
        await pg.mouse.up(); await sleep(400);
        boxes = await pg.evaluate(() => window.SSDNSMapHost.tokenBoxes());
        const k2 = boxes.find((b) => b.id === k.id);
        check("b.drag.snap", k2.x === k.x + dx && k2.y === k.y + dy && k2.size === 4, JSON.stringify({ from: [k.x, k.y], to: [k2.x, k2.y], d: [dx, dy] }));
        /* drag onto another token: refused, snaps back */
        const other = boxes.find((b) => b.label === "Mesa Rattler");
        const k3s = boxes.find((b) => b.id === k.id).screen;
        const sx = cv.x + (k3s.x1 + k3s.x2) / 2, sy = cv.y + (k3s.y1 + k3s.y2) / 2;
        const tx = cv.x + (other.screen.x1 + other.screen.x2) / 2, ty = cv.y + (other.screen.y1 + other.screen.y2) / 2;
        await pg.mouse.move(sx, sy); await pg.mouse.down();
        for (let s = 1; s <= 8; s++) { await pg.mouse.move(sx + (tx - sx) * s / 8, sy + (ty - sy) * s / 8); await sleep(30); }
        await pg.mouse.up(); await sleep(400);
        boxes = await pg.evaluate(() => window.SSDNSMapHost.tokenBoxes());
        const k4 = boxes.find((b) => b.id === k.id);
        check("b.drag.blocked", k4.x === k2.x && k4.y === k2.y, JSON.stringify([k4.x, k4.y]));
      }
    }
    /* screenshot: a Medium PC walked up next to the Large / Huge / Gargantuan creatures (real drag) */
    if (SHOTS) {
      boxes = await pg.evaluate(() => window.SSDNSMapHost.tokenBoxes());
      const pc = boxes.find((b) => b.kind === "player");
      const bull = boxes.find((b) => b.label === "Buffalo Bull");
      const spots = [[-1, 0], [2, 0], [0, 2], [1, 2], [0, -1], [1, -1]].map(([ox, oy]) => ({ x: bull.x + ox, y: bull.y + oy }))
        .filter((p) => !boxes.some((o) => o.id !== pc.id && T.overlap({ x: p.x, y: p.y, w: 1, h: 1 }, T.footprint(tk(o)))));
      if (spots.length && pc) {
        const c = (pc.screen.x2 - pc.screen.x1);
        const fx = cv.x + (pc.screen.x1 + pc.screen.x2) / 2, fy = cv.y + (pc.screen.y1 + pc.screen.y2) / 2;
        const tx = fx + (spots[0].x - pc.x) * c, ty = fy + (spots[0].y - pc.y) * c;
        await pg.keyboard.down("Shift"); /* DM shift-drag passes over other tokens on the way */
        await pg.mouse.move(fx, fy); await pg.mouse.down();
        for (let s = 1; s <= 20; s++) { await pg.mouse.move(fx + (tx - fx) * s / 20, fy + (ty - fy) * s / 20); await sleep(25); }
        await pg.mouse.up(); await pg.keyboard.up("Shift"); await sleep(500);
      }
      boxes = await pg.evaluate(() => window.SSDNSMapHost.tokenBoxes());
      const b2 = boxes.find((b) => b.label === "Buffalo Bull"), k5 = boxes.find((b) => b.label === "The Kraken");
      await pg.mouse.move(cv.x + (b2.screen.x1 + k5.screen.x2) / 2, cv.y + (b2.screen.y1 + k5.screen.y2) / 2);
      for (let i = 0; i < 3; i++) { await pg.mouse.wheel({ deltaY: -100 }); await sleep(40); }
      await pg.evaluate(() => { const x = [...document.querySelectorAll(".ssdns-map button")].find((b) => b.textContent.trim() === "×" && b.offsetParent); if (x) x.click(); });
      await sleep(3500); /* let the "square is taken" toast from the blocked-drag check fade */
      await pg.bringToFront();
      const el = await pg.$("#mapMount, .ssdns-map");
      await (el || pg).screenshot({ path: path.join(SHOTS, "token-size-dm-map.png") });
    }
    check("b.noErrors", !errs.length, errs.join(" | "));

    /* demo pair: DM places + hides, the player view gets footprints but never the hidden token */
    const room = "tsz" + Date.now();
    const dm = await browser.newPage(); const derrs = [];
    dm.on("pageerror", (e) => derrs.push("dm " + e));
    await dm.setViewport({ width: 1300, height: 900 });
    await dm.goto(ORIGIN + "/map/demo.html?role=dm&room=" + room, { waitUntil: "load" });
    await dm.waitForFunction(() => window.map && window.map.tokenBoxes && window.map.tokenBoxes().length > 0, { timeout: 20000 });
    const pl = await browser.newPage();
    pl.on("pageerror", (e) => derrs.push("pl " + e));
    await pl.setViewport({ width: 1300, height: 900 });
    await pl.goto(ORIGIN + "/map/demo.html?role=player&uid=p_jolene&room=" + room, { waitUntil: "load" });
    await sleep(2500);
    await dm.bringToFront();
    const ids = await dm.evaluate(() => ["Large|Buffalo Bull|c_bull|03-buffalo-bull", "Gargantuan|The Kraken|c_kraken|14-kraken", "Huge|Mesa Rattler|c_rat|16-mesa-rattler"].map((s) => {
      const [size, name, cid, art] = s.split("|");
      const t = window.map.placeLinkedToken({ name, label: name, size, combatantId: cid, color: "#a33b3b", image: "tokenImages/bestiary/" + art + ".webp" });
      return t && t.id;
    }));
    const dmBoxes = await dm.evaluate(() => window.map.tokenBoxes());
    const rat = dmBoxes.find((b) => b.label === "Mesa Rattler");
    check("d.placed", ids.every(Boolean) && dmBoxes.find((b) => b.label === "The Kraken").size === 4 && rat.size === 3);
    /* Hide/Reveal on the Rattler, selected by a click on its far corner */
    const dcv = await dm.evaluate(() => { const r = document.querySelector("#mount canvas").getBoundingClientRect(); return { x: r.left, y: r.top }; });
    const rc = (rat.screen.x2 - rat.screen.x1) / 3;
    await dm.mouse.click(dcv.x + rat.screen.x2 - rc * 0.2, dcv.y + rat.screen.y2 - rc * 0.2); await sleep(300);
    await dm.evaluate(() => document.querySelector('[data-act="hideBtn"]').click()); await sleep(1500);
    const dmAfter = await dm.evaluate(() => window.map.tokenBoxes());
    check("d.hidden.dm", dmAfter.find((b) => b.label === "Mesa Rattler").hidden === true);
    /* fog off for everyone: the hidden token must still never reach the player */
    await dm.evaluate(() => document.querySelector('[data-act="revealAllBtn"]').click()); await sleep(1500);
    await pl.bringToFront(); await sleep(800);
    const plBoxes = await pl.evaluate(() => window.map.tokenBoxes());
    const pb = (l) => plBoxes.find((b) => b.label === l);
    check("d.player.sizes", pb("Buffalo Bull") && pb("Buffalo Bull").size === 2 && pb("The Kraken") && pb("The Kraken").size === 4, JSON.stringify(plBoxes.map((b) => [b.label, b.size])));
    check("d.player.pcMedium", pb("JP") && pb("JP").size === 1);
    check("d.player.hiddenGone", !pb("Mesa Rattler") && !plBoxes.some((b) => b.hidden));
    const pubLeak = await pl.evaluate(() => JSON.stringify(window.map.tokenBoxes()).includes("Rattler"));
    check("d.player.noLeak", !pubLeak);
    if (SHOTS) {
      const pcv = await pl.evaluate(() => { const r = document.querySelector("#mount canvas").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
      const kb = pb("The Kraken"), bb = pb("Buffalo Bull");
      if (kb && bb) {
        await pl.evaluate(() => { const r = document.querySelector('#mount [data-act="reset"]'); if (r) r.click(); });
        await sleep(300);
        await pl.mouse.move(pcv.x + pcv.w / 2, pcv.y + pcv.h / 2);
        for (let i = 0; i < 4; i++) { await pl.mouse.wheel({ deltaY: 100 }); await sleep(40); }
        await sleep(500);
      }
      await pl.screenshot({ path: path.join(SHOTS, "token-size-player-view.png") });
      await dm.bringToFront(); await sleep(300);
      await dm.screenshot({ path: path.join(SHOTS, "token-size-dm-demo-hidden.png") });
    }
    check("d.noErrors", !derrs.length, derrs.join(" | "));
  } finally { await browser.close(); }
}
if (failures.length) { console.log("\n" + failures.length + " FAILED"); process.exit(1); }
console.log("token-size ok");
