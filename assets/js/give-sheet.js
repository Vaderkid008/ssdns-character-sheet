/* Player Give, sheet side (0.3.86): the row Give button + picker, the receiver's Accept / Decline prompt, the
   ledger watchers and the once-only applies. Transport (Firebase) comes from SSDNSDmJoin.give; the rules of the
   move are in give.js (SSDNSGive). */
(function (root) {
  "use strict";
  var G = root.SSDNSGive;
  var watching = {};
  var prompts = {};
  var told = {};

  function T() { return root.SSDNSDmJoin && root.SSDNSDmJoin.give; }
  function me() { var t = T(); return t && t.me ? t.me() : ""; }
  function joined() { return !!me(); }
  function doc() { return root.SSDNSApp && root.SSDNSApp.doc ? root.SSDNSApp.doc() : null; }
  function char() { var d = doc(); return d && d.character; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]; }); }
  function repaint() {
    try { if (root.SSDNSItems && root.SSDNSItems.paintSheet) root.SSDNSItems.paintSheet(); } catch (e) {}
    try { if (root.SSDNSTrackers && root.SSDNSTrackers.paint) root.SSDNSTrackers.paint(); } catch (e) {}
    try { if (root.SSDNSPlaytest && root.SSDNSPlaytest.renderMelee) root.SSDNSPlaytest.renderMelee(); } catch (e) {}
    try { if (root.SSDNSDoll && root.SSDNSDoll.paint) root.SSDNSDoll.paint(); } catch (e) {}
  }
  function patch(fn) {
    var out;
    if (root.SSDNSApp && root.SSDNSApp.applyPatch) root.SSDNSApp.applyPatch(function (d) { if (d && d.character) out = fn(d.character, d); });
    repaint();
    var t = T();
    if (t && t.publish) t.publish();
    return out;
  }
  function notice(text) {
    if (root.SSDNSSheet && root.SSDNSSheet.showNotice) root.SSDNSSheet.showNotice(text);
  }
  function log(text, id) {
    if (root.SSDNSSheet && root.SSDNSSheet.addLog) root.SSDNSSheet.addLog({ id: id || "", kind: "item", text: text });
  }
  function esNow() { var t = T(); return t && t.es ? t.es() : 0; }
  function od(L) { return { kind: L.give, qty: L.qty, item: L.item, ammo: L.ammo, slot: L.slot }; }
  function ctxNow() {
    var E = root.SSDNSEquip;
    var locked = false;
    try { locked = !!(E && E.combatLocked && E.combatLocked()); } catch (e) {}
    return { es: esNow(), combatLocked: locked, lockTip: E && E.LOCK_TIP };
  }
  function baseRow(id, extra) {
    var c = char() || {};
    return Object.assign({ ts: new Date().toISOString(), from: me(), amount: 0, xferId: id, characterName: c.name || "", playerName: c.player || "" }, extra || {});
  }

  /* ---- giver ---- */
  function offer(spec) {
    var t = T();
    if (!t || !joined()) { notice("Join the DM's room to give things to the party."); return Promise.resolve({ ok: false }); }
    var c = char();
    /* the same offer again (a second tap on the same picker): one ID, so nothing new */
    if (spec.id && c && G.xfers(c)[spec.id]) return Promise.resolve({ ok: true, already: true, id: spec.id });
    var chk = G.canOffer(c, spec, ctxNow());
    if (!chk.ok) { notice(chk.reason); return Promise.resolve(chk); }
    spec.id = spec.id || G.newId();
    var row = G.requestRow(c, spec, { uid: me() });
    var o = { kind: spec.kind, qty: row.qty, item: row.item, ammo: row.ammo, slot: row.slot };
    var what = G.line(c.name, spec.toName, o);
    /* the hold first (so a double tap finds nothing left to give), then the one request row */
    patch(function (ch) {
      G.xfers(ch)[spec.id] = { id: spec.id, role: "from", state: "sending", ts: row.ts, kind: spec.kind, qty: row.qty, uid: spec.uid || "", ammo: row.ammo || null, slotKind: spec.kind === "slot" ? spec.slotKind : "", index: spec.kind === "slot" ? Number(spec.index) : null, weapon: spec.kind === "slot" ? (row.slot && row.slot.weapon) || "" : "", other: spec.to, otherName: spec.toName || "", what: what, label: G.describe(o), applied: {} };
    });
    return t.write(spec.id, row).then(function (res) {
      if (!res.ok && !res.exists) {
        patch(function (ch) { delete G.xfers(ch)[spec.id]; });
        notice("Couldn't send the offer. Try again.");
        return { ok: false };
      }
      watch(spec.id);
      log("Offered " + G.describe(o) + " to " + (spec.toName || "them") + ". It stays with you until they accept.", "xfer:" + spec.id + ":offer");
      return { ok: true, id: spec.id };
    });
  }
  function cancel(id) {
    var t = T();
    var c = char();
    var rec = c && G.xfers(c)[id];
    if (!t || !rec || G.terminal(rec.state)) return Promise.resolve({ ok: false });
    patch(function (ch) { var r = G.xfers(ch)[id]; if (r) r.cancelling = true; });
    return t.write(G.rowKey(id, "cancel", me()), baseRow(id, { targetId: rec.other || "", kind: "give_cancel" })).then(function (res) {
      notice(res.ok || res.exists ? "Cancelling the offer…" : "Couldn't cancel. Try again.");
      return res;
    });
  }

  /* ---- receiver ---- */
  function reply(id, answer) {
    var t = T();
    if (!t) return Promise.resolve({ ok: false });
    var c = char();
    var rec = c && G.xfers(c)[id];
    if (rec && rec.answered) return Promise.resolve({ ok: true, already: true });
    patch(function (ch) { var r = G.xfers(ch)[id]; if (r) r.answered = answer; });
    closePrompt(id);
    return t.write(G.rowKey(id, "reply", me()), baseRow(id, { targetId: (rec && rec.other) || "", kind: "give_reply", answer: answer === "accept" ? "accept" : "decline" }));
  }
  function onOffer(id) {
    if (!id) return;
    var c = char();
    if (c && !G.xfers(c)[id]) patch(function (ch) { G.xfers(ch)[id] = { id: id, role: "to", state: "offered", ts: new Date().toISOString(), applied: {} }; });
    watch(id);
  }
  function showPrompt(L) {
    if (prompts[L.id] || typeof document === "undefined") return;
    var dlg = document.createElement("dialog");
    dlg.className = "dlg give-prompt";
    dlg.setAttribute("data-give-prompt", L.id);
    var o = od(L);
    var w = G.weightOf(o);
    var notes = [];
    if (L.slot) {
      var ss = L.slot.state || {};
      var n = Number(ss.loaded) || 0;
      notes.push("It goes into your first free " + (L.slot.slotKind === "melee" ? "melee / bow" : "gun") + " slot (your inventory if every slot is full).");
      if (L.slot.slotKind !== "melee") notes.push(n ? "Loaded: " + n + " round" + (n === 1 ? "" : "s") + " come with it." : "Unloaded.");
      var bad = [ss.jammed && "jammed", ss.fouled && "fouled", ss.dirty && "Dirty", (ss.ruined || ss.broken) && "ruined", ss.cracked && "cracked"].filter(Boolean);
      if (bad.length) notes.push("Arrives " + bad.join(", ") + ".");
    }
    if (w != null) notes.push("Adds " + w + " lb to what you carry.");
    if (L.item && L.item.dirty) notes.push("Arrives Dirty.");
    if (L.item && L.item.attune) notes.push("Needs attunement: tap Attune, then take a short rest before using it.");
    dlg.innerHTML = '<form method="dialog"><h2>' + esc(L.fromName || "Someone") + " wants to give you</h2>" +
      '<p class="give-what"><b>' + esc(G.describe(o)) + "</b></p>" +
      (notes.length ? '<p class="fine">' + esc(notes.join(" ")) + "</p>" : "") +
      '<div class="dlg-foot"><button type="button" class="btn" data-give-decline="' + esc(L.id) + '">Decline</button> ' +
      '<button type="button" class="btn btn-primary" data-give-accept="' + esc(L.id) + '">Accept</button></div></form>';
    dlg.addEventListener("cancel", function (e) { e.preventDefault(); });
    document.body.appendChild(dlg);
    prompts[L.id] = dlg;
    try { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", ""); } catch (e) { dlg.setAttribute("open", ""); }
  }
  function closePrompt(id) {
    var dlg = prompts[id];
    if (!dlg) return;
    delete prompts[id];
    try { if (dlg.close) dlg.close(); } catch (e) {}
    if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
  }

  /* ---- both: one ledger row → the once-only steps ---- */
  function onLedger(id, L) {
    if (!L || !L.id) return;
    var t = T();
    var c = char();
    if (!c || !t) return;
    var mine = me();
    var rec = G.xfers(c)[id];
    if (!rec || rec.state !== L.state) {
      patch(function (ch) {
        var x = G.xfers(ch);
        var r = x[id] || (x[id] = { id: id, role: L.toPlayer === mine ? "to" : "from", ts: L.ts, applied: {} });
        r.state = L.state; r.kind = L.give; r.qty = L.qty; r.what = L.what;
        if (r.role === "from") {
          r.uid = r.uid || L.uid || ""; r.ammo = r.ammo || L.ammo || null; r.other = L.toPlayer; r.otherName = L.toName; r.label = G.describe(od(L));
          if (L.slot) { r.slotKind = L.slot.slotKind; r.index = Number(L.slot.index); r.weapon = L.slot.weapon; }
        }
        else { r.other = L.fromPlayer; r.otherName = L.fromName; }
      });
    }
    G.sheetPlan(char(), L, mine).forEach(function (act) {
      var res;
      if (act === "prompt") showPrompt(L);
      else if (act === "closePrompt") closePrompt(id);
      else if (act === "applyIn") {
        if (L.give === "es") {
          t.applyEs(Number(L.qty) || 0, "From " + (L.fromName || "a player"), "xfer:" + id + ":badd");
          patch(function (ch) { res = G.applyIn(ch, L, root.SSDNSItems); });
        } else res = patch(function (ch) { return G.applyIn(ch, L, root.SSDNSItems); });
        if (res && res.ok && !res.already) {
          log("Accepted " + G.describe(od(L)) + " from " + (L.fromName || "a player") + "." + (res.parked ? " Every slot was full, so it's in your inventory (tap To a slot when one is free)." : ""), "xfer:" + id + ":in");
          if (res.parked) notice("Every slot is full, so " + G.describe(od(L)) + " went to your inventory. Tap To a slot when one is free.");
          if (L.item && L.item.attune) notice(L.item.name + " needs attunement before you can use it (Attune, then a short rest).");
        }
        if (res && !res.ok) notice(res.reason || "Couldn't take it.");
      } else if (act === "ackIn") {
        t.write(G.rowKey(id, "badd", mine), baseRow(id, { targetId: L.fromPlayer || "", kind: "give_ack", leg: "badd" }));
      } else if (act === "rollbackIn") {
        res = patch(function (ch) { return G.rollbackIn(ch, L); });
        if (res && res.es) t.applyEs(res.es, "Give cancelled", "xfer:" + id + ":bundo");
        log("The give from " + (L.fromName || "a player") + " was cancelled, so it went back.", "xfer:" + id + ":undo");
      } else if (act === "applyOut") {
        if (L.give === "es") {
          t.applyEs(-(Number(L.qty) || 0), "To " + (L.toName || "a player"), "xfer:" + id + ":arem");
          patch(function (ch) { res = G.applyOut(ch, L); });
        } else res = patch(function (ch) { return G.applyOut(ch, L); });
        if (res && res.short) notice("You had " + res.short + " fewer than you offered; the DM can see it in the log.");
      } else if (act === "ackOut") {
        t.write(G.rowKey(id, "arem", mine), baseRow(id, { targetId: L.toPlayer || "", kind: "give_ack", leg: "arem", short: res && res.short ? res.short : 0 }));
      }
    });
    if (G.terminal(L.state) && !told[id]) {
      told[id] = 1;
      var mineFrom = L.fromPlayer === mine;
      if (L.state === "declined" && mineFrom) { log((L.toName || "They") + " declined " + G.describe(od(L)) + ". It stays with you.", "xfer:" + id + ":end"); }
      else if (L.state === "rejected") { log("Give stopped: " + (L.reason || "the DM's check failed") + ".", "xfer:" + id + ":end"); if (mineFrom) notice("Give stopped: " + (L.reason || "")); }
      else if (L.state === "cancelled") { log("Give cancelled" + (L.reason ? ": " + L.reason : "") + ".", "xfer:" + id + ":end"); }
    }
  }
  function watch(id) {
    var t = T();
    if (!t || watching[id]) return;
    watching[id] = 1;
    t.watch("ledger/" + id, function (row) { onLedger(id, row); });
  }
  /* after a join or a refresh: pick every open transfer back up */
  function resume() {
    watching = {};
    var c = char();
    if (!c || !joined()) return;
    var x = G.xfers(c);
    Object.keys(x).forEach(function (id) { if (x[id] && !G.terminal(x[id].state)) watch(id); });
  }

  /* ---- the row button, the bar and the picker ---- */
  function rowControls(item, c) {
    if (!item || !c) return "";
    return parkControl(item, c) + rowGive(item, c);
  }
  /* a weapon parked because every slot was full: back into a free slot with its rounds and state */
  function parkControl(item, c) {
    if (!item || !c) return "";
    return item.slotState && !G.heldItem(c, item.uid) ? ' <button type="button" class="btn xs" data-give-unpark="' + esc(item.uid) + '" title="Put it back in a free slot, rounds and all">To a slot</button>' : "";
  }
  function rowGive(item, c) {
    if (!joined()) return "";
    var h = G.heldItem(c, item.uid);
    if (h) {
      return ' <span class="item-tag give-held" data-give-held="' + esc(h.id) + '">' + (h.cancelling ? "Cancelling…" : "Offered to " + esc(h.otherName || "a player") + (Number(h.qty) > 1 ? " ×" + esc(h.qty) : "")) + "</span>" +
        (h.cancelling ? "" : ' <button type="button" class="btn xs ghost" data-give-cancel="' + esc(h.id) + '">Cancel</button>');
    }
    if (c.inventoryLocked || item.dmOnly) return "";
    if (item.soulBound || item.catalogId === "borrowed-iron") return ""; /* L0197: soul-bound, no Give */
    return ' <button type="button" class="btn xs" data-give-item="' + esc(item.uid) + '" title="Hand it to someone in the party">Give</button>';
  }
  function barHtml(c) {
    if (!joined() || !c) return "";
    var out = G.outgoing(c).filter(function (r) { return r.kind !== "item" && r.kind !== "slot"; });
    var rows = out.map(function (r) {
      return '<span class="item-tag give-held" data-give-held="' + esc(r.id) + '">' + esc(r.label || r.what || "") + " → " + esc(r.otherName || "") + (r.cancelling ? " · cancelling…" : "") + "</span>" +
        (r.cancelling ? "" : ' <button type="button" class="btn xs ghost" data-give-cancel="' + esc(r.id) + '">Cancel</button>');
    }).join(" ");
    return '<div class="give-bar" data-give-bar>' + (c.inventoryLocked ? '<span class="fine">Inventory locked: no gives.</span>' :
      '<button type="button" class="btn xs" data-give-pool>Give ammo or ES…</button>') + (rows ? " " + rows : "") + "</div>";
  }
  /* the gun / melee card's Give (trackers.js paint calls this per card) */
  function slotControls(card, ctx) {
    if (!card || !ctx) return;
    var c = ctx.character || char();
    var kind = ctx.card === "melee" ? "melee" : "gun";
    var i = Number(ctx.index);
    var h = c && G.heldSlot(c, kind, i);
    var html = slotGive(c, kind, i);
    var host = card.querySelector(".give-slot");
    if (!host && html) {
      host = card.ownerDocument.createElement("span");
      host.className = "give-slot";
      var at = kind === "melee" ? card.querySelector(".g-actions") : card.querySelector(".g-sub");
      (at || card).appendChild(host);
    }
    if (host && host.getAttribute("data-sig") !== html) { host.innerHTML = html; host.setAttribute("data-sig", html); host.hidden = !html; }
    /* while it's offered the card can't swap to another weapon */
    var sel = card.querySelector(kind === "melee" ? "select[data-melee]" : "select[data-gun]");
    if (sel) {
      if (h && !sel.disabled) { sel.disabled = true; sel.setAttribute("data-give-disabled", "1"); }
      else if (!h && sel.getAttribute("data-give-disabled")) { sel.disabled = false; sel.removeAttribute("data-give-disabled"); }
    }
  }
  /* the Give control for a weapon slot (gun / melee card, and the 0.3.95 Equipment list's Weapons rows) */
  function slotGive(c, kind, i) {
    var slot = c && G.slotAt(c, kind, i);
    var html = "";
    var h = c && G.heldSlot(c, kind, i);
    if (c && joined() && slot) {
      var item = G.backingItem(c, slot.weapon);
      var rec = G.weaponRec(slot.weapon);
      if (h) {
        html = '<span class="item-tag give-held" data-give-held="' + esc(h.id) + '">' + (h.cancelling ? "Cancelling…" : "Offered to " + esc(h.otherName || "a player")) + "</span>" +
          (h.cancelling ? "" : ' <button type="button" class="btn xs ghost" data-give-cancel="' + esc(h.id) + '">Cancel</button>');
      } else if (item) {
        html = G.heldItem(c, item.uid) || c.inventoryLocked || item.dmOnly || item.soulBound ? "" : '<button type="button" class="btn xs" data-give-item="' + esc(item.uid) + '" title="Hand it to someone in the party">Give</button>';
      } else if (!c.inventoryLocked && !(slot.dmOnly || (rec && rec.dmOnly) || (slot.record && slot.record.dmOnly))) {
        html = '<button type="button" class="btn xs" data-give-slot="' + kind + ":" + i + '" title="Hand this weapon to someone in the party. Loaded rounds, Dirty, jams and mods go with it.">Give</button>';
      }
    }
    return html;
  }
  function unpark(uid) {
    var res = patch(function (ch) { return G.unparkSlot(ch, uid); });
    if (res && res.ok) log(res.name + " is back in " + (res.kind === "melee" ? "melee" : "gun") + " slot " + (res.index + 1) + ".", "");
    else notice((res && res.reason) || "Couldn't move it.");
    return res;
  }
  function roster() {
    var t = T();
    var mine = me();
    return ((t && t.roster ? t.roster() : []) || []).filter(function (p) { return p && p.uid && p.uid !== mine; });
  }
  function choices(c) {
    var list = [];
    ((c && c.ammo) || []).forEach(function (p) {
      if (!p || !p.type) return;
      var spec = { kind: "ammo", ammo: { type: p.type, caliber: p.caliber || "" } };
      var n = G.available(c, spec);
      if (n > 0) list.push({ value: "ammo:" + p.type + "|" + (p.caliber || ""), label: G.ammoLabel(p) + " (" + n + ")", spec: spec, max: n });
    });
    var es = G.available(c, { kind: "es" }, { es: esNow() });
    if (es > 0) list.push({ value: "es", label: "ES (" + es + ")", spec: { kind: "es" }, max: es });
    return list;
  }
  function openPicker(opts) {
    if (typeof document === "undefined") return null;
    var c = char();
    if (!c) return null;
    var item = opts.uid ? G.xfers && (c.items || []).filter(function (it) { return it && it.uid === opts.uid; })[0] : null;
    if (item) {
      var pre = G.canOffer(c, { kind: "item", uid: item.uid, qty: 1 }, {});
      if (!pre.ok) { notice(pre.reason); return null; }
    }
    var slotSpec = null;
    if (opts.slot) {
      var sl = G.slotAt(c, opts.slot.kind, opts.slot.index);
      slotSpec = { kind: "slot", slotKind: opts.slot.kind, index: Number(opts.slot.index), weapon: sl ? sl.weapon : "", qty: 1 };
      var pre2 = G.canOffer(c, JSON.parse(JSON.stringify(slotSpec)), ctxNow());
      if (!pre2.ok) { notice(pre2.reason); return null; }
      var snap = G.snapshotSlot(c, slotSpec.slotKind, slotSpec.index);
      item = { uid: "", name: snap.name, slotSnap: snap };
    }
    var people = roster();
    var offerId = G.newId(); /* one ID per picker: every tap on its Give button is the same transfer */
    var what = item ? null : choices(c);
    var dlg = document.createElement("dialog");
    dlg.className = "dlg give-picker";
    dlg.setAttribute("data-give-picker", slotSpec ? "slot:" + slotSpec.slotKind + ":" + slotSpec.index : (item ? item.uid : "pool"));
    var max = slotSpec ? 1 : (item ? G.available(c, { kind: "item", uid: item.uid }) : (what[0] ? what[0].max : 0));
    var notes = [];
    if (slotSpec) {
      var st = item.slotSnap.state || {};
      var n = Number(st.loaded) || 0;
      notes.push("It leaves your " + (slotSpec.slotKind === "melee" ? "melee / bow" : "gun") + " slot.");
      if (slotSpec.slotKind !== "melee") notes.push(n ? "The " + n + " loaded round" + (n === 1 ? "" : "s") + " go with it." : "It's unloaded.");
      if (st.dirty || st.jammed || st.fouled) notes.push("It stays " + [st.dirty && "Dirty", st.jammed && "jammed", st.fouled && "fouled"].filter(Boolean).join(", ") + ".");
      notes.push("Firing or reloading it before they accept voids the offer.");
    } else if (item) {
      var w = Number(item.weight);
      if (isFinite(w) && w) notes.push(w + " lb each.");
      if (item.type === "weapon") notes.push("It leaves your weapon slot.");
      if (item.attune) notes.push("Attunement ends; they attune on a short rest.");
      if (item.dirty) notes.push("It stays Dirty.");
    }
    dlg.innerHTML = '<form method="dialog"><h2>Give ' + esc(item ? item.name : "ammo or ES") + "</h2>" +
      (people.length ? "" : '<p class="fine">Nobody else is in the room yet.</p>') +
      (!item ? '<label>What <select data-give-what>' + (what.length ? what.map(function (w2) { return '<option value="' + esc(w2.value) + '" data-max="' + w2.max + '">' + esc(w2.label) + "</option>"; }).join("") : '<option value="">Nothing to give</option>') + "</select></label>" : "") +
      '<label>To <select data-give-to>' + people.map(function (p) { return '<option value="' + esc(p.uid) + '">' + esc(p.name + (p.online ? "" : " · offline (the offer waits)")) + "</option>"; }).join("") + "</select></label>" +
      '<label data-give-qty-wrap' + (max > 1 ? "" : " hidden") + '>How many <input type="number" min="1" step="1" value="' + (max > 1 && !item ? Math.min(max, 20) : 1) + '" max="' + max + '" data-give-qty> <span class="fine" data-give-max>of ' + max + "</span></label>" +
      (notes.length ? '<p class="fine">' + esc(notes.join(" ")) + "</p>" : "") +
      '<p class="fine">They get an Accept / Decline prompt. It stays on your sheet until they accept.</p>' +
      '<div class="dlg-foot"><button type="button" class="btn" data-give-close>Cancel</button> <button type="button" class="btn btn-primary" data-give-send' + (people.length && (item || what.length) ? "" : " disabled") + ">Give</button></div></form>";
    document.body.appendChild(dlg);
    var whatSel = dlg.querySelector("[data-give-what]");
    if (whatSel) whatSel.addEventListener("change", function () {
      var opt = whatSel.selectedOptions[0];
      var m = opt ? Number(opt.getAttribute("data-max")) || 0 : 0;
      var q = dlg.querySelector("[data-give-qty]");
      q.max = m; if (Number(q.value) > m) q.value = m;
      dlg.querySelector("[data-give-max]").textContent = "of " + m;
      dlg.querySelector("[data-give-qty-wrap]").hidden = !(m > 1);
    });
    dlg.querySelector("[data-give-close]").addEventListener("click", function () { done(); });
    dlg.querySelector("[data-give-send]").addEventListener("click", function (e) {
      var btn = e.currentTarget;
      if (btn.disabled) return;
      btn.disabled = true;
      var toSel = dlg.querySelector("[data-give-to]");
      var to = toSel.value;
      var who = people.filter(function (p) { return p.uid === to; })[0] || {};
      var qty = Math.floor(Number(dlg.querySelector("[data-give-qty]").value) || 1);
      var spec;
      if (slotSpec) spec = JSON.parse(JSON.stringify(slotSpec));
      else if (item) spec = { kind: "item", uid: item.uid };
      else {
        var pick = what.filter(function (w3) { return w3.value === whatSel.value; })[0];
        spec = pick ? JSON.parse(JSON.stringify(pick.spec)) : { kind: "" };
      }
      spec.qty = qty; spec.to = to; spec.toName = who.name || ""; spec.id = offerId;
      offer(spec).then(function (r) { if (r && r.ok) done(); else btn.disabled = false; });
    });
    function done() { try { if (dlg.close) dlg.close(); } catch (err) {} if (dlg.parentNode) dlg.parentNode.removeChild(dlg); }
    try { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", ""); } catch (err) { dlg.setAttribute("open", ""); }
    return dlg;
  }
  function onClick(e) {
    var t = e.target && e.target.closest ? e.target.closest("[data-give-item],[data-give-slot],[data-give-unpark],[data-give-pool],[data-give-cancel],[data-give-accept],[data-give-decline]") : null;
    if (!t) return;
    if (t.hasAttribute("data-give-item")) openPicker({ uid: t.getAttribute("data-give-item") });
    else if (t.hasAttribute("data-give-slot")) { var ps = t.getAttribute("data-give-slot").split(":"); openPicker({ slot: { kind: ps[0], index: Number(ps[1]) } }); }
    else if (t.hasAttribute("data-give-unpark")) unpark(t.getAttribute("data-give-unpark"));
    else if (t.hasAttribute("data-give-pool")) openPicker({});
    else if (t.hasAttribute("data-give-cancel")) cancel(t.getAttribute("data-give-cancel"));
    else if (t.hasAttribute("data-give-accept") || t.hasAttribute("data-give-decline")) {
      if (t.disabled) return;
      t.disabled = true;
      reply(t.getAttribute("data-give-accept") || t.getAttribute("data-give-decline"), t.hasAttribute("data-give-accept") ? "accept" : "decline");
    }
  }
  if (typeof document !== "undefined") document.addEventListener("click", onClick);

  root.SSDNSGiveSheet = {
    offer: offer, cancel: cancel, reply: reply, onOffer: onOffer, onLedger: onLedger, watch: watch, resume: resume,
    rowControls: rowControls, rowGive: rowGive, parkControl: parkControl, slotGive: slotGive, slotControls: slotControls, unpark: unpark, barHtml: barHtml, openPicker: openPicker, roster: roster, joined: joined
  };
})(typeof window !== "undefined" ? window : globalThis);
