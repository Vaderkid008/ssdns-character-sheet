/* Map chat away from the dock.
   Pop out is a floating panel on the map. Open in new tab keeps the
   separate window. A phone narrower than 600px uses a full-screen overlay.
   The opener stays the only room connection. */
(function (root) {
  "use strict";
  var TYPE = "ssdns-map-chat";
  var FILTER_KEY = "ssdns.map.chatFilter";
  var GEOM_KEY = "ssdns.map.chatFloat";
  var PHONE = "(max-width: 599px)";
  var instances = [];
  var lastDock = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function origin() {
    try { return root.location.origin; } catch (e) { return ""; }
  }
  function keyOf(item) {
    var id = String(item && item.id || "").replace(/^(chat:|feed:|roll:)/, "");
    if (id) return id;
    return "anon:" + (item && item.kind || "") + "|" + (item && item.ts || "") + "|" + (item && item.text || "");
  }
  function score(item) {
    var n = 0;
    if (!item) return n;
    if (item.tag) n += 2;
    if (item.cls) n += 1;
    if (item.kind === "roll" || item.kind === "rolls") n += 1;
    return n;
  }
  function merge(lists) {
    var order = [];
    var by = {};
    (lists || []).forEach(function (list) {
      (list || []).forEach(function (item) {
        if (!item) return;
        var k = keyOf(item);
        if (!by[k]) {
          order.push(k);
          by[k] = Object.assign({}, item, { id: item.id || k });
          return;
        }
        var prev = by[k];
        var next = score(item) >= score(prev) ? Object.assign({}, prev, item) : Object.assign({}, item, prev);
        next.id = (score(item) >= score(prev) ? item.id : prev.id) || k;
        by[k] = next;
      });
    });
    var rows = order.map(function (k) { return by[k]; });
    rows.sort(function (a, b) { return String(a.ts || "").localeCompare(String(b.ts || "")); });
    return rows.slice(-100);
  }
  function body(item) {
    var text = String(item.text || "");
    /* 0.3.80: single-die rows read "1d4 = 4" in the popped-out chat too */
    if ((item.kind === "roll" || item.kind === "rolls") && root.SSDNSDice && root.SSDNSDice.tidySingle) text = root.SSDNSDice.tidySingle(text);
    var who = String(item.who || "");
    if (!who || item.kind === "roll" || item.kind === "rolls") return text;
    if (text.indexOf(who) === 0) return text;
    return who + ": " + text;
  }
  function bucket(item) {
    if (!item || item.kind === "sfx") return "";
    if (item.kind === "roll" || item.kind === "rolls" || item.attack) return "rolls";
    var text = String(item.text || "");
    if (/\bd20\b/.test(text) || /→\s*(HIT|MISS|CRIT)/.test(text)) return "rolls";
    return "talk";
  }
  function readFilter() {
    try {
      var saved = root.localStorage.getItem(FILTER_KEY);
      if (saved === "rolls" || saved === "talk" || saved === "all") return saved;
    } catch (e) {}
    return "all";
  }
  function writeFilter(next) {
    try { root.localStorage.setItem(FILTER_KEY, next); } catch (e) {}
  }
  function visible(items, mode) {
    return (items || []).filter(function (item) {
      var kind = bucket(item);
      if (!kind) return false;
      if (mode === "rolls") return kind === "rolls";
      if (mode === "talk") return kind === "talk";
      return true;
    });
  }
  function clsOf(item) {
    return (("dock-item " + (item.cls || "") + " " + (item.kind ? "dock-" + item.kind : ""))).split(/\s+/).filter(function (c) {
      return /^[a-z0-9_-]+$/i.test(c);
    }).join(" ");
  }
  function nameHtml(name, item) {
    var Applied = root.SSDNSApplied;
    var raw = name || "Table";
    if (Applied && Applied.chosenName && item && !Applied.neutralSpeaker(raw)) {
      var picked = Applied.chosenName(item);
      if (picked) raw = picked;
    }
    if (!Applied || !Applied.tokenColorFor || !Applied.whoHtml) return esc(raw);
    return Applied.whoHtml(raw);
  }
  function textHtml(item) {
    var text = body(item);
    var Applied = root.SSDNSApplied;
    if (Applied && Applied.rewriteSpeaker) text = Applied.rewriteSpeaker(text, item || {});
    var html = Applied && Applied.leadNameHtml ? Applied.leadNameHtml(text) : esc(text);
    if (root.SSDNSDice && root.SSDNSDice.lead) return root.SSDNSDice.lead(item, html);
    if (root.SSDNSDice && root.SSDNSDice.decorate) return root.SSDNSDice.decorate(html);
    return html;
  }
  function render(feed, items, mode) {
    if (!feed) return;
    var filter = mode || readFilter();
    var rows = visible(items || [], filter);
    feed.innerHTML = rows.map(function (item) {
      var tag = item.tag ? ' · <span class="roll-tag">' + esc(item.tag) + "</span>" : "";
      return '<div class="' + clsOf(item) + '" data-id="' + esc(keyOf(item)) + '"><div class="dock-meta">' +
        nameHtml(item.who || "Table", item) + tag + '</div><div class="dock-text">' + textHtml(item) + "</div></div>";
    }).join("") || '<p class="fine">No messages yet.</p>';
    var host = feed.parentNode;
    if (host && host.querySelectorAll) {
      var buttons = host.querySelectorAll("[data-chat-filter]");
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].classList.toggle("on", buttons[i].getAttribute("data-chat-filter") === filter);
      }
    }
    var stick = function () { feed.scrollTop = feed.scrollHeight; };
    stick();
    if (root.requestAnimationFrame) root.requestAnimationFrame(stick);
  }
  function filterBar() {
    return '<span class="ssdns-chat-filters" data-act="chatFilters">' +
      '<button type="button" data-chat-filter="all">All</button>' +
      '<button type="button" data-chat-filter="rolls">Rolls</button>' +
      '<button type="button" data-chat-filter="talk">Talk</button></span>' +
      '<span class="name-mode" role="group" aria-label="Show names as">' +
      '<button type="button" data-name-mode="character">Character</button>' +
      '<button type="button" data-name-mode="player">Player</button></span>';
  }
  function viewItems(inst) {
    return merge([inst.mapItems, inst.dockItems]);
  }
  function phone() {
    try { return !!(root.matchMedia && root.matchMedia(PHONE).matches); } catch (e) { return false; }
  }
  function popHref() {
    var nodes = root.document.getElementsByTagName("script");
    for (var i = nodes.length - 1; i >= 0; i--) {
      var src = nodes[i].src || "";
      if (/ssdns-map-chat\.js/.test(src)) return src.replace(/ssdns-map-chat\.js(\?.*)?$/, "chat-pop.html");
    }
    return "map/chat-pop.html";
  }
  function hostOf(inst) {
    return inst.root && inst.root.appendChild ? inst.root : root.document.body;
  }
  function readGeom() {
    try {
      var saved = JSON.parse(root.localStorage.getItem(GEOM_KEY) || "null");
      if (saved && isFinite(saved.x) && isFinite(saved.y) && isFinite(saved.w) && isFinite(saved.h)) return saved;
    } catch (e) {}
    return null;
  }
  function clampFloat(panel, host) {
    var box = host.getBoundingClientRect ? host.getBoundingClientRect() : { width: 0, height: 0, left: 0, top: 0 };
    if (!box.width || !box.height) return;
    var rect = panel.getBoundingClientRect();
    var w = rect.width || 340;
    var h = rect.height || 420;
    var maxW = Math.max(220, box.width - 8);
    var maxH = Math.max(160, box.height - 8);
    if (w > maxW) { w = maxW; panel.style.width = Math.round(w) + "px"; }
    if (h > maxH) { h = maxH; panel.style.height = Math.round(h) + "px"; }
    var x = rect.left - box.left;
    var y = rect.top - box.top;
    var maxX = Math.max(0, box.width - w);
    var maxY = Math.max(0, box.height - h);
    x = Math.min(Math.max(0, x), maxX);
    y = Math.min(Math.max(0, y), maxY);
    panel.style.left = Math.round(x) + "px";
    panel.style.top = Math.round(y) + "px";
    panel.style.right = "auto";
  }
  function saveGeom(panel, host) {
    var box = host.getBoundingClientRect ? host.getBoundingClientRect() : { left: 0, top: 0 };
    var rect = panel.getBoundingClientRect();
    try {
      root.localStorage.setItem(GEOM_KEY, JSON.stringify({
        x: Math.round(rect.left - box.left),
        y: Math.round(rect.top - box.top),
        w: Math.round(rect.width || parseFloat(panel.style.width) || 340),
        h: Math.round(rect.height || parseFloat(panel.style.height) || 420)
      }));
    } catch (e) {}
  }
  function placeFloat(panel, host) {
    var saved = readGeom();
    panel.style.left = (saved ? saved.x : 16) + "px";
    panel.style.top = (saved ? saved.y : 56) + "px";
    panel.style.width = (saved ? saved.w : 340) + "px";
    panel.style.height = (saved ? saved.h : 420) + "px";
    clampFloat(panel, host);
  }
  function bindDrag(panel, head, host) {
    var drag = null;
    head.addEventListener("pointerdown", function (e) {
      if (e.button != null && e.button !== 0) return;
      if (e.target && e.target.closest && e.target.closest("button")) return;
      var rect = panel.getBoundingClientRect();
      var box = host.getBoundingClientRect();
      drag = { dx: e.clientX - rect.left, dy: e.clientY - rect.top, box: box };
      if (head.setPointerCapture && e.pointerId != null) head.setPointerCapture(e.pointerId);
    });
    head.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var rect = panel.getBoundingClientRect();
      var w = rect.width || 340;
      var h = rect.height || 420;
      var x = e.clientX - drag.dx - drag.box.left;
      var y = e.clientY - drag.dy - drag.box.top;
      var maxX = drag.box.width ? Math.max(0, drag.box.width - w) : 8000;
      var maxY = drag.box.height ? Math.max(0, drag.box.height - h) : 8000;
      panel.style.left = Math.round(Math.min(Math.max(0, x), maxX)) + "px";
      panel.style.top = Math.round(Math.min(Math.max(0, y), maxY)) + "px";
    });
    function end() {
      if (!drag) return;
      drag = null;
      clampFloat(panel, host);
      saveGeom(panel, host);
    }
    head.addEventListener("pointerup", end);
    head.addEventListener("pointercancel", end);
  }
  function bindResize(panel, handle, host) {
    var drag = null;
    handle.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var rect = panel.getBoundingClientRect();
      drag = { x: e.clientX, y: e.clientY, w: rect.width || 340, h: rect.height || 420 };
      if (handle.setPointerCapture && e.pointerId != null) handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var box = host.getBoundingClientRect();
      var w = Math.max(220, drag.w + (e.clientX - drag.x));
      var h = Math.max(160, drag.h + (e.clientY - drag.y));
      if (box.width) w = Math.min(w, Math.max(220, box.width - 8));
      if (box.height) h = Math.min(h, Math.max(160, box.height - 8));
      panel.style.width = Math.round(w) + "px";
      panel.style.height = Math.round(h) + "px";
    });
    function end() {
      if (!drag) return;
      drag = null;
      clampFloat(panel, host);
      saveGeom(panel, host);
    }
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }
  function bindSend(box, inst) {
    var form = box.querySelector("[data-act=popForm]");
    var input = box.querySelector("[data-act=popInput]");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var text = input ? String(input.value || "").trim() : "";
      if (!text) return;
      if (input) input.value = "";
      if (inst.send) inst.send(text);
    });
  }
  function bindFilters(box, inst) {
    var buttons = box.querySelectorAll("[data-chat-filter]");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener("click", function (e) {
        applyFilter(inst, e.currentTarget.getAttribute("data-chat-filter"), true);
      });
    }
  }
  function applyFilter(inst, next, notify) {
    if (next !== "all" && next !== "rolls" && next !== "talk") return;
    inst.filter = next;
    writeFilter(next);
    if (inst.feed) render(inst.feed, viewItems(inst), next);
    if (inst.popup && !inst.popup.closed) {
      try { inst.popup.postMessage({ type: TYPE, op: "filter", filter: next }, origin()); } catch (e) {}
    }
    if (notify && inst.onFilter) inst.onFilter(next);
  }
  function pushItems(inst) {
    var items = viewItems(inst);
    var filter = inst.filter || readFilter();
    if ((inst.mode === "overlay" || inst.mode === "float") && inst.feed) render(inst.feed, items, filter);
    if (inst.popup && !inst.popup.closed) {
      try {
        inst.popup.postMessage({
          type: TYPE,
          op: "items",
          items: items,
          colors: root.SSDNSTokenColors || {},
          filter: filter
        }, origin());
      } catch (e) {}
    }
  }
  function closePop(inst) {
    var was = inst.open;
    inst.open = false;
    inst.mode = "";
    if (inst.floatEl && inst.floatEl.parentNode) inst.floatEl.parentNode.removeChild(inst.floatEl);
    inst.floatEl = null;
    if (inst.overlay && inst.overlay.parentNode) inst.overlay.parentNode.removeChild(inst.overlay);
    inst.overlay = null;
    inst.feed = null;
    if (was && inst.onMode) inst.onMode(false, "");
  }
  function closeWindow(inst) {
    if (inst.tabTimer) { clearInterval(inst.tabTimer); inst.tabTimer = 0; }
    var popup = inst.popup;
    inst.popup = null;
    if (!popup) return;
    try { popup.postMessage({ type: TYPE, op: "close" }, origin()); } catch (e) {}
    try { popup.close(); } catch (e) {}
    if (!inst.open && inst.onMode) inst.onMode(false, "");
  }
  function panelShell(dockAct) {
    return '<header class="ssdns-chat-float-bar" data-act="chatFloatHead"><strong>Table chat</strong>' + filterBar() +
      '<button type="button" data-act="chatWindow" class="ssm-chat-tab">Open in new tab</button>' +
      '<button type="button" data-act="' + dockAct + '">Dock</button></header>' +
      '<div class="ssdns-chat-float-feed" data-act="popFeed"></div>' +
      '<form class="ssdns-chat-float-form" data-act="popForm"><input data-act="popInput" placeholder="Chat or /roll" autocomplete="off" aria-label="Chat message"><button type="submit" data-act="popSend">Send</button></form>';
  }
  function wirePanel(inst, box, host) {
    inst.feed = box.querySelector("[data-act=popFeed]");
    inst.filter = readFilter();
    bindFilters(box, inst);
    bindSend(box, inst);
    var tabBtn = box.querySelector("[data-act=chatWindow]");
    if (tabBtn) tabBtn.addEventListener("click", function () { openWindow(inst); });
    var head = box.querySelector("[data-act=chatFloatHead]");
    if (head && host) bindDrag(box, head, host);
    var handle = box.querySelector("[data-act=chatResize]");
    if (handle && host) bindResize(box, handle, host);
    render(inst.feed, viewItems(inst), inst.filter);
    var input = box.querySelector("[data-act=popInput]");
    if (input) { try { input.focus(); } catch (e) {} }
  }
  function openFloat(inst) {
    closePop(inst);
    var host = hostOf(inst);
    var box = root.document.createElement("aside");
    box.className = "ssdns-chat-float";
    box.setAttribute("data-act", "chatFloat");
    box.innerHTML = panelShell("floatDock") +
      '<button type="button" class="ssdns-chat-resize" data-act="chatResize" aria-label="Resize chat"></button>';
    host.appendChild(box);
    placeFloat(box, host);
    inst.floatEl = box;
    inst.mode = "float";
    inst.open = true;
    if (inst.onMode) inst.onMode(true, "float");
    var dockBtn = box.querySelector("[data-act=floatDock]");
    if (dockBtn) dockBtn.addEventListener("click", function () { closePop(inst); });
    wirePanel(inst, box, host);
  }
  function openOverlay(inst) {
    closePop(inst);
    var doc = root.document;
    var box = doc.createElement("div");
    box.className = "ssdns-chat-overlay";
    box.setAttribute("data-act", "chatOverlay");
    box.innerHTML = panelShell("overlayDock");
    doc.body.appendChild(box);
    inst.overlay = box;
    inst.mode = "overlay";
    inst.open = true;
    if (inst.onMode) inst.onMode(true, "overlay");
    var dockBtn = box.querySelector("[data-act=overlayDock]");
    if (dockBtn) dockBtn.addEventListener("click", function () { closePop(inst); });
    wirePanel(inst, box, null);
  }
  function openWindow(inst) {
    if (inst.popup && !inst.popup.closed) {
      try { inst.popup.focus(); } catch (e) {}
      pushItems(inst);
      return;
    }
    var win = null;
    try {
      win = root.open(popHref(), "ssdns-map-chat", "popup=yes,width=440,height=720,resizable=yes,scrollbars=yes");
    } catch (e) { win = null; }
    if (!win) {
      if (inst.onMode) inst.onMode(!!inst.open, inst.mode, "blocked");
      return;
    }
    inst.popup = win;
    if (!inst.open && inst.onMode) inst.onMode(true, "window");
    if (inst.tabTimer) clearInterval(inst.tabTimer);
    inst.tabTimer = root.setInterval(function () {
      if (!inst.popup || inst.popup.closed) {
        clearInterval(inst.tabTimer);
        inst.tabTimer = 0;
        inst.popup = null;
        if (!inst.open && inst.onMode) inst.onMode(false, "");
      }
    }, 500);
    pushItems(inst);
  }
  function pop(inst) {
    if (inst.open && (inst.mode === "float" || inst.mode === "overlay")) return;
    if (phone()) { openOverlay(inst); return; }
    openFloat(inst);
  }
  function onMessage(e) {
    var here = origin();
    if (!e || (here && e.origin !== here)) return;
    var data = e.data;
    if (!data || data.type !== TYPE) return;
    var inst = null;
    for (var i = 0; i < instances.length; i++) {
      if (instances[i].popup && e.source === instances[i].popup) { inst = instances[i]; break; }
    }
    if (!inst) return;
    if (data.op === "hello" || data.op === "ready") pushItems(inst);
    if (data.op === "send" && data.text && inst.send) inst.send(String(data.text));
    if (data.op === "dock") closeWindow(inst);
    if (data.op === "filter") applyFilter(inst, data.filter, true);
  }
  if (root.addEventListener) root.addEventListener("message", onMessage);

  function attach(opts) {
    opts = opts || {};
    var inst = {
      root: opts.root || null,
      mapItems: [],
      dockItems: lastDock != null ? lastDock : (root.SSDNSChatDockItems || null),
      send: opts.send,
      onMode: opts.onMode,
      onFilter: opts.onFilter,
      filter: readFilter(),
      open: false,
      mode: "",
      popup: null,
      tabTimer: 0,
      overlay: null,
      floatEl: null,
      feed: null
    };
    instances.push(inst);
    return {
      setMapItems: function (items) {
        inst.mapItems = items || [];
        if (inst.open || inst.popup) pushItems(inst);
      },
      setDockItems: function (items) {
        inst.dockItems = items || [];
        if (inst.open || inst.popup) pushItems(inst);
      },
      pop: function () { pop(inst); },
      openTab: function () { openWindow(inst); },
      dock: function () { closePop(inst); },
      setFilter: function (next) { applyFilter(inst, next, false); },
      detach: function () {
        closeWindow(inst);
        closePop(inst);
        var at = instances.indexOf(inst);
        if (at >= 0) instances.splice(at, 1);
      },
      isOpen: function () { return !!inst.open; },
      mode: function () { return inst.mode; },
      items: function () { return viewItems(inst); }
    };
  }
  function publish(items) {
    lastDock = items || [];
    instances.forEach(function (inst) {
      inst.dockItems = lastDock;
      if (inst.open || inst.popup) pushItems(inst);
    });
  }
  function bootPopup() {
    var doc = root.document;
    var feed = doc.getElementById("popFeed");
    var form = doc.getElementById("popSend");
    var input = doc.getElementById("popText");
    var dockBtn = doc.getElementById("popDock");
    var collapseBtn = doc.getElementById("popCollapse");
    var note = doc.getElementById("popNote");
    var collapsed = false;
    try { collapsed = root.localStorage.getItem("ssdns.map.chatTabOpen") === "0"; } catch (e) {}
    function paintCollapse() {
      doc.body.classList.toggle("ssdns-chat-collapsed", collapsed);
      if (collapseBtn) collapseBtn.textContent = collapsed ? "Show" : "Hide";
    }
    paintCollapse();
    if (collapseBtn) collapseBtn.addEventListener("click", function () {
      collapsed = !collapsed;
      try { root.localStorage.setItem("ssdns.map.chatTabOpen", collapsed ? "0" : "1"); } catch (e) {}
      paintCollapse();
    });
    var lastItems = [];
    var filter = readFilter();
    function paint() { render(feed, lastItems, filter); }
    root.addEventListener("ssdns-name-mode", paint);
    root.addEventListener("storage", function (e) {
      if (e && e.key === "ssdns.chat.nameMode") paint();
    });
    function post(op, extra) {
      if (!root.opener || root.opener.closed) return false;
      try {
        root.opener.postMessage(Object.assign({ type: TYPE, op: op }, extra || {}), origin());
        return true;
      } catch (e) { return false; }
    }
    root.addEventListener("message", function (e) {
      if (origin() && e.origin !== origin()) return;
      if (!root.opener || e.source !== root.opener) return;
      var data = e.data;
      if (!data || data.type !== TYPE) return;
      if (data.op === "items") {
        lastItems = data.items || [];
        if (data.colors) root.SSDNSTokenColors = data.colors;
        if (data.filter === "all" || data.filter === "rolls" || data.filter === "talk") filter = data.filter;
        paint();
      }
      if (data.op === "filter" && (data.filter === "all" || data.filter === "rolls" || data.filter === "talk")) {
        filter = data.filter;
        writeFilter(filter);
        paint();
      }
      if (data.op === "close") { try { root.close(); } catch (err) {} }
    });
    var buttons = doc.querySelectorAll("[data-chat-filter]");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener("click", function (e) {
        filter = e.currentTarget.getAttribute("data-chat-filter");
        writeFilter(filter);
        paint();
        post("filter", { filter: filter });
      });
    }
    if (dockBtn) dockBtn.addEventListener("click", function () { post("dock"); });
    if (form) form.addEventListener("submit", function (e) {
      e.preventDefault();
      var text = input ? String(input.value || "").trim() : "";
      if (!text) return;
      if (input) input.value = "";
      post("send", { text: text });
    });
    paint();
    if (!post("hello") && note) note.hidden = false;
  }

  root.addEventListener("ssdns-name-mode", function () {
    if (lastDock) publish(lastDock);
  });
  root.SSDNSMapChat = {
    attach: attach,
    publish: publish,
    render: render,
    bootPopup: bootPopup
  };
})(window);
