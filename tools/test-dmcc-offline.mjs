/**
 * No browser test may open the DMCC against the live ssdns-dm-hub database.
 * Every real page load of /dm/ in tools/test-*.mjs must use ?demo=1, ?emu=1 (local emulator) or dmccUrl().
 * JSDOM / sandbox URLs (no Firebase) are not page loads and are skipped.
 *   node tools/test-dmcc-offline.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dmccUrl } from "./dmcc-offline.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const bad = [];
for (const f of fs.readdirSync(dir).filter((n) => /^test-.*\.mjs$/.test(n))) {
  fs.readFileSync(path.join(dir, f), "utf8").split("\n").forEach((line, i) => {
    if (!/\/dm\/(index\.html)?(?=[?"'`#])/.test(line)) return;
    if (!/\.goto\(|createTarget|await page\(/.test(line)) return;
    if (/demo=1|emu=1|dmccUrl\(/.test(line)) return;
    bad.push(f + ":" + (i + 1) + "  " + line.trim());
  });
}
const urlOk = dmccUrl("/dm/index.html") === "/dm/index.html?demo=1" && dmccUrl("/dm/index.html?fresh=1") === "/dm/index.html?fresh=1&demo=1" && dmccUrl("/dm/?demo=1") === "/dm/?demo=1";
console.log((urlOk ? "ok  " : "FAIL") + "  dmccUrl adds demo=1");
console.log((bad.length ? "FAIL" : "ok  ") + "  every DMCC page load is offline or on the emulator" + (bad.length ? "\n  " + bad.join("\n  ") : ""));
process.exit(bad.length || !urlOk ? 1 : 0);
