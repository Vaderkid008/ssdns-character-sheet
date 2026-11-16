/* App Check for the GitHub Pages site. Off until window.SSDNS_APP_CHECK.enabled
   is exactly true and a site key is set. Enforcement in the Firebase console
   is a separate step. This file does not register a key or turn enforcement on. */
(function (root) {
  "use strict";
  var SDK = "https://www.gstatic.com/firebasejs/10.14.1/firebase-app-check.js";

  function settings() {
    var f = root.SSDNS_APP_CHECK;
    if (!f || f.enabled !== true) return null;
    var siteKey = String(f.siteKey || "").trim();
    if (!siteKey) return null;
    return { siteKey: siteKey, enterprise: f.enterprise === true };
  }

  function enabled() {
    return !!settings();
  }

  async function start(app) {
    var cfg = settings();
    if (!cfg || !app) return { ok: false, skipped: true };
    var mod = await import(SDK);
    var Provider = cfg.enterprise && mod.ReCaptchaEnterpriseProvider
      ? mod.ReCaptchaEnterpriseProvider
      : mod.ReCaptchaV3Provider;
    var appCheck = mod.initializeAppCheck(app, {
      provider: new Provider(cfg.siteKey),
      isTokenAutoRefreshEnabled: true
    });
    return { ok: true, appCheck: appCheck };
  }

  root.SSDNSAppCheck = { start: start, enabled: enabled };
})(typeof window !== "undefined" ? window : globalThis);
