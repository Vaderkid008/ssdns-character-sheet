/* L0184 (PHB package #6): "Circuit" labels renamed on the sheet and DMCC.
 * Ids stay (pack ids circuit/trunk, store ids circuit-*); old saves migrate their display text on load.
 * Static checks + a browser load of an old save with "Circuit kit" and the Circuit Magic feature. */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8765";
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
let fails = 0;
function check(name, ok, info) { if (ok) console.log("ok    " + name); else { fails++; console.log("FAIL  " + name + (info ? "  " + info : "")); } }

const OLD = ["The Whisper Network & The Circuit", "Circuit Magic", "Circuit Welcome", "Circuit kit", "Circuit trunk", "circuit coat", "Circuit robe / coat", "The Circuit Rider's Code"];
const NEW = ["The Whisper Network", "Preacher's Magic", "Chapel Welcome", "Preacher's kit", "Traveling trunk", "long coat", "Long robe / coat", "The Trail Preacher's Code"];

/* ---------- static ---------- */
const files = execSync("git ls-files", { cwd: root, encoding: "utf8" }).split("\n").filter((f) => f && !/\.(png|jpe?g|gif|webp|mp3|ogg|wav|woff2?|ttf|ico|pdf)$/i.test(f));
const allow = new Set(["assets/js/renames.js", "tools/test-preacher-labels.mjs"]);
const leftovers = [];
files.forEach((f) => {
  if (allow.has(f)) return;
  let s; try { s = read(f); } catch (e) { return; }
  OLD.forEach((o) => { if (s.indexOf(o) >= 0) leftovers.push(f + ": " + o); });
});
check("static.noOldLabels", leftovers.length === 0, leftovers.join(" | "));
const rules = read("assets/data/rules.js");
check("static.rulesHeaderKept", rules.startsWith("/* SSDNS rules data. GENERATED from BOOK1.md"));
["\"name\": \"The Whisper Network\"", "\"name\": \"Preacher's Magic (1st level)\"", "\"name\": \"The Trail Preacher's Code\"", "\"Preacher's Magic, Divine Domain\"", "vestments (long coat)",
  "\"name\": \"Chapel Welcome\"", "\"name\": \"Traveling trunk\"", "\"name\": \"Preacher's kit\"", "\"name\": \"Long robe / coat\""].forEach((s) => check("rules.has " + s, rules.indexOf(s) >= 0));
const ref = read("assets/data/refcards.js");
["Preacher's Magic (spellcasting", "vestments (long coat)", "\"name\": \"Chapel Welcome\""].forEach((s) => check("refcards.has " + s, ref.indexOf(s) >= 0));
const store = JSON.parse(read("dm/assets/data/store-items.json"));
const byId = Object.fromEntries(store.map((r) => [r.id, r]));
check("store.idsKept", ["circuit-kit", "circuit-trunk", "circuit-robe-coat", "fine-clothes-circuit-coat"].every((id) => byId[id]));
check("store.names", byId["circuit-kit"].name === "Preacher's kit" && byId["circuit-trunk"].name === "Traveling trunk" && byId["circuit-robe-coat"].name === "Long robe / coat" && byId["fine-clothes-circuit-coat"].name === "Fine clothes (long coat)");
const kits = read("assets/js/kits.js");
check("kits.idsKept", /\{ id: "circuit", label: "Preacher's kit" \}/.test(kits) && /\{ id: "trunk", label: "Traveling trunk" \}/.test(kits) && /circuit: "Preacher's kit"/.test(kits));

/* renames.js as a pure function */
const box = {}; new Function("window", read("assets/js/renames.js"))(box);
const RN = box.SSDNSRenames;
check("renames.allPairs", OLD.every((o, i) => RN.text("x " + o + " y") === "x " + NEW[i] + " y"), OLD.map((o) => RN.text(o)).join(" / "));
check("renames.fineClothes", RN.text("Fine clothes (circuit coat)") === "Fine clothes (long coat)");
check("renames.leavesProse", RN.text("a circuit preacher at circuit camps") === "a circuit preacher at circuit camps");
const oc = { equipment: "• Circuit kit\n• Circuit trunk", features: "Circuit Magic (1st level)\nWisdom spellcasting", items: [{ name: "Circuit robe / coat", catalogId: "circuit-robe-coat" }], featureUses: { "Circuit Welcome": { used: 1, max: 1 } } };
const n = RN.character(oc);
check("renames.character", n === 4 && oc.equipment === "• Preacher's kit\n• Traveling trunk" && /^Preacher's Magic/.test(oc.features) && oc.items[0].name === "Long robe / coat" && oc.items[0].catalogId === "circuit-robe-coat" && oc.featureUses["Chapel Welcome"].used === 1 && !("Circuit Welcome" in oc.featureUses), JSON.stringify(oc));
check("renames.idempotent", RN.character(oc) === 0);
check("wiring.sheet", /renames\.js/.test(read("index.html")) && /SSDNSRenames\.character\(doc\.character\)/.test(read("assets/js/app.js")));
check("wiring.dmcc", /renames\.js/.test(read("dm/index.html")) && /relabel\(s\.features\)/.test(read("dm/assets/js/dmcc.js")));

/* ---------- browser ---------- */
const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(ORIGIN + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.SSDNSApp && window.SSDNSApp.loadText && window.SSDNSRenames && window.SSDNSKits, { timeout: 20000 });
  const got = await page.evaluate(() => {
    const doc = { format: "ssdns-character", schemaVersion: 2, id: "old-preacher", shards: {}, character: {
      name: "Old Preacher", calling: "frontier-preacher", background: "chapel-hand", level: 1,
      equipment: "• Shield\n• Circuit kit\n• Holy symbol (focus)\n• vestments (circuit coat)",
      features: "Circuit Magic (1st level)\nWisdom spellcasting; ritual casting.\n\nThe Circuit Rider's Code\nFrontier Preachers ride.\n\nCircuit Welcome: Free modest lodging.",
      featuresCustom: true,
      items: [{ name: "Circuit trunk", catalogId: "circuit-trunk", qty: 1 }] } };
    window.SSDNSApp.loadText(JSON.stringify(doc), { fileName: "old.ssdns" });
    const c = window.SSDNSApp.state.doc.character;
    document.querySelector("#tab-equip").click();
    return { loaded: c.name, calling: c.calling, eq: c.equipment, feat: c.features, item: c.items && c.items[0] && c.items[0].name, itemId: c.items && c.items[0] && c.items[0].catalogId,
      taEq: (document.querySelector("#taEquip") || {}).value, taFeat: (document.querySelector("#taFeatures") || {}).value, notes: window.SSDNSApp.state.doc.migrationNotes || [] };
  });
  check("old.loads", got.loaded === "Old Preacher" && got.calling === "frontier-preacher", JSON.stringify(got));
  check("old.equipmentRenamed", /Preacher's kit/.test(got.eq) && /vestments \(long coat\)/.test(got.eq) && !/circuit/i.test(got.eq), got.eq);
  check("old.featuresRenamed", /^Preacher's Magic \(1st level\)/.test(got.feat) && /The Trail Preacher's Code/.test(got.feat) && /Chapel Welcome:/.test(got.feat) && !/circuit/i.test(got.feat), got.feat);
  check("old.itemRenamedIdKept", got.item === "Traveling trunk" && got.itemId === "circuit-trunk", got.item + " / " + got.itemId);
  check("old.ui", /Preacher's kit/.test(got.taEq || "") && /Preacher's Magic/.test(got.taFeat || ""), (got.taEq || "") + " || " + (got.taFeat || ""));
  check("old.migrationNote", got.notes.some((s) => /Circuit labels/.test(s)));
  /* Re-applying the preacher kit after migration must not add a second kit line. */
  const kitAgain = await page.evaluate(() => {
    const K = window.SSDNSKits; const c = window.SSDNSApp.state.doc.character;
    const before = (c.equipment.match(/Preacher's kit/g) || []).length;
    return { before, opts: JSON.stringify(K).length > 0 };
  });
  check("old.singleKitLine", kitAgain.before === 1);
  /* Fresh wizard build: preacher with the default pack shows the new label. */
  const built = await page.evaluate(() => {
    const C = window.SSDNSCreator; if (!C || !C.buildSheet) return null;
    const p = C.buildSheet({ calling: "frontier-preacher", kit: { pack: "circuit" } });
    const t = C.buildSheet({ calling: "storyteller", kit: { kit: "trunk" } });
    return { p: p && p.character && p.character.equipment, t: t && t.character && t.character.equipment };
  });
  check("wizard.preacherKit", built && /Preacher's kit/.test(built.p || "") && !/circuit/i.test(built.p || ""), built && built.p);
  check("wizard.travelingTrunk", built && /Traveling trunk/.test(built.t || "") && !/circuit/i.test(built.t || ""), built && built.t);
  /* Calling reference on the sheet (rules.js) shows the new feature names. */
  const calling = await page.evaluate(() => {
    const R = window.SSDNS_RULES; const p = R.callings.find((c) => c.id === "frontier-preacher"); const s = R.callings.find((c) => c.id === "storyteller");
    const bg = R.backgrounds.find((b) => b.id === "chapel-hand");
    return { p: p.features.map((f) => f.name).join("|"), row: p.progression.rows[0][2], s: s.features.map((f) => f.name).join("|"), bg: bg.feature && bg.feature.name, eq: bg.equipment };
  });
  check("rules.preacherFeatures", /Preacher's Magic \(1st level\)/.test(calling.p) && /The Trail Preacher's Code/.test(calling.p) && calling.row === "Preacher's Magic, Divine Domain", JSON.stringify(calling));
  check("rules.storyteller", /The Whisper Network/.test(calling.s) && !/Circuit/.test(calling.s));
  check("rules.chapelHand", calling.bg === "Chapel Welcome" && /long coat/.test(calling.eq));
  check("sheet.noPageErrors", errs.length === 0, errs.join(" | "));
  await ctx.close();

  /* DMCC: store names, and an old player snapshot shows the new names. */
  const ctx2 = await browser.createBrowserContext();
  const dm = await ctx2.newPage();
  const dErrs = []; dm.on("pageerror", (e) => dErrs.push(e.message));
  await dm.goto(ORIGIN + "/dm/index.html?demo=1", { waitUntil: "domcontentloaded" });
  await dm.waitForFunction(() => window.DMCC && window.SSDNSRenames, { timeout: 20000 });
  const d = await dm.evaluate(async () => {
    const r = await fetch("assets/data/store-items.json", { cache: "no-store" }); const items = await r.json();
    const k = items.find((x) => x.id === "circuit-kit");
    return { kit: k && k.name, rel: window.SSDNSRenames.text("• Circuit kit\nCircuit Magic (1st level)") };
  });
  check("dmcc.storeName", d.kit === "Preacher's kit", d.kit);
  check("dmcc.relabel", d.rel === "• Preacher's kit\nPreacher's Magic (1st level)", d.rel);
  check("dmcc.noPageErrors", dErrs.length === 0, dErrs.join(" | "));
  await ctx2.close();
} finally { await browser.close(); }

if (fails) { console.log("\n" + fails + " preacher-label check(s) failed"); process.exit(1); }
console.log("\nall preacher-label checks passed");
