/* L0184 + L0185 (PHB package #6): "Circuit" labels, drover's staff and Detect unquiet dead renamed on the sheet and DMCC.
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

const OLD = ["The Whisper Network & The Circuit", "Circuit Magic", "Circuit Welcome", "Circuit kit", "Circuit trunk", "circuit coat", "Circuit robe / coat", "The Circuit Rider's Code", "drover's staff", "Detect unquiet dead"];
const NEW = ["The Whisper Network", "Preacher's Magic", "Chapel Welcome", "Preacher's kit", "Traveling trunk", "long coat", "Long robe / coat", "The Trail Preacher's Code", "cowhand's staff", "Detect restless dead"];

/* ---------- static ---------- */
const files = execSync("git ls-files", { cwd: root, encoding: "utf8" }).split("\n").filter((f) => f && !/\.(png|jpe?g|gif|webp|mp3|ogg|wav|woff2?|ttf|ico|pdf)$/i.test(f));
const allow = new Set(["assets/js/renames.js", "tools/test-preacher-labels.mjs"]);
const leftovers = [];
files.forEach((f) => {
  if (allow.has(f)) return;
  let s; try { s = read(f); } catch (e) { return; }
  OLD.forEach((o) => {
    /* weapon-art.js keeps the old staff name as a second lookup row; test-gear-tab checks the old id/name slug. */
    if (o === "drover's staff" && (f === "assets/js/weapon-art.js" || f === "tools/test-gear-tab.mjs")) return;
    if (s.indexOf(o) >= 0) leftovers.push(f + ": " + o);
  });
});
check("static.noOldLabels", leftovers.length === 0, leftovers.join(" | "));
const rules = read("assets/data/rules.js");
check("static.rulesHeaderKept", rules.startsWith("/* SSDNS rules data. GENERATED from BOOK1.md"));
["\"name\": \"The Whisper Network\"", "\"name\": \"Preacher's Magic (1st level)\"", "\"name\": \"The Trail Preacher's Code\"", "\"Preacher's Magic, Divine Domain\"", "vestments (long coat)",
  "\"name\": \"Chapel Welcome\"", "\"name\": \"Traveling trunk\"", "\"name\": \"Preacher's kit\"", "\"name\": \"Long robe / coat\""].forEach((s) => check("rules.has " + s, rules.indexOf(s) >= 0));
/* L0185 */
check("rules.staffRenamedIdKept", rules.indexOf('"id": "trail-staff-drover-s-staff-quarterstaff",\n   "name": "Trail staff / cowhand\'s staff (quarterstaff)"') >= 0);
check("rules.restlessDead", rules.indexOf('"name": "Oath Sense (Divine Sense - 1st lvl)",\n     "text": "Detect restless dead,') >= 0);
check("wording.restlessRefcard", read("assets/data/refcards.js").indexOf("sense restless dead") >= 0 && read("assets/data/refcards.js").indexOf("unquiet dead") < 0);
check("wording.oreSparks", rules.indexOf('"sketch": "Floating ore sparks"') >= 0 && !/Floating assay/.test(rules));
check("rules.primevalAwarenessKept", rules.indexOf("Primeval Awareness") >= 0);
const ref = read("assets/data/refcards.js");
["Preacher's Magic (spellcasting", "vestments (long coat)", "\"name\": \"Chapel Welcome\""].forEach((s) => check("refcards.has " + s, ref.indexOf(s) >= 0));
const store = JSON.parse(read("dm/assets/data/store-items.json"));
const byId = Object.fromEntries(store.map((r) => [r.id, r]));
check("store.staff", byId["trail-staff-drover-s-staff"] && byId["trail-staff-drover-s-staff"].name === "Trail staff / cowhand's staff");
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
const om = { features: "Oath Sense (Divine Sense - 1st lvl)\nDetect unquiet dead, hell-branded fiends.", melee: [{ weapon: "trail-staff-drover-s-staff-quarterstaff", name: "Trail staff / drover's staff (quarterstaff)" }], equipment: "Every drover's first holster" };
check("renames.l0185", RN.character(om) === 2 && /Detect restless dead/.test(om.features) && om.melee[0].name === "Trail staff / cowhand's staff (quarterstaff)" && om.melee[0].weapon === "trail-staff-drover-s-staff-quarterstaff" && om.equipment === "Every drover's first holster", JSON.stringify(om));
/* L0165: store says Ore, never assay; ids kept; old names migrate */
check("store.oreNames", byId["assay-glass-magnifying-glass"].name === "Ore glass (magnifying glass)" && byId["assay-scale"].name === "Ore scale" && byId["forgery-kit-assay-forgeries"].name === "Forgery kit (ore forgeries)");
check("store.noAssayDisplay", store.every((r) => !/assay/i.test(String(r.name || "") + " " + String(r.notes || ""))), store.filter((r) => /assay/i.test(String(r.name) + " " + String(r.notes || ""))).map((r) => r.id).join(","));
const st = [{ id: "assay-glass-magnifying-glass", name: "Assay glass (magnifying glass)" }, { id: "assay-scale", name: "Assay scale" }, { id: "forgery-kit-assay-forgeries", name: "Forgery kit (assay forgeries)" }, { id: "circuit-kit", name: "Circuit kit" }, { id: "trail-staff-drover-s-staff", name: "Trail staff / drover's staff" }];
check("renames.stockLines", RN.lines(st) === 5 && st.map((r) => r.name).join("|") === "Ore glass (magnifying glass)|Ore scale|Forgery kit (ore forgeries)|Preacher's kit|Trail staff / cowhand's staff" && st[0].id === "assay-glass-magnifying-glass", st.map((r) => r.name).join("|"));
check("wiring.stock", /SSDNSRenames\.lines\(stock\)/.test(read("assets/js/sheet-extras.js")) && /SSDNSRenames\.lines\(raw\.draft\[id\]\.lines\)/.test(read("dm/assets/js/v2.js")) && (read("dm/assets/js/v2.js").match(/SSDNSRenames\.text\((row|line)\.name\)/g) || []).length === 2);
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
    /* inv2 (0.3.87): a kit line that is a catalog item (the pack) lands as a real item, so read items too */
    const gear = (b) => b && b.character ? [b.character.equipment || ""].concat((b.character.items || []).map((x) => "• " + x.name)).join("\n") : "";
    return { p: gear(p), t: gear(t) };
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
  /* L0185: an old Lawman save with the staff and Oath Sense text. */
  const law = await page.evaluate(() => {
    const doc = { format: "ssdns-character", schemaVersion: 2, id: "old-lawman", shards: {}, character: {
      name: "Old Lawman", calling: "lawman", level: 1, featuresCustom: true,
      features: "Oath Sense (Divine Sense - 1st lvl)\nDetect unquiet dead, hell-branded fiends, or sacred presence within 60 ft (1 + Cha mod times/day).",
      melee: [{ weapon: "trail-staff-drover-s-staff-quarterstaff", equipped: true }] } };
    window.SSDNSApp.loadText(JSON.stringify(doc), { fileName: "law.ssdns" });
    const c = window.SSDNSApp.state.doc.character; const v = window.SSDNSApp.compute();
    document.querySelector("#tab-equip").click();
    const row = (window.SSDNS_RULES.melee || []).find((m) => m.id === "trail-staff-drover-s-staff-quarterstaff");
    const html = document.body.innerHTML;
    const names = [row && row.name].concat(html.match(/Trail staff \/ [a-z']+ staff/g) || []).map((x) => String(x).replace(/ \(quarterstaff\)$/, ""));
    return { name: c.name, feat: c.features, melee: c.melee && c.melee[0] && c.melee[0].weapon, names: [...new Set(names)],
      art: window.SSDNSWeaponArt && window.SSDNSWeaponArt.slugFor ? window.SSDNSWeaponArt.slugFor({ id: "trail-staff-drover-s-staff-quarterstaff", name: "Trail staff / cowhand's staff (quarterstaff)" }) : "n/a" };
  });
  check("law.loads", law.name === "Old Lawman" && law.melee === "trail-staff-drover-s-staff-quarterstaff", JSON.stringify(law));
  check("law.restlessDead", /Detect restless dead/.test(law.feat) && !/unquiet dead/.test(law.feat), law.feat);
  check("law.staffName", law.names.length && law.names.every((n) => n === "Trail staff / cowhand's staff"), JSON.stringify(law.names));
  check("law.staffArt", law.art === "n/a" || law.art === "trail-staff-drovers-staff-quarterstaff", law.art);
  const stk = await page.evaluate(() => {
    if (!window.SSDNSSheet || !window.SSDNSSheet.setStock) return null;
    /* The sheet keeps this list as its stock (renders once joined to a table); names are fixed on receipt. */
    const list = [{ id: "assay-scale", name: "Assay scale", price: 500, store: "general" }, { id: "circuit-kit", name: "Circuit kit", price: 100, store: "general" }];
    window.SSDNSSheet.setStock(list, false);
    return { ore: list[0].name === "Ore scale" && list[0].id === "assay-scale", kit: list[1].name === "Preacher's kit", old: false };
  });
  check("store.sheetOldStock", stk && stk.ore && stk.kit && !stk.old, JSON.stringify(stk));
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
