#!/usr/bin/env node
/**
 * Fail when DMCC or the sheet set/update/remove/runTransaction a room path
 * whose rules grant .write only on a child. set() of a parent needs .write
 * on that node or an ancestor. update() is checked per child key.
 *
 * Reads and listeners are checked by tools/check-rules-emulator.mjs.
 *
 *   node tools/check-rules-writes.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = [
  "dm/assets/js/dmcc.js",
  "dm/assets/js/v2.js",
  "assets/js/dm-join.js"
];

function roomNode(rules) {
  return rules.rules.rooms.$roomCode;
}

function childNode(node, seg) {
  if (!node || typeof node !== "object") return null;
  if (Object.prototype.hasOwnProperty.call(node, seg)) return node[seg];
  const wild = Object.keys(node).find((k) => k.startsWith("$"));
  return wild ? node[wild] : null;
}

function writeCovers(node, parts) {
  if (node && Object.prototype.hasOwnProperty.call(node, ".write")) return true;
  if (!parts.length || !node) return false;
  const seg = parts[0];
  const rest = parts.slice(1);
  if (seg === "$id") {
    const wild = Object.keys(node).find((k) => k.startsWith("$"));
    if (wild) return writeCovers(node[wild], rest);
    const kids = Object.keys(node).filter((k) => !k.startsWith("."));
    return kids.length > 0 && kids.every((kid) => writeCovers(node[kid], rest));
  }
  return writeCovers(childNode(node, seg), rest);
}

function balanced(src, openIdx) {
  let depth = 0;
  let quote = null;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return { text: src.slice(openIdx + 1, i), end: i };
    }
  }
  return null;
}

function splitTop(src) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") depth--;
    else if (c === "," && depth === 0) {
      parts.push(src.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(src.slice(start));
  return parts;
}

function objectKeys(literal) {
  const body = literal.trim().replace(/^\{/, "").replace(/\}$/, "");
  const keys = [];
  splitTop(body).forEach((part) => {
    const m = part.match(/^\s*([A-Za-z_$][\w$]*|"[^"]+"|'[^']+')\s*:/);
    if (!m) return;
    keys.push(m[1].replace(/^['"]|['"]$/g, ""));
  });
  return keys;
}

function stringLiteral(expr) {
  const m = expr.trim().match(/^(['"])([\s\S]*)\1$/);
  return m ? m[2] : null;
}

function splitPlus(src) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") depth--;
    else if (c === "+" && depth === 0) {
      parts.push(src.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(src.slice(start));
  return parts;
}

function segmentsFromExpr(expr) {
  const e = expr.trim().replace(/;\s*$/, "");
  const bits = splitPlus(e);
  const segs = [];
  bits.forEach((bit) => {
    const lit = stringLiteral(bit.trim());
    if (lit != null) {
      lit.split("/").filter((s) => s !== "").forEach((s) => segs.push(s));
    } else if (bit.trim()) {
      segs.push("$id");
    }
  });
  if (segs[0] === "rooms") return segs.slice(2);
  return segs;
}

function listPaths(before) {
  const listAt = before.lastIndexOf("const paths =");
  if (listAt < 0) return null;
  const bracket = before.indexOf("[", listAt);
  const arr = balancedBracket(before, bracket);
  if (!arr) return null;
  return arr.split(",").map((s) => stringLiteral(s.trim())).filter(Boolean);
}

function expandPathExpr(expr, src, at) {
  const trimmed = expr.trim();
  const before = src.slice(0, at);
  const direct = trimmed.match(/(?:roomRef|roomPath)\s*\(/);
  if (direct) {
    const open = trimmed.indexOf("(", direct.index);
    const inner = balanced(trimmed, open);
    if (!inner) return { error: "unbalanced " + trimmed.slice(0, 80) };
    return expandPathExpr(inner.text, src, at);
  }
  if (/['"]rooms\//.test(trimmed)) return { paths: [segmentsFromExpr(trimmed)] };
  if (trimmed === "copy") {
    const assign = before.lastIndexOf("const copy");
    if (assign < 0) return { error: "copy path not found" };
    const line = before.slice(assign);
    const q = line.indexOf("?");
    const colon = line.indexOf(":", q);
    if (q < 0 || colon < 0) return { error: "copy ternary not found" };
    return {
      paths: [
        segmentsFromExpr(line.slice(q + 1, colon)),
        segmentsFromExpr(line.slice(colon + 1).split(";")[0])
      ]
    };
  }
  if (trimmed === "path" || trimmed.startsWith("path +") || trimmed.startsWith("path+")) {
    const names = listPaths(before);
    if (!names) return { error: "paths list not found" };
    const child = trimmed.includes("+");
    return { paths: names.map((n) => (child ? [n, "$id"] : [n])) };
  }
  if (/^[A-Za-z_$][\w$]*$/.test(trimmed)) {
    const refAt = before.lastIndexOf(trimmed + " =");
    if (refAt >= 0) {
      const chunk = before.slice(refAt, refAt + 500);
      if (/roomPath|roomRef/.test(chunk)) {
        const open = chunk.indexOf("(", chunk.search(/roomPath|roomRef/));
        const inner = balanced(chunk, open);
        if (inner) return { paths: [segmentsFromExpr(inner.text)] };
      }
      const qpos = Math.max(chunk.indexOf('"rooms/'), chunk.indexOf("'rooms/"));
      if (qpos >= 0) {
        const end = chunk.slice(qpos).search(/[;\n]/);
        return { paths: [segmentsFromExpr(chunk.slice(qpos, qpos + end))] };
      }
    }
    return { error: "unknown path variable " + trimmed };
  }
  if (trimmed.includes("+") || /^['"]/.test(trimmed)) return { paths: [segmentsFromExpr(trimmed)] };
  return { error: "unparsed path " + trimmed.slice(0, 120) };
}

function balancedBracket(src, openIdx) {
  let depth = 0;
  let quote = null;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) return src.slice(openIdx + 1, i);
    }
  }
  return null;
}

function collectWrites(file, src) {
  const found = [];
  const re = /\.(set|update|remove|runTransaction)\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    const method = m[1];
    const args = balanced(src, m.index + m[0].length - 1);
    if (!args) {
      found.push({ file, error: "unbalanced " + method });
      continue;
    }
    const argList = splitTop(args.text);
    let target = argList[0] || "";
    let keys = null;
    if (method === "update" && target.trim().startsWith("{")) {
      keys = objectKeys(target);
      const before = src.slice(Math.max(0, m.index - 500), m.index);
      const od = before.lastIndexOf("onDisconnect");
      if (od < 0) {
        found.push({ file, error: "update object without a path" });
        continue;
      }
      const call = before.slice(od);
      const open = call.indexOf("(");
      const inner = balanced(call, open);
      target = inner ? inner.text : "";
    } else if (method === "update" && argList[1] && argList[1].trim().startsWith("{")) {
      keys = objectKeys(argList[1]);
    }
    if (!/roomRef|roomPath|rooms\/|presence|copy|\bpath\b/.test(target) && !/roomRef|roomPath|rooms\//.test(src.slice(Math.max(0, m.index - 200), m.index))) {
      continue;
    }
    const line = src.slice(0, m.index).split("\n").length;
    const expanded = expandPathExpr(target, src, m.index);
    if (expanded.error) {
      found.push({ file, line, method, error: expanded.error });
      continue;
    }
    expanded.paths.forEach((parts) => {
      found.push({ file, line, method, parts, keys });
    });
  }
  return found;
}

function checkWrites(rules, writes) {
  const room = roomNode(rules);
  const problems = [];
  writes.forEach((w) => {
    if (w.error) {
      problems.push(w.file + ":" + (w.line || "?") + " " + w.error);
      return;
    }
    const label = w.parts.join("/");
    if (w.method === "update" && w.keys && w.keys.length) {
      w.keys.forEach((key) => {
        const parts = w.parts.concat([key]);
        if (!writeCovers(room, parts)) {
          problems.push(w.file + ":" + w.line + " update " + parts.join("/") + " has no .write on that node or an ancestor");
        }
      });
      return;
    }
    if (!writeCovers(room, w.parts)) {
      problems.push(w.file + ":" + w.line + " " + w.method + " " + label + " has no .write on that node or an ancestor");
    }
  });
  return problems;
}

function oldPublicRules(rules) {
  const copy = JSON.parse(JSON.stringify(rules));
  const pub = copy.rules.rooms.$roomCode.encounter.public;
  const write = pub[".write"];
  delete pub[".write"];
  pub.$id[".write"] = write;
  return copy;
}

function main() {
  const rulesPath = path.join(root, "database.rules.json");
  const rules = JSON.parse(fs.readFileSync(rulesPath, "utf8"));
  const writes = [];
  SOURCES.forEach((rel) => {
    const src = fs.readFileSync(path.join(root, rel), "utf8");
    writes.push.apply(writes, collectWrites(rel, src));
  });
  if (!writes.length) {
    console.error("no room writes found");
    process.exit(1);
  }
  const problems = checkWrites(rules, writes);
  const parentSets = writes.filter((w) => w.parts && w.method === "set" && ["encounter/public", "encounter/hp"].includes(w.parts.join("/")));
  if (parentSets.length < 2) {
    problems.push("expected set() of encounter/public and encounter/hp");
  }
  const oldProblems = checkWrites(oldPublicRules(rules), writes);
  const caught = oldProblems.some((p) => p.includes("encounter/public"));
  if (!caught) problems.push("regression: write-only-on encounter/public/$id was not rejected");
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  const summary = writes.map((w) => (w.file + ":" + w.line + " " + w.method + " " + (w.parts || []).join("/") + (w.keys ? " {" + w.keys.join(",") + "}" : ""))).join("\n");
  console.log("ok " + writes.length + " room writes\n" + summary);
}

main();
