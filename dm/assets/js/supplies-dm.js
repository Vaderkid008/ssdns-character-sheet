/**
 * L0188 food & water: the DMCC Supplies panel (Table tab, "Food & water").
 * Mode Off / Loose (DM hands out exhaustion) / Strict (each sheet tracks it).
 * A day ends with the "End of day" button, on the party long rest, or both (DM picks).
 * The DM owns the counts: every change is a "supplies" command to the player's sheet.
 * Exhaustion uses the existing Exhaustion condition (writeSubjectConditions), never a copy.
 */
const DM = window.DMCC;
const S = window.SSDNSSupplies;

const KEY = "ssdns.dm.supplies";
const cfg = load();
const demoChars = {}; /* demo only: a pretend sheet per player so the panel works without Firebase */

function load() {
  let raw = {};
  try { raw = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { raw = {}; }
  return {
    mode: { off: 1, loose: 1, strict: 1 }[raw.mode] ? raw.mode : "off",
    dayEnd: { button: 1, rest: 1, both: 1 }[raw.dayEnd] ? raw.dayEnd : "button",
    hot: !!raw.hot,
    day: Number(raw.day) || 0,
    half: raw.half && typeof raw.half === "object" ? raw.half : {},
    summary: raw.summary && typeof raw.summary === "object" ? raw.summary : null
  };
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} }
function esc(t) { return DM && DM.esc ? DM.esc(t) : String(t == null ? "" : t); }
function players() {
  const all = (DM && DM.state && DM.state.players) || {};
  return Object.keys(all).map((id) => ({ id: id, p: all[id], snap: (all[id] && all[id].snapshot) || {} })).filter((r) => r.snap && r.snap.name);
}
function nameOf(r) { return r.snap.name || r.id; }
function exhOf(r) {
  const Cond = window.SSDNSConditions;
  if (!Cond) return 0;
  return Math.max(Number(r.snap.exhaustion) || 0, Cond.exhaustionLevel(r.snap.activeConditions || []));
}
function viewOf(r) {
  if (DM.state.demo) return S.view(demoChar(r));
  const v = r.snap.supplies;
  return v || { mode: "off", rations: 0, water: 0, daysHungry: 0, last: null };
}
function demoChar(r) {
  if (!demoChars[r.id]) {
    const v = r.snap.supplies || {};
    const c = { items: [], supplies: { mode: cfg.mode, water: Number(v.water) || 0, daysHungry: Number(v.daysHungry) || 0 } };
    if (Number(v.rations) > 0) S.giveRations(c, Number(v.rations));
    demoChars[r.id] = c;
  }
  return demoChars[r.id];
}

async function send(pid, payload) {
  payload = Object.assign({ mode: cfg.mode }, payload);
  await DM.pushCommand({ type: "supplies", to: pid, payload: payload, from: DM.state.uid, quiet: true });
  if (DM.state.demo) applyDemo(pid, payload);
}
function applyDemo(pid, payload) {
  const r = players().filter((x) => x.id === pid)[0];
  if (!r) return;
  const c = demoChar(r);
  S.ensure(c).mode = cfg.mode;
  if (payload.op === "tick" && payload.adjust) {
    if (Number(payload.adjust.rations)) S.giveRations(c, Number(payload.adjust.rations));
    if (Number(payload.adjust.water)) S.giveWater(c, Number(payload.adjust.water));
  }
  if (payload.op === "give") {
    if (payload.rations) S.giveRations(c, Number(payload.rations));
    if (payload.water) S.giveWater(c, Number(payload.water));
  } else if (payload.op === "set_hungry") {
    S.ensure(c).daysHungry = Math.max(0, Number(payload.days) || 0);
  } else if (payload.op === "tick") {
    const lv = exhOf(r);
    const out = S.tick(c, { hot: payload.hot, half: payload.half, conMod: (r.snap.mods && r.snap.mods.CON) || 0, exhaustion: lv, longRest: payload.longRest });
    let gain = out.gain;
    if (out.save) {
      const mod = (r.snap.saves && r.snap.saves.CON != null) ? Number(r.snap.saves.CON) : Number((r.snap.mods && r.snap.mods.CON) || 0);
      const nat = 1 + Math.floor(Math.random() * 20);
      const res = S.resolveSave(nat, mod, out.save);
      c.supplies.last.save = (res.pass ? "passed " : "failed ") + res.total;
      if (!res.pass) { gain += res.gain; c.supplies.last.gain = gain; }
    }
    if (cfg.mode === "strict") {
      const next = S.nextLevel(lv, gain, out.restDrop);
      if (next !== lv) setExhaustion(r, next);
    }
  }
  r.snap.supplies = S.view(c);
}

async function setExhaustion(r, level) {
  const E = window.DMCCEnhance;
  const Cond = window.SSDNSConditions;
  if (!E || !E.writeSubjectConditions || !Cond) { DM.toast("Conditions aren't ready yet."); return; }
  level = Math.max(0, Math.min(6, Number(level) || 0));
  if (level > 0) {
    await E.writeSubjectConditions(r.id, "player", [{ name: "Exhaustion", level: level }], nameOf(r), level, {}, []);
  } else {
    const have = (r.snap.activeConditions || []).filter((row) => row && /^exhaustion/i.test(row.name || ""))[0];
    const id = (have && have.id) || Cond.idFor(r.id, "Exhaustion");
    await E.writeSubjectConditions(r.id, "player", [], nameOf(r), 1, {}, [id]);
  }
  paint();
}

async function endDay(opts) {
  opts = opts || {};
  if (cfg.mode === "off") { DM.toast("Food & water is off."); return; }
  const list = players();
  cfg.day += 1;
  /* party sharing: leftovers from players who share cover anyone short; non-sharers keep theirs */
  const plan = S.planShare(list.map((r) => {
    const v = viewOf(r);
    return { id: r.id, name: nameOf(r), rations: Number(v.rations) || 0, water: Number(v.water) || 0, share: v.share !== false, half: !!cfg.half[r.id] };
  }), { hot: cfg.hot });
  const notSharing = plan.notSharing.map((id) => nameOf(list.filter((r) => r.id === id)[0] || { id: id, snap: {} }));
  const shared = plan.moves.map(S.moveText);
  cfg.summary = { day: cfg.day, notSharing: notSharing, shared: shared };
  save();
  for (const r of list) {
    const adj = plan.adjust[r.id] || { rations: 0, water: 0 };
    const mine = plan.moves.filter((m) => m.from === r.id || m.to === r.id).map(S.moveText);
    await send(r.id, { op: "tick", hot: cfg.hot, half: !!cfg.half[r.id], longRest: !!opts.longRest, adjust: (adj.rations || adj.water) ? adj : null, shared: mine });
  }
  await DM.pushLedger({
    who: "DM", playerId: "all", playerName: "Party", characterName: "Everyone", type: "supplies",
    what: "Day " + cfg.day + " ends" + (opts.longRest ? " (long rest)" : "") + (cfg.hot ? " · hot day, 2 gal water each" : "") +
      " · food & water " + cfg.mode + (shared.length ? " · " + shared.join("; ") : "") +
      " · not sharing: " + (notSharing.length ? notSharing.join(", ") : "nobody"), oldVal: null, newVal: cfg.day, flag: false
  });
  DM.toast("Day " + cfg.day + " ends: food and water used" + (cfg.mode === "strict" ? "; sheets track exhaustion" : "") +
    (notSharing.length ? ". Not sharing: " + notSharing.join(", ") : ". Everyone shares"));
  paint();
}
async function skipDay() {
  cfg.day += 1;
  save();
  await DM.pushLedger({ who: "DM", playerId: "all", playerName: "Party", characterName: "Everyone", type: "supplies", what: "Day " + cfg.day + " skipped (no food or water used)", oldVal: null, newVal: cfg.day, flag: false });
  DM.toast("Day " + cfg.day + " skipped. Nobody ate or drank from their counts.");
  paint();
}
async function give(ids, rations, water) {
  rations = Number(rations) || 0;
  water = Number(water) || 0;
  if (!rations && !water) return;
  for (const id of ids) await send(id, { op: "give", rations: rations, water: water });
  const names = ids.length > 1 ? "the party" : (players().filter((r) => r.id === ids[0]).map(nameOf)[0] || "a player");
  const bits = [];
  if (rations) bits.push((rations > 0 ? "+" : "") + rations + " rations");
  if (water) bits.push((water > 0 ? "+" : "") + water + " gal water");
  await DM.pushLedger({ who: "DM", playerId: ids.length > 1 ? "all" : ids[0], type: "supplies", what: "Supplies " + bits.join(", ") + " → " + names, oldVal: null, newVal: bits.join(", "), flag: false });
  paint();
}
function survivalOf(r) {
  const sk = (r && r.snap && r.snap.skills) || {};
  if (sk.Survival != null) return Number(sk.Survival) || 0;
  if (sk.survival != null) return Number(sk.survival) || 0;
  return 0;
}
/** ASSUMED: a successful forage or hunt grants 1 ration. The DM sets the DC. */
async function forage(id, dc, mod) {
  if (cfg.mode === "off") { DM.toast("Food & water is off."); return; }
  if (!id) { DM.toast("Pick a player to forage."); return; }
  dc = Number(dc);
  if (!isFinite(dc)) dc = 15;
  mod = Number(mod) || 0;
  const nat = 1 + Math.floor(Math.random() * 20);
  const total = nat + mod;
  const pass = total >= dc;
  const who = players().filter((r) => r.id === id).map(nameOf)[0] || "A player";
  if (pass) await give([id], 1, 0);
  const line = who + " forages: d20 " + nat + (mod >= 0 ? "+" : "") + mod + " = " + total + " vs DC " + dc + (pass ? ". Success: +1 ration (assumed yield)." : ". The wilds give nothing.");
  await DM.pushLedger({ who: "DM", playerId: id, type: "supplies", what: line, oldVal: null, newVal: pass ? "+1 ration" : "miss", flag: false });
  DM.toast(line);
  const out = document.getElementById("supForageOut");
  if (out) out.textContent = line;
}
async function setMode(mode) {
  cfg.mode = mode;
  save();
  for (const r of players()) await send(r.id, { op: "mode" });
  paint();
}

function paint() {
  const box = document.getElementById("suppliesPanel");
  if (!box || !S) return;
  if (box.contains(document.activeElement) && document.activeElement.tagName === "INPUT" && document.activeElement.type === "number") return;
  const list = players();
  const modeBtn = (m, label, tip) => '<label class="sup-mode' + (cfg.mode === m ? " on" : "") + '" title="' + esc(tip) + '"><input type="radio" name="supMode" value="' + m + '"' + (cfg.mode === m ? " checked" : "") + "> " + label + "</label>";
  const rows = list.map((r) => {
    const v = viewOf(r);
    const lv = exhOf(r);
    const con = Number((r.snap.mods && r.snap.mods.CON) || 0);
    const limit = S.foodLimit(con);
    const last = v.last;
    let lastTxt = "";
    if (last) {
      lastTxt = (last.food === "full" ? "ate" : last.food === "half" ? "half" : "no food") + ", " + last.drank + "/" + last.need + " gal" +
        (last.save ? ", save " + last.save : "") + (last.gain ? ", +" + last.gain + " exh" : "") + (last.restDrop ? ", rest -1" : "");
    }
    const loose = cfg.mode === "loose" && last && last.gain ? '<button type="button" class="btn sm sup-apply" data-sup-apply="' + esc(r.id) + '" data-n="' + last.gain + '" title="5e says this player takes ' + last.gain + ' exhaustion. Apply it?">Apply +' + last.gain + "</button>" : "";
    const sel = '<select data-sup-exh="' + esc(r.id) + '" aria-label="Exhaustion for ' + esc(nameOf(r)) + '">' +
      [0, 1, 2, 3, 4, 5, 6].map((n) => '<option value="' + n + '"' + (n === lv ? " selected" : "") + ">" + (n ? n : "none") + "</option>").join("") + "</select>";
    return '<tr data-sup-row="' + esc(r.id) + '">' +
      "<th>" + esc(nameOf(r)) + "</th>" +
      '<td class="num">' + esc(v.rations) + ' <span class="sup-btns"><button type="button" class="btn xs" data-sup-give="' + esc(r.id) + '" data-r="1">+</button><button type="button" class="btn xs" data-sup-give="' + esc(r.id) + '" data-r="-1">−</button></span></td>' +
      '<td class="num">' + esc(v.water) + ' gal <span class="sup-btns"><button type="button" class="btn xs" data-sup-give="' + esc(r.id) + '" data-w="1">+</button><button type="button" class="btn xs" data-sup-give="' + esc(r.id) + '" data-w="-1">−</button></span></td>' +
      '<td class="num' + (Number(v.daysHungry) > limit ? " bad" : "") + '">' + esc(v.daysHungry) + " / " + limit + "</td>" +
      '<td class="sup-shares">' + (v.share === false ? '<span class="sup-noshare" title="This player keeps their leftovers. Others who share can still cover them.">No</span>' : "Yes") + "</td>" +
      '<td><label class="toggle"><input type="checkbox" data-sup-half="' + esc(r.id) + '"' + (cfg.half[r.id] ? " checked" : "") + "> half</label></td>" +
      "<td>" + sel + " " + loose + "</td>" +
      '<td class="fine">' + esc(lastTxt) + (v.pendingSave ? " · Con save waiting" : "") + "</td>" +
      "</tr>";
  }).join("");
  box.innerHTML =
    '<p class="lede">5e food and water. Each day: 1 ration and 1 gal of water each (2 gal on a hot day). Food: safe for 3 + Con mod days, then +1 exhaustion a day. Water: half the need is a DC 15 Con save, less is +1 (or +2 if already exhausted).</p>' +
    '<div class="sup-modes" role="radiogroup" aria-label="Food and water mode">' +
    modeBtn("off", "Off", "Nothing is counted or shown.") +
    modeBtn("loose", "Loose", "Counts food and water; you hand out exhaustion yourself.") +
    modeBtn("strict", "Strict", "Each sheet adds exhaustion and asks for the Con save.") +
    "</div>" +
    '<div class="sup-bar">' +
    '<label>Day ends on <select id="supDayEnd"><option value="button"' + (cfg.dayEnd === "button" ? " selected" : "") + ">End of day button</option><option value=\"rest\"" + (cfg.dayEnd === "rest" ? " selected" : "") + ">Long rest (party)</option><option value=\"both\"" + (cfg.dayEnd === "both" ? " selected" : "") + ">Both</option></select></label>" +
    '<label class="toggle"><input type="checkbox" id="supHot"' + (cfg.hot ? " checked" : "") + "> Hot day (2 gal)</label>" +
    '<span class="sup-day">Day <b id="supDay">' + cfg.day + "</b></span>" +
    '<button type="button" class="btn btn-primary" id="btnSupEndDay"' + (cfg.dayEnd === "rest" || cfg.mode === "off" ? " disabled" : "") + ">End of day</button>" +
    '<button type="button" class="btn sm" id="btnSupSkip" title="A day passes but nobody eats or drinks from their counts (town, inn, a feast).">Skip a day</button>' +
    "</div>" +
    '<div class="sup-bar">' +
    '<span>Whole party:</span>' +
    '<label>Rations <input type="number" id="supPartyR" step="1" value="1" style="width:4.5em"></label>' +
    '<label>Water (gal) <input type="number" id="supPartyW" step="0.5" value="1" style="width:4.5em"></label>' +
    '<button type="button" class="btn sm" id="btnSupGiveParty">Give</button>' +
    '<button type="button" class="btn sm" id="btnSupTakeParty">Take</button>' +
    '<label class="toggle"><input type="checkbox" id="supHalfParty"' + (list.length && list.every((r) => cfg.half[r.id]) ? " checked" : "") + "> Half rations (all)</label>" +
    '<button type="button" class="btn sm" id="btnSupClearExh" title="Clear exhaustion for everyone.">Clear exhaustion (all)</button>' +
    "</div>" +
    '<div class="sup-bar">' +
    "<span>Forage / hunt</span>" +
    '<label>Player <select id="supForageWho">' + (list.length ? list.map((r) => '<option value="' + esc(r.id) + '">' + esc(nameOf(r)) + "</option>").join("") : '<option value="">No players</option>') + "</select></label>" +
    '<label>DC <input type="number" id="supForageDc" value="15" style="width:4.5em"></label>' +
    '<label>Survival <input type="number" id="supForageMod" value="' + (list.length ? survivalOf(list[0]) : 0) + '" style="width:4.5em" title="d20 + this bonus. Filled from the player\'s Survival skill when you pick them."></label>' +
    '<button type="button" class="btn sm" id="btnSupForage"' + (cfg.mode === "off" || !list.length ? " disabled" : "") + ">Roll</button>" +
    '<span class="fine" id="supForageOut">ASSUMED: a success grants 1 ration. No spoilage. Horse feed is not in this pass.</span>' +
    "</div>" +
    (cfg.summary ? '<p class="sup-summary" id="supSummary"><b>Day ' + esc(cfg.summary.day) + ":</b> " +
      esc(cfg.summary.shared && cfg.summary.shared.length ? cfg.summary.shared.join("; ") + ". " : "No one needed covering. ") +
      "Not sharing: " + esc(cfg.summary.notSharing && cfg.summary.notSharing.length ? cfg.summary.notSharing.join(", ") : "nobody") + ".</p>" : "") +
    (list.length ? '<table class="sup-table"><thead><tr><th>Player</th><th>Rations</th><th>Water</th><th title="Days without food / safe days (3 + Con mod)">Hungry</th><th title="Set by the player on their sheet">Shares</th><th>Half</th><th>Exhaustion</th><th>Last day</th></tr></thead><tbody>' + rows + "</tbody></table>" : '<p class="fine">No players at the table yet.</p>') +
    '<p class="fine">Rations are the meals in every item tagged food (Hardtack and Jerky, packs, DM-made food). Water is every item tagged water: canteens and waterskins, drink items, and loose gallons (8 lb a gallon, counted in carried weight). Give fills canteens first. Players see these counts but can\'t change them; each player picks "Share with party" on their sheet (on unless they turn it off).</p>';
}

function wire() {
  const box = document.getElementById("suppliesPanel");
  if (!box || box._wired) return;
  box._wired = true;
  box.addEventListener("change", (e) => {
    const t = e.target;
    if (t.name === "supMode") setMode(t.value);
    else if (t.id === "supDayEnd") { cfg.dayEnd = t.value; save(); paint(); }
    else if (t.id === "supHot") { cfg.hot = t.checked; save(); }
    else if (t.id === "supHalfParty") { players().forEach((r) => { cfg.half[r.id] = t.checked; }); save(); paint(); }
    else if (t.id === "supForageWho") {
      const r = players().filter((x) => x.id === t.value)[0];
      const mod = document.getElementById("supForageMod");
      if (r && mod) mod.value = String(survivalOf(r));
    }
    else if (t.hasAttribute("data-sup-half")) { cfg.half[t.getAttribute("data-sup-half")] = t.checked; save(); }
    else if (t.hasAttribute("data-sup-exh")) {
      const r = players().filter((x) => x.id === t.getAttribute("data-sup-exh"))[0];
      if (r) setExhaustion(r, Number(t.value));
    }
  });
  box.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.id === "btnSupForage") {
      forage(document.getElementById("supForageWho").value, document.getElementById("supForageDc").value, document.getElementById("supForageMod").value);
    } else if (b.id === "btnSupEndDay") endDay({});
    else if (b.id === "btnSupSkip") skipDay();
    else if (b.id === "btnSupGiveParty" || b.id === "btnSupTakeParty") {
      const sign = b.id === "btnSupTakeParty" ? -1 : 1;
      give(players().map((r) => r.id), sign * (Number(document.getElementById("supPartyR").value) || 0), sign * (Number(document.getElementById("supPartyW").value) || 0));
    } else if (b.id === "btnSupClearExh") {
      (async () => { for (const r of players()) if (exhOf(r)) await setExhaustion(r, 0); paint(); })();
    } else if (b.hasAttribute("data-sup-give")) {
      give([b.getAttribute("data-sup-give")], Number(b.getAttribute("data-r")) || 0, Number(b.getAttribute("data-w")) || 0);
    } else if (b.hasAttribute("data-sup-apply")) {
      const r = players().filter((x) => x.id === b.getAttribute("data-sup-apply"))[0];
      if (r) setExhaustion(r, Math.min(6, exhOf(r) + (Number(b.getAttribute("data-n")) || 1)));
    }
  });
}

async function onLongRest() {
  if (cfg.mode === "off") return;
  if (cfg.dayEnd === "rest" || cfg.dayEnd === "both") await endDay({ longRest: true });
}

function boot() {
  wire();
  paint();
  setInterval(() => {
    const fold = document.getElementById("suppliesFold");
    if (fold && fold.open) paint();
  }, 2000);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();

window.SSDNSSuppliesDm = { paint: paint, endDay: endDay, skipDay: skipDay, give: give, forage: forage, setMode: setMode, setExhaustion: setExhaustion, onLongRest: onLongRest, config: () => JSON.parse(JSON.stringify(cfg)), _demo: demoChars };
