/* Player Give, DMCC side (DMCC 0.2.99): the post office (loot spec v1.1 §5.4, K3), the open-transfers list with
   Cancel, and the Give tab's read-only inventory panel for the Target player. Rules of the move: give.js. */
(function (root) {
  "use strict";
  var G = root.SSDNSGive;
  var closed = {};   /* transfer ids already terminal: skipped */
  var busy = {};     /* one pass per id at a time */
  var seenNew = {};
  var lastRows = {};
  var timer = null;

  function D() { return root.DMCC; }
  function st() { return D() && D().state; }
  function live() { var s = st(); return !!(s && !s.demo && s.db && s.roomCode && s._fb); }
  function ref(path) { return D().roomRef(path); }
  function esc(s) { return D() && D().esc ? D().esc(s) : String(s == null ? "" : s); }
  function toast(m) { if (D() && D().toast) D().toast(m); }

  function fresh(id) {
    return st()._fb.get(ref("ledger/" + id)).then(function (snap) { return snap && snap.val ? snap.val() : null; });
  }
  function run(acts, L) {
    var fb = st()._fb;
    var chain = Promise.resolve();
    acts.forEach(function (a) {
      chain = chain.then(function () {
        if (a.op === "create") {
          return fb.set(ref("ledger/" + a.id), a.row).then(function () {
            if (a.row.state === "rejected") toast("Give stopped: " + a.row.what + " (" + (a.row.reason || "") + ")");
            else if (a.row.state === "offered" && !seenNew[a.id]) { seenNew[a.id] = 1; toast("Offer: " + a.row.what); }
            if (G.terminal(a.row.state)) closed[a.id] = 1;
          });
        }
        if (a.op === "state") {
          return fb.update(ref("ledger/" + a.id), a.patch).then(function () { if (G.terminal(a.state)) closed[a.id] = 1; });
        }
        if (a.op === "announce") {
          var L2 = L || {};
          return D().pushCommand({ id: "xo_" + a.id, type: "give_offer", to: a.to, quiet: true, payload: { xferId: a.id, fromName: L2.fromName || "", what: L2.what || "" } })
            .then(function () { return fb.update(ref("ledger/" + a.id), { announced: true }); });
        }
        if (a.op === "chat") {
          var s = st();
          var row = { id: "xfer_" + a.id, ts: new Date().toISOString(), from: s.uid || "dm", fromName: a.fromName || "Table", text: a.text, kind: "give" };
          return fb.set(ref("chat/" + row.id), row).then(function () { toast(a.text); }, function () { /* already posted */ });
        }
      });
    });
    return chain;
  }
  function pass(r, rows) {
    var id = r.xferId;
    if (closed[id] || busy[id]) return Promise.resolve();
    busy[id] = 1;
    return fresh(id).then(function (L) {
      if (L && G.terminal(L.state)) { closed[id] = 1; return; }
      var acts = G.step(r, L, rows, st().players || {});
      var created = acts.filter(function (a) { return a.op === "create"; })[0];
      return run(acts, created ? created.row : L);
    }).catch(function (e) { console.warn("[Give] transfer " + id, e); }).then(function () {
      delete busy[id];
      paintPending();
    });
  }
  function onRequests(rows) {
    lastRows = rows || {};
    if (!live() || !G) return;
    var list = G.giveRequests(lastRows);
    list.forEach(function (r) { pass(r, lastRows); });
    if (!timer) timer = setInterval(function () { onRequests(lastRows); }, 15000); /* repair: resend / finish */
  }
  function cancel(id) {
    if (!live()) return Promise.resolve(false);
    return fresh(id).then(function (L) {
      if (!L || (L.state !== "offered" && L.state !== "accepted")) { toast(L ? "Too late to cancel: it already moved." : "No such transfer."); return false; }
      var now = new Date().toISOString();
      return st()._fb.update(ref("ledger/" + id), { state: "cancelled", newVal: "cancelled", reason: "Cancelled by the DM.", cancelledBy: "DM", updatedAt: now }).then(function () {
        closed[id] = 1;
        toast("Cancelled: " + (L.what || id));
        paintPending();
        return true;
      });
    });
  }

  /* ---- open transfers (from the ledger) ---- */
  function openRows() {
    var s = st();
    return ((s && s.ledger) || []).filter(function (e) { return e && e.type === "transfer" && !G.terminal(e.state); });
  }
  var LABEL = { offered: "waiting for them to accept", accepted: "accepted · landing on the receiver's sheet", added: "landed · leaving the giver's sheet" };
  function paintPending() {
    var box = typeof document !== "undefined" && document.getElementById("xferPending");
    if (!box) return;
    var rows = openRows();
    box.hidden = !rows.length;
    box.innerHTML = rows.length ? '<h3 class="fine">Player gives in progress</h3>' + rows.map(function (e) {
      var can = e.state === "offered" || e.state === "accepted";
      return '<div class="xfer-row" data-xfer="' + esc(e.id) + '"><span>' + esc(e.what || "") + '</span> <span class="badge">' + esc(LABEL[e.state] || e.state) + "</span>" +
        (can ? ' <button type="button" class="btn sm" data-xfer-cancel="' + esc(e.id) + '">Cancel</button>' : ' <span class="fine">(waits for ' + esc(e.fromName || "the giver") + " to come online)</span>") + "</div>";
    }).join("") : "";
  }

  /* ---- Give tab: the Target's inventory, read-only ---- */
  function lb(n) { var v = Number(n); return isFinite(v) ? (Math.round(v * 100) / 100) + " lb" : ""; }
  function invHtml(s) {
    var items = (s.items || []).filter(function (it) { return it && it.name; });
    var giving = {};
    (s.giving || []).forEach(function (g) { if (g && g.uid) giving[g.uid] = g; });
    var rows = items.map(function (it) {
      var n = it.count == null ? 1 : Number(it.count) || 0;
      var w = it.weight == null ? "" : lb((Number(it.weight) || 0) * n);
      var tags = [];
      if (it.equipSlot) tags.push("worn");
      if (it.attune) tags.push(it.attuned ? "attuned" : (it.attunePending ? "attuning" : "needs attunement"));
      if (it.dirty) tags.push("Dirty");
      if (it.dmOnly) tags.push("DM-only");
      if (it.chargesLeft != null && it.uses && it.uses.max != null) tags.push(it.chargesLeft + "/" + it.uses.max + " uses");
      if (giving[it.uid]) tags.push("offered to " + giving[it.uid].to);
      return "<tr><td>" + esc(it.name) + (n > 1 ? " ×" + n : "") + (tags.length ? ' <span class="fine">' + esc(tags.join(" · ")) + "</span>" : "") + '</td><td class="num">' + esc(w) + "</td></tr>";
    }).join("");
    /* Give tab fix 11 (0.2.121): the Ammo pools as their own table, with the guns each one fits */
    var GT = root.SSDNSGiveTab && root.SSDNSGiveTab.pure;
    var ammo = (s.ammo || []).filter(function (a) { return a && a.type && Number(a.count) > 0; }).map(function (a) {
      var o = GT ? GT.ammoCatalog().filter(function (x) { return GT.samePool(a, x); })[0] : null;
      var fits = o ? (s.guns || []).filter(function (g) { return g && g.name && GT.gunKeys(g).indexOf(o.key) >= 0; }).map(function (g) { return g.name; }) : [];
      return '<tr data-ammo-pool="' + esc(a.type + "|" + (a.caliber || "")) + '"><td>' + esc(o ? o.label : G.ammoLabel(a)) + (fits.length ? ' <span class="fine">· fits ' + esc(fits.join(", ")) + "</span>" : "") + '</td><td class="num">' + esc(a.count) + "</td></tr>";
    }).join("");
    var carry = s.carry || null;
    var slotGive = {};
    (s.giving || []).forEach(function (g) { if (g && g.kind === "slot" && g.slotKind) slotGive[g.slotKind + ":" + g.index] = g; });
    var offered = function (k, i) { var g = slotGive[k + ":" + i]; return g ? " (offered to " + esc(g.to) + ")" : ""; };
    var guns = (s.guns || []).map(function (g) {
      if (!g || !g.name) return "";
      var bits = [];
      if (g.loaded) bits.push(g.loaded + " loaded");
      if (g.jammed) bits.push("jammed");
      if (g.dirty) bits.push("Dirty");
      return esc(g.name) + (bits.length ? " (" + esc(bits.join(", ")) + ")" : "") + offered("gun", g.index);
    }).filter(Boolean).join(", ");
    var melee = (s.melee || []).map(function (m) { return m && m.name ? esc(m.name) + offered("melee", m.index) : ""; }).filter(Boolean).join(", ");
    return '<p class="rew-inv-sum"><b>' + esc(Number(s.es) || 0) + " ES</b>" +
      (carry ? " · carried " + esc(lb(carry.carried)) + " / " + esc(lb(carry.capacity)) + (carry.over ? ' <span class="badge warn">over</span>' : "") + (carry.on ? "" : ' <span class="fine">(weight rule off)</span>') : "") +
      (s.inventoryLocked ? ' · <span class="badge warn">locked</span>' : "") + "</p>" +
      (items.length ? '<table class="rew-inv-items"><tbody>' + rows + "</tbody></table>" : '<p class="fine">No items.</p>') +
      '<p class="fine rew-inv-h">Ammo pools</p>' + (ammo ? '<table class="rew-inv-items rew-inv-ammo"><tbody>' + ammo + "</tbody></table>" : '<p class="fine">No ammo.</p>') +
      (guns || melee ? '<p class="fine">Weapons: ' + [guns, melee].filter(Boolean).join(" · ") + "</p>" : "");
  }
  function paintInv() {
    if (typeof document === "undefined") return;
    var panel = document.getElementById("rewInvPanel");
    var sel = document.getElementById("rewTarget");
    if (!panel || !sel) return;
    var s = st();
    var p = s && s.players && s.players[sel.value];
    var snap = p && p.snapshot;
    if (!snap) { panel.hidden = true; return; }
    panel.hidden = false;
    var head = document.getElementById("rewInvHead");
    var carry = snap.carry;
    if (head) head.textContent = "Inventory: " + (snap.name || sel.value) + (carry ? " · " + lb(carry.carried) + " / " + lb(carry.capacity) : "") + " · " + (Number(snap.es) || 0) + " ES";
    var body = document.getElementById("rewInvBody");
    if (body) body.innerHTML = invHtml(snap);
  }

  function wire() {
    if (typeof document === "undefined") return;
    document.addEventListener("click", function (e) {
      var t = e.target && e.target.closest ? e.target.closest("[data-xfer-cancel]") : null;
      if (t) { t.disabled = true; cancel(t.getAttribute("data-xfer-cancel")); }
    });
    document.addEventListener("change", function (e) { if (e.target && e.target.id === "rewTarget") paintInv(); });
  }
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire); else wire();
  }
  root.SSDNSGiveDM = { onRequests: onRequests, cancel: cancel, paintPending: paintPending, paintInv: paintInv, invHtml: invHtml, openRows: openRows, _closed: closed };
})(typeof window !== "undefined" ? window : globalThis);
