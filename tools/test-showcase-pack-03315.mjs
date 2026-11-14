/**
 * Bitter Spring Relay showcase pack imports through the scene pack code.
 * Sheet 0.3.315 / DMCC 0.2.328.
 *   node tools/test-showcase-pack-03315.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.315" && ver.dmcc === "0.2.328" && ver.sheetBuild === "sheet-playtest-v03315" && ver.dmccBuild === "dmcc-playtest-v02328");
check("rules.clean", !read("assets/data/rules.js").includes("bitter-spring") && !read("database.rules.json").includes("bitter-spring"));

const sandbox = { window: {}, globalThis: {} };
sandbox.window = sandbox;
vm.runInNewContext(read("map/places.js") + "\n" + read("map/scene-builder.js"), sandbox);
const B = sandbox.SSDNSSceneBuilder;
const text = read("showcase/bitter-spring-relay/bitter-spring-relay.ssdns-pack.json");
const mem = { bag: {} };
mem.getItem = (k) => (k in mem.bag ? mem.bag[k] : null);
mem.setItem = (k, v) => { mem.bag[k] = String(v); };
const imported = B.importScenePack(text, { store: mem, maps: {} });
check("import.ok", imported.ok && imported.added === 1 && imported.maps.length === 2, imported.error || imported.message);
const scene = B.readLibrary(mem).scenes.scn_bitter_spring;
const ground = scene && scene.floors[0];
const up = scene && scene.floors[1];
check("floors", !!ground && !!up && ground.mapId === "bitter-spring-relay-ground" && up.mapId === "bitter-spring-relay-upstairs" && ground.name.indexOf("Ground") === 0);
const party = (ground.spawns || []).filter((sp) => sp.groupId === "grp_party").map((sp) => sp.x + "," + sp.y);
const back = (ground.spawns || []).filter((sp) => sp.groupId === "grp_party_b").map((sp) => sp.x + "," + sp.y);
check("spawns", party.join(" ") === "0,1 1,1 0,2 1,2 0,3 1,3" && back.join(" ") === "2,24 3,24 2,25 3,25", party.join(" ") + " | " + back.join(" "));
function linkAt(floor, x, y) {
  return (floor.stairs || []).find((s) => s.x === x && s.y === y);
}
const upStair = linkAt(ground, 14, 22);
const outStair = linkAt(ground, 23, 19);
const ladder = linkAt(ground, 30, 13);
check("links", upStair && upStair.twoWay && upStair.visible === false && upStair.landX === 14 && upStair.landY === 17 && outStair && outStair.landX === 23 && outStair.landY === 12 && ladder && ladder.kind === "ladder" && ladder.landX === 30 && ladder.landY === 13 && linkAt(up, 14, 17) && linkAt(up, 23, 12) && linkAt(up, 30, 13));
const strong = ground.encounters.containers.find((c) => c.name === "Stage Strongbox");
const chest = up.encounters.containers.find((c) => c.name === "Agent's Chest");
const trunk = up.encounters.containers.find((c) => c.name === "Passenger Trunk");
const saddle = up.encounters.containers.find((c) => c.name === "Crew's Saddle Chest");
check("containers", strong && strong.kind === "strongbox" && strong.lockDc === 15 && strong.forceDc === 25 && strong.keyItem === "strongbox-key" && strong.x === 18 && strong.y === 15 && chest && chest.lockDc === 13 && chest.forceDc === 15 && chest.items.some((it) => it.catalogId === "strongbox-key") && trunk && trunk.unlocked === true && trunk.lockDc === 0 && saddle && saddle.hidden === true && saddle.lockDc === 14 && saddle.forceDc === 15 && saddle.hideDc === 13, JSON.stringify([strong, chest, trunk, saddle].map((c) => c && { name: c.name, lock: c.lockDc, force: c.forceDc, hidden: c.hidden })));
const foes = ground.encounters.enemies.concat(up.encounters.enemies);
const hidden = foes.filter((e) => e.hidden).map((e) => e.name).sort();
check("foes", foes.length === 6 && hidden.join(",") === "Loft Rifle,Stall Hand,The Cracker" && scene.encounters.xp === 300, hidden.join(",") + " xp " + (scene.encounters && scene.encounters.xp));
const banned = ["Company Rider", "Rival Adventurer", "Rustler", "Outlaw"];
const shown = foes.map((e) => e.name).concat(ground.encounters.containers.concat(up.encounters.containers).map((c) => c.name));
check("names", shown.every((name) => !banned.some((bad) => name === bad || name.indexOf(bad) >= 0)) && foes.some((e) => e.bestiaryId === "company-rider" && e.name === "Pick-Handle"), shown.join(" | "));
function lockedDoors(walls) {
  return (walls || []).filter((w) => w && w.door && w.locked);
}
const gDoors = lockedDoors(imported.maps.find((m) => m.id === "bitter-spring-relay-ground").walls);
const uDoors = lockedDoors(imported.maps.find((m) => m.id === "bitter-spring-relay-upstairs").walls);
check("doors", gDoors.length === 1 && uDoors.length === 1 && gDoors[0].lockDc === 12 && gDoors[0].forceDc === 15 && uDoors[0].lockDc === 12 && uDoors[0].forceDc === 15);
check("pregens", fs.existsSync(path.join(root, "showcase/bitter-spring-relay/pregens/ace-duchamp.ssdns")) && !JSON.parse(read("showcase/bitter-spring-relay/pregens/ace-duchamp.ssdns")).character.toolBonus && !JSON.parse(read("showcase/bitter-spring-relay/pregens/ezra-thorne.ssdns")).character.toolBonus && /Thieves' tools/.test(JSON.parse(read("showcase/bitter-spring-relay/pregens/ace-duchamp.ssdns")).character.proficienciesLanguages));

const OUT = "/opt/cursor/artifacts/bitter-spring";
fs.mkdirSync(OUT, { recursive: true });
const { chromium } = await import("/tmp/pw/node_modules/playwright-core/index.mjs");
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
await page.goto("http://127.0.0.1:8765/map/demo.html?role=dm&room=bitter-spring-315", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.map && window.SSDNSSceneBuilder);
const localPack = JSON.parse(text);
const origin = "http://127.0.0.1:8765/showcase/bitter-spring-relay/";
localPack.maps.forEach((m) => { m.src = origin + m.src.split("/").pop(); });
const localPath = path.join(OUT, "bitter-spring-relay.ssdns-pack.json");
fs.writeFileSync(localPath, JSON.stringify(localPack));
await page.evaluate(() => {
  document.querySelector("[data-act='mapsBtn']").click();
  document.querySelector("[data-act='sceneBuilderBtn']").click();
});
await page.waitForSelector("[data-act='sceneBuilder']");
await page.setInputFiles("[data-act='scenePackFile']", localPath);
await page.waitForTimeout(400);
const notice = await page.locator("[data-act='scenePackNotice']").innerText();
check("ui.import", /Imported/.test(notice), notice);
await page.locator("[data-act='sceneOpen']").click();
await page.waitForTimeout(200);
await page.evaluate(() => {
  const panel = document.querySelector("[data-act='sceneBuilder']");
  const host = document.createElement("div");
  host.className = "ssdns-map";
  host.style.cssText = "position:relative;display:block;width:480px;height:auto;max-height:none;overflow:visible;background:#14110e;";
  document.body.appendChild(host);
  const shot = document.createElement("div");
  shot.setAttribute("data-act", "showcaseShot");
  shot.style.cssText = "display:block;width:440px;background:#14110e;color:#f0e4cf;padding:12px;";
  const title = document.createElement("h2");
  title.textContent = panel.querySelector("[data-act='sceneName']").value;
  shot.appendChild(title);
  panel.querySelectorAll("[data-act='encounterFloor'], [data-act='encounterSummary']").forEach((node) => shot.appendChild(node));
  host.appendChild(shot);
});
await page.locator("[data-act='showcaseShot']").screenshot({ path: path.join(OUT, "builder.png"), timeout: 20000 });
await page.evaluate(() => {
  document.querySelector("[data-act='sceneLoad']").click();
  window.SSDNSSceneBuilder.close();
  const foe = window.map.tokenBoxes().find((t) => t.label === "PH" || /Pick/.test(t.label || ""));
  const box = window.map.tokenBoxes().find((t) => t.kind === "chest");
  const at = foe || box;
  if (at) window.map.lookAt(at.x, at.y, 0.85);
});
await page.waitForTimeout(300);
await page.locator("#mount canvas").first().screenshot({ path: path.join(OUT, "dm-loaded.png"), timeout: 20000 });
const dmNames = await page.evaluate(() => window.map.tokenBoxes().map((t) => t.label));
check("ui.dm", dmNames.indexOf("PI") >= 0 && dmNames.indexOf("BA") >= 0 && dmNames.indexOf("ST") >= 0, dmNames.join(","));
await page.evaluate(() => {
  const fog = document.querySelector("[data-act='fogBtn']");
  if (fog) fog.click();
});

const player = await context.newPage();
await player.goto("http://127.0.0.1:8765/map/demo.html?role=player&uid=p_jolene&room=bitter-spring-315", { waitUntil: "domcontentloaded" });
await player.waitForFunction(() => window.map && window.map.tokenBoxes);
await player.waitForTimeout(400);
const seen = await player.evaluate(() => {
  const boxes = window.map.tokenBoxes();
  const foe = boxes.find((t) => t.kind === "enemy") || boxes.find((t) => t.kind === "chest");
  if (foe) window.map.lookAt(foe.x, foe.y, 0.7);
  else window.map.lookAt(12, 12, 0.7);
  return boxes.map((t) => t.label + ":" + t.kind + "@" + t.x + "," + t.y);
});
check("ui.player", seen.some((n) => n.indexOf("PI:enemy") === 0) && seen.some((n) => n.indexOf("BA:enemy") === 0) && !seen.some((n) => n.indexOf("ST:") === 0) && !seen.some((n) => /Company|Rival|Rustler|Outlaw/.test(n)), seen.join(" "));
await player.locator("#mount canvas").first().screenshot({ path: path.join(OUT, "player-hidden.png"), timeout: 20000 });
await browser.close();

if (failures.length) {
  console.log("FAILED " + failures.length);
  failures.forEach((line) => console.log(" - " + line));
  process.exit(1);
}
console.log("showcase pack 0.3.315 ok");
process.exit(0);
