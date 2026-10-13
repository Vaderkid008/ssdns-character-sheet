/**
 * Token crop math: Fit covers the circle, zoom-out still exports pixels,
 * top bias, and a tainted canvas keeps the original picture.
 *   node tools/test-token-crop.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously" });
const w = dom.window;
w.__draws = [];
w.HTMLCanvasElement.prototype.getContext = function () {
  return {
    clearRect() {},
    save() {},
    restore() {},
    beginPath() {},
    arc() {},
    clip() {},
    drawImage(...args) { w.__draws.push(args); }
  };
};
w.HTMLCanvasElement.prototype.toDataURL = function () {
  const last = w.__draws[w.__draws.length - 1];
  const dw = last && (last.length >= 9 ? last[7] : last[3]);
  if (!(dw > 0)) throw new Error("empty export");
  return "data:image/webp;base64,QQ";
};
const script = w.document.createElement("script");
script.textContent = fs.readFileSync(path.join(root, "map/token-crop.js"), "utf8");
w.document.body.appendChild(script);
const Crop = w.SSDNSTokenCrop;

const fit = Crop.fitFrame(200, 400, 128);
check("fit.cover", fit.scale === 128 / 200, String(fit.scale));
check("fit.notContain", fit.scale !== Math.min(128 / 200, 128 / 400));
const centerY = (128 - 400 * fit.scale) / 2;
check("fit.topBias", fit.panY > centerY, "pan " + fit.panY + " center " + centerY);

const bias = Crop.topBias(172, 256);
check("bias.top", bias.y > 0 && bias.y < (256 - bias.side) / 2, JSON.stringify(bias));

w.__draws = [];
const zoomed = Crop.exportPlacement(80, 120, 240, 0.01, 0, 0, 128);
check("zoom.notEmpty", zoomed.dw >= 1 && zoomed.dh >= 1 && zoomed.empty === false, JSON.stringify(zoomed));
const url = Crop.exportImage({ width: 80, height: 120 }, { scale: 0.01, panX: 0, panY: 0, view: 240 });
check("zoom.export", url.indexOf("data:image/webp") === 0, url);

const real = w.HTMLCanvasElement.prototype.toDataURL;
w.HTMLCanvasElement.prototype.toDataURL = function () { throw new Error("tainted"); };
let blocked = "";
try { blocked = Crop.exportImage({ width: 40, height: 40 }, Crop.fitFrame(40, 40, 240)); }
catch (e) { blocked = "threw"; }
check("taint.fallback", blocked === "", blocked);
w.HTMLCanvasElement.prototype.toDataURL = real;

check("preset.bandit", Crop.preset("bandit-1") === "tokenImages/bandit-1.webp");
check("preset.miss", Crop.preset("rustler") === "");
const webps = fs.readdirSync(path.join(root, "map/tokenImages")).filter((name) => name.endsWith(".webp"));
check("repo.webps", webps.length >= 9, webps.join(","));
webps.forEach((name) => {
  const bytes = fs.statSync(path.join(root, "map/tokenImages", name)).size;
  check("repo." + name, bytes > 200 && bytes < 20000, String(bytes));
});

const box = Crop.open({ host: w.document.body, src: "" });
const fitBtn = box.querySelector("[data-act='cropFit']");
fitBtn.click();
check("fit.needsImage", box.querySelector("[data-act='cropNote']").textContent.indexOf("Choose an image") >= 0);
w.__draws = [];
const fake = { width: 200, height: 400 };
box.querySelector("[data-act='cropFile']");
const reader = { result: "data:image/png;base64,QQ" };
w.FileReader = function () { this.readAsDataURL = () => { if (this.onload) this.onload(); }; };
const imgProto = w.Image;
w.Image = function () {
  const im = new imgProto();
  Object.defineProperty(im, "width", { get() { return fake.width; } });
  Object.defineProperty(im, "height", { get() { return fake.height; } });
  const self = im;
  setTimeout(() => { if (self.onload) self.onload(); }, 0);
  return im;
};
await new Promise((resolve) => {
  Crop.cropUrl("data:image/png;base64,QQ").then((out) => {
    check("crop.dataUrl", out.indexOf("data:image/webp") === 0, out);
    resolve();
  });
});

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nall token crop checks passed");
