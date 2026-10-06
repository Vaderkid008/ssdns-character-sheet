/**
 * DM tab changes come from a click or the rewards hotkey.
 * Remote room events leave the active tab alone.
 */
(function (root) {
  "use strict";
  function nextTab(current, event) {
    var cur = current || "tab-table";
    if (!event || event.remote) return cur;
    if ((event.type === "click" || event.type === "hotkey") && event.tab) return event.tab;
    return cur;
  }
  root.SSDNSUiTab = { nextTab: nextTab };
})(typeof window !== "undefined" ? window : globalThis);
