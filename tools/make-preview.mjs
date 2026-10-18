#!/usr/bin/env node
// Writes plugins/<id>/preview.json from a real card: what a running Rattleboard (desktop
// with the API server on, or Rattleboard Web) shows for a source of that plugin right now.
//
//   RATTLEBOARD_KEY=<api key> node tools/make-preview.mjs <plugin-id> [--url http://127.0.0.1:7070] [--source <source id>]
//
// Install the plugin and add it as a source first. Set the board to Standard (6×22), since
// the preview is drawn at the board's own size. The first page of the card is saved.
// No dependencies (Node 20+: fetch is built in).

import { writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { checkPreview } from "./build-index.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const id = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const base = (opt("--url") ?? "http://127.0.0.1:7070").replace(/\/+$/, "");
const key = process.env.RATTLEBOARD_KEY;

function die(msg) {
  console.error(msg);
  process.exit(1);
}

if (!id) die("Usage: RATTLEBOARD_KEY=<api key> node tools/make-preview.mjs <plugin-id> [--url http://127.0.0.1:7070] [--source <source id>]");
if (!key) die("Set RATTLEBOARD_KEY to the board's API key (Settings → API server).");
const dir = join(ROOT, "plugins", id);
if (!existsSync(dir)) die(`There's no folder plugins/${id}`);

const headers = { "X-Vestaboard-Local-Api-Key": key };
async function get(path) {
  const res = await fetch(`${base}${path}`, { headers });
  if (!res.ok) die(`${path}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

let source = opt("--source");
if (!source) {
  const view = await get("/rattleboard/sources");
  const found = (view.rotation ?? []).filter((s) => s.plugin === id);
  if (!found.length) die(`No source uses ${id}. Install the plugin and add it as a source (Settings → Sources), then try again.`);
  if (found.length > 1) console.log(`${found.length} sources use ${id}; using the first (pass --source <id> to choose).`);
  source = found[0].id;
}
const p = await get(`/rattleboard/sources/preview/${encodeURIComponent(source)}`);
const characters = p.pages?.[0] ?? p.characters;
if (!Array.isArray(characters) || !characters.length) die(`The board sent no card: ${p.reason ?? "no reason given"}`);
const preview = { rows: characters.length, cols: characters[0].length, characters };
try {
  checkPreview(preview);
} catch (e) {
  die(`${e.message} (the board says: ${p.reason ?? "nothing"})`);
}
if (preview.rows !== 6 || preview.cols !== 22) console.log(`Note: this board is ${preview.rows}×${preview.cols}; Standard (6×22) previews are preferred.`);
const rows = preview.characters.map((r) => `    ${JSON.stringify(r)}`).join(",\n");
writeFileSync(join(dir, "preview.json"), `{\n  "rows": ${preview.rows},\n  "cols": ${preview.cols},\n  "characters": [\n${rows}\n  ]\n}\n`);
console.log(`Wrote plugins/${id}/preview.json (${preview.rows}×${preview.cols}; the board says: ${p.reason ?? ""})`);
