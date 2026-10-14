/* Pop-out for the map chat. The opener keeps the only room connection.
   The window (or the phone overlay) mirrors that feed and sends back once. */
(function (root) {
  "use strict";
  var TYPE = "ssdns-map-chat";
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
    var who = String(item.who || "");
    if (!who || item.kind === "roll" || item.kind === "rolls") return text;
    if (text.indexOf(who) === 0) return text;
    return who + ": " + text;
  }
  function clsOf(item) {
    return (("dock-item " + (item.cls || "") + " " + (item.kind ? "dock-" + item.kind : ""))).split(/\s+/).filter(function (c) {
      return /^[a-z0-9_-]+$/i.test(c);
    }).join(" ");
  }
  function render(feed, items) {
    if (!feed) return;
    var rows = items || [];
    feed.innerHTML = rows.map(function (item) {
      var tag = item.tag ? ' · <span class="roll-tag">' + esc(item.tag) + "</span>" : "";
      return '<div class="' + clsOf(item) + '" data-id="' + esc(keyOf(item)) + '"><div class="dock-meta">' +
        esc(item.who || "Table") + tag + '</div><div class="dock-text">' + esc(body(item)) + "</div></div>";
    }).join("") || '<p class="fine">No messages yet.</p>';
    var stick = function () { feed.scrollTop = feed.scrollHeight; };
    stick();
    if (root.requestAnimationFrame) root.requestAnimationFrame(stick);
  }
  function viewItems(inst) {
    return merge([inst.mapItems, inst.dockItems]);
  }
  function narrow() {
    try { return !!(root.matchMedia && root.matchMedia("(max-width: 800px)").matches); } catch (e) { return false; }
  }
  function popHref() {
    var nodes = root.document.getElementsByTagName("script");
    for (var i = nodes.length - 1; i >= 0; i--) {
      var src = nodes[i].src || "";
      if (/ssdns-map-chat\.js/.test(src)) return src.replace(/ssdns-map-chat\.js(\?.*)?$/, "chat-pop.html");
    }
    return "map/chat-pop.html";
  }
  function pushItems(inst) {
    var items = viewItems(inst);
    if (inst.mode === "overlay" && inst.feed) render(inst.feed, items);
    if (inst.mode === "window" && inst.popup && !inst.popup.closed) {
      try { inst.popup.postMessage({ type: TYPE, op: "items", items: items }, origin()); } catch (e) {}
    }
  }
  function dock(inst) {
    if (inst.timer) { clearInterval(inst.timer); inst.timer = 0; }
    var popup = inst.popup;
    var mode = inst.mode;
    inst.popup = null;
    inst.open = false;
    inst.mode = "";
    if (inst.overlay && inst.overlay.parentNode) inst.overlay.parentNode.removeChild(inst.overlay);
    inst.overlay = null;
    inst.feed = null;
    if (inst.onMode) inst.onMode(false, "");
    if (popup && mode === "window") {
      try { popup.postMessage({ type: TYPE, op: "close" }, origin()); } catch (e) {}
      try { popup.close(); } catch (e) {}
    }
  }
  function openOverlay(inst) {
    dock(inst);
    var doc = root.document;
    var box = doc.createElement("div");
    box.className = "ssdns-chat-overlay";
    box.setAttribute("data-act", "chatOverlay");
    box.innerHTML = '<header class="ssdns-chat-overlay-bar"><strong>Table chat</strong><button type="button" data-act="overlayDock">Dock</button></header>' +
      '<div class="ssdns-chat-overlay-feed" data-act="popFeed"></div>' +
      '<form class="ssdns-chat-overlay-form" data-act="popForm"><input data-act="popInput" placeholder="Chat or /roll" autocomplete="off" aria-label="Chat message"><button type="submit" data-act="popSend">Send</button></form>';
    doc.body.appendChild(box);
    inst.overlay = box;
    inst.feed = box.querySelector("[data-act=popFeed]");
    inst.mode = "overlay";
    inst.open = true;
    if (inst.onMode) inst.onMode(true, "overlay");
    var dockBtn = box.querySelector("[data-act=overlayDock]");
    if (dockBtn) dockBtn.addEventListener("click", function () { dock(inst); });
    var form = box.querySelector("[data-act=popForm]");
    var input = box.querySelector("[data-act=popInput]");
    if (form) form.addEventListener("submit", function (e) {
      e.preventDefault();
      var text = input ? String(input.value || "").trim() : "";
      if (!text) return;
      if (input) input.value = "";
      if (inst.send) inst.send(text);
    });
    render(inst.feed, viewItems(inst));
    if (input) { try { input.focus(); } catch (e) {} }
  }
  function openWindow(inst) {
    var win = null;
    try {
      win = root.open(popHref(), "ssdns-map-chat", "popup=yes,width=440,height=720,resizable=yes,scrollbars=yes");
    } catch (e) { win = null; }
    if (!win) { openOverlay(inst); return; }
    inst.popup = win;
    inst.mode = "window";
    inst.open = true;
    if (inst.onMode) inst.onMode(true, "window");
    try { win.focus(); } catch (e) {}
    inst.timer = root.setInterval(function () {
      if (inst.mode === "window" && (!inst.popup || inst.popup.closed)) dock(inst);
    }, 500);
    pushItems(inst);
  }
  function pop(inst) {
    if (inst.open && inst.mode === "window" && inst.popup && !inst.popup.closed) {
      try { inst.popup.focus(); } catch (e) {}
      pushItems(inst);
      return;
    }
    if (inst.open && inst.mode === "overlay") return;
    if (narrow()) { openOverlay(inst); return; }
    openWindow(inst);
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
    if (data.op === "dock") dock(inst);
  }
  if (root.addEventListener) root.addEventListener("message", onMessage);

  function attach(opts) {
    opts = opts || {};
    var inst = {
      mapItems: [],
      dockItems: lastDock != null ? lastDock : (root.SSDNSChatDockItems || null),
      send: opts.send,
      onMode: opts.onMode,
      open: false,
      mode: "",
      popup: null,
      overlay: null,
      feed: null,
      timer: 0
    };
    instances.push(inst);
    return {
      setMapItems: function (items) {
        inst.mapItems = items || [];
        if (inst.open) pushItems(inst);
      },
      setDockItems: function (items) {
        inst.dockItems = items || [];
        if (inst.open) pushItems(inst);
      },
      pop: function () { pop(inst); },
      dock: function () { dock(inst); },
      detach: function () {
        dock(inst);
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
      if (inst.open) pushItems(inst);
    });
  }
  function bootPopup() {
    var doc = root.document;
    var feed = doc.getElementById("popFeed");
    var form = doc.getElementById("popSend");
    var input = doc.getElementById("popText");
    var dockBtn = doc.getElementById("popDock");
    var note = doc.getElementById("popNote");
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
      if (data.op === "items") render(feed, data.items || []);
      if (data.op === "close") { try { root.close(); } catch (err) {} }
    });
    if (dockBtn) dockBtn.addEventListener("click", function () { post("dock"); });
    if (form) form.addEventListener("submit", function (e) {
      e.preventDefault();
      var text = input ? String(input.value || "").trim() : "";
      if (!text) return;
      if (input) input.value = "";
      post("send", { text: text });
    });
    if (!post("hello") && note) note.hidden = false;
  }

  root.SSDNSMapChat = {
    attach: attach,
    publish: publish,
    render: render,
    bootPopup: bootPopup
  };
})(window);
