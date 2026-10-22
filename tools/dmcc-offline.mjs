/**
 * Guard for browser tests that open the DMCC: they must never reach the live ssdns-dm-hub database.
 *   dmccUrl(path)        adds ?demo=1 (offline demo: the Firebase SDK is never loaded)
 *   await dmccOffline(p) waits for window.DMCC, then throws unless it is in demo mode with no database
 * Live-room tests use ?emu=1 (the local emulator) and do not use this guard.
 */
export function dmccUrl(path) {
  const s = String(path || "/dm/index.html");
  if (/[?&]demo=1(?:&|#|$)/.test(s)) return s;
  return s.replace(/^([^?#]*)(\?[^#]*)?(#.*)?$/, (m, base, q, h) => base + (q ? q + "&demo=1" : "?demo=1") + (h || ""));
}
export async function dmccOffline(page) {
  await page.waitForFunction(() => window.DMCC && window.DMCC.state, { timeout: 25000 });
  const st = await page.evaluate(() => ({ demo: window.DMCC.state.demo, db: !!window.DMCC.state.db, fb: !!window.DMCC.state.firebaseReady, url: location.href }));
  if (st.demo !== true || st.db || st.fb) {
    throw new Error("DMCC is not offline (demo " + st.demo + ", db " + st.db + ", firebaseReady " + st.fb + ") at " + st.url + ": refusing to run against a live database");
  }
  return st;
}
