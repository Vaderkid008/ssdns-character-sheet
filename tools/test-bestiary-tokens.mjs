/**
 * Bestiary map token art (Jessey 👍 2026-10-20 10:30 AM CT; art + token fields from Encounter Bot).
 * dm/assets/data/bestiary.json "token" = a file in map/tokenImages/bestiary/ (map loads "tokenImages/..." as is).
 * Placing a bestiary enemy uses it; a custom enemy or a missing token keeps the old default.
 *   node tools/test-bestiary-tokens.mjs   (browser part: ssdns-test-all's :8765)
 */
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function webpSize(file) {
  const b = fs.readFileSync(file);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP") return null;
  const kind = b.toString("ascii", 12, 16);
  if (kind === "VP8X") return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  if (kind === "VP8L") return { w: 1 + (((b[22] & 0x3f) << 8) | b[21]), h: 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)) };
  if (kind === "VP8 ") return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  return null;
}

const DIR = path.join(root, "map/tokenImages/bestiary");
const beasts = JSON.parse(read("dm/assets/data/bestiary.json")).filter((b) => b && !b.template);
check("data.count", beasts.length === 54, String(beasts.length));
const noTok = beasts.filter((b) => !b.token).map((b) => b.id);
check("data.everyToken", !noTok.length, noTok.join());
const files = [];
beasts.forEach((b) => { if (b.token) files.push(b.token); (b.tokenAlts || []).forEach((a) => files.push(a)); });
const missing = files.filter((f) => !fs.existsSync(path.join(DIR, f)));
check("files.exist", !missing.length, missing.join());
check("files.webpNames", files.every((f) => /^(_alts\/)?\d\d-[a-z0-9-_]+\.webp$/.test(f)), files.filter((f) => !/\.webp$/.test(f)).join());
const all = fs.readdirSync(DIR).filter((f) => /\.webp$/.test(f)).map((f) => f).concat(fs.readdirSync(path.join(DIR, "_alts")).map((f) => "_alts/" + f));
const dims = all.map((f) => ({ f, d: webpSize(path.join(DIR, f)), kb: fs.statSync(path.join(DIR, f)).size / 1024 }));
check("files.small", dims.every((x) => x.d && x.d.w <= 256 && x.d.h <= 256 && x.d.w === x.d.h && x.kb < 64), JSON.stringify(dims.filter((x) => !x.d || x.d.w > 256 || x.kb >= 64)));
check("files.noPng", !fs.readdirSync(DIR).some((f) => /\.png$/i.test(f)));
check("spectral.alts", JSON.stringify(beasts.find((b) => b.id === "spectral-horse").tokenAlts) === JSON.stringify(["_alts/56-spectral-horse_alt-a-standing.webp", "_alts/56-spectral-horse_take-b-solid.webp", "_alts/56-spectral-horse_take-d-veiled.webp"]));
/* copied, not wired: no bestiary entry yet */
check("unwired.thunderbirds", ["52-tombstone-thunderbird.webp", "53-thunderbird-hatchling.webp"].every((f) => fs.existsSync(path.join(DIR, f)) && !files.includes(f)));
const unused = all.filter((f) => !files.includes(f)).sort();
check("unwired.onlyThunderbirds", unused.join() === "52-tombstone-thunderbird.webp,53-thunderbird-hatchling.webp", unused.join());
/* code */
const v2 = read("dm/assets/js/v2.js");
check("code.dir", v2.includes('const BEAST_TOKEN_DIR = "tokenImages/bestiary/";') && /if \(\/\^tokenImages\\\/\/\.test\(src\)\)/.test(read("map/ssdns-map.js")));
check("code.fallbackOrder", /if \(beastArt\) patch\.image = beastArt;[^\n]*\n\s*else if \(preset\) patch\.image = preset;/.test(v2));
const fnSrc = v2.slice(v2.indexOf("function beastTokenFile"), v2.indexOf("function beastTokenImage"));
const beastTokenFile = new Function(fnSrc + "; return beastTokenFile;")();
check("code.sanitize", beastTokenFile({ token: "01-outlaw.webp" }) === "01-outlaw.webp" && beastTokenFile({ token: "_alts/56-x.webp" }) === "_alts/56-x.webp" &&
  !beastTokenFile({ token: "../../x.webp" }) && !beastTokenFile({ token: "https://evil/x.webp" }) && !beastTokenFile({ token: "" }) && !beastTokenFile({}) && !beastTokenFile(null) && !beastTokenFile({ token: "x.svg" }));
check("rules.js untouched", !/tokenImages\/bestiary/.test(read("assets/data/rules.js")));

/* ---- browser: DMCC offline demo, place bestiary enemies on the map */
const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8765";
const up = await new Promise((res) => { const u = new URL(ORIGIN); const s = net.connect(Number(u.port || 80), u.hostname, () => { s.end(); res(true); }); s.on("error", () => res(false)); });
if (!up) console.log("skip  browser part: no static server at " + ORIGIN + " (run via ssdns-test-all)");
else {
  const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
  const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const pg = await browser.newPage(); const errs = [], imgs = [];
    pg.on("pageerror", (e) => errs.push(String(e)));
    pg.on("response", (r) => { if (/tokenImages\/bestiary\//.test(r.url())) imgs.push(r.status() + " " + r.url().replace(/^.*tokenImages\/bestiary\//, "")); });
    await pg.setViewport({ width: 1400, height: 1000 });
    await pg.goto(ORIGIN + "/dm/index.html", { waitUntil: "domcontentloaded" });
    await pg.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /load demo table/i.test(b.textContent)), { timeout: 25000 });
    await sleep(1500);
    await pg.evaluate(() => [...document.querySelectorAll("button")].find((b) => /load demo table/i.test(b.textContent)).click());
    await sleep(2000);
    const tab = (n) => pg.evaluate((n) => [...document.querySelectorAll("[role=tab],.tab,[data-tab]")].find((t) => t.textContent.trim() === n).click(), n);
    await tab("Map");
    await pg.waitForFunction(() => window.SSDNSMapHost && window.SSDNSMapHost.tokensLoaded && window.SSDNSMapHost.tokensLoaded(), { timeout: 20000 });
    await pg.evaluate(() => {
      const h = window.SSDNSMapHost, orig = h.placeToken; window.__placed = [];
      h.placeToken = function (p) { window.__placed.push({ name: p.name, image: p.image || "" }); return orig.apply(this, arguments); };
    });
    await tab("Fight"); await sleep(500);
    for (const id of ["outlaw", "kraken", "spectral-horse", "abigail-ellen"]) {
      await pg.evaluate((id) => document.querySelector('[data-add-beast="' + id + '"]').click(), id); await sleep(400);
    }
    await pg.evaluate(() => { const b = document.getElementById("btnAddCustom"); if (b) b.click(); }); await sleep(500);
    await tab("Map"); await sleep(1500);
    const placed = await pg.evaluate(() => window.__placed);
    const byName = Object.fromEntries(placed.map((p) => [p.name, p.image]));
    check("b.placed.art", byName["Outlaw"] === "tokenImages/bestiary/01-outlaw.webp" && byName["The Kraken"] === "tokenImages/bestiary/14-kraken.webp" && byName["Spectral Horse"] === "tokenImages/bestiary/56-spectral-horse.webp", JSON.stringify(placed));
    check("b.placed.overPreset", byName["Abigail Ellen"] === "tokenImages/bestiary/38-abigail-ellen.webp", JSON.stringify(placed));
    check("b.custom.fallback", placed.some((p) => /bandit/i.test(p.name) && p.image === ""), JSON.stringify(placed));
    check("b.loaded", ["01-outlaw.webp", "14-kraken.webp", "56-spectral-horse.webp", "38-abigail-ellen.webp"].every((f) => imgs.includes("200 " + f)), imgs.join());
    check("b.noErrors", !errs.length, errs.join(" | "));
  } finally { await browser.close(); }
}
if (failures.length) { console.log("\n" + failures.length + " FAILED"); process.exit(1); }
console.log("bestiary-tokens ok");
