#!/usr/bin/env node
// Validates every plugins/<id>/ folder and writes index.json.
//
//   node tools/build-index.mjs                 validate, then write index.json
//   node tools/build-index.mjs --check         validate, and fail if index.json is out of date
//   node tools/build-index.mjs --validate-only validate, write nothing
//   node tools/build-index.mjs --base <ref>    also check that every plugin changed since <ref>
//                                              bumped its meta.json version (for pull requests)
//
// No dependencies (Node 20+). The manifest rules mirror the desktop app's validator
// (rattleboard-core/src/plugins.rs, manifest format 1 with the 1.1 additions: pick.where,
// pick.sort, pick.fields, pick.as, card.row, card.empty, template filters and fetch.sign),
// plus the community repo's own rules:
// no command plugins, https:// only, id == folder name, every placeholder declared.
// index.json is deterministic: plugins sorted by id, and "generated" is the newest "updated"
// date, so the same folders always give the same file.

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGINS = join(ROOT, "plugins");
const INDEX = join(ROOT, "index.json");
const REPO = "https://github.com/slastrina/rattleboard-plugins";
const RAW = "https://raw.githubusercontent.com/slastrina/rattleboard-plugins/main";
const TREE = `${REPO}/tree/main`;

const MANIFEST_FILE = "plugin.rattleboard-plugin.json";
const ALLOWED_FILES = new Set([MANIFEST_FILE, "meta.json", "README.md", "preview.json"]);
const TAGS = ["news", "weather", "sport", "finance", "transport", "space", "calendar", "fun", "home", "tech", "other"];
const KINDS = ["rss", "json", "ical", "text"]; // the desktop also has "command": never in this repo
const SETTING_TYPES = ["text", "number", "toggle", "select", "date", "time", "lines"];
const CHIPS = ["red", "orange", "yellow", "green", "blue", "violet", "white", "black"];
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const MAX_MANIFEST = 64 * 1024;
const MAX_README = 20 * 1024;
const MAX_PREVIEW = 32 * 1024;
const SET_BY_YOU = "set by you";
const OPS = ["==", "!=", ">", ">=", "<", "<=", "contains", "exists", "missing"];
const FILTERS = ["upper", "lower", "trim", "num", "round", "default", "pad", "time", "mins"];

// ------------------------------------------------------------------ helpers

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isStr = (v) => typeof v === "string";
const absent = (v) => v === undefined || v === null;
const chars = (s) => [...s].length;
const isUint = (v) => Number.isInteger(v) && v >= 0;

/** "30s", "15m", "1h", "1h30m", "90" or a whole number of seconds, as plugins.rs reads them. */
export function duration(v) {
  if (typeof v === "number") {
    if (!isUint(v)) throw new Error("Durations are whole seconds");
    return v;
  }
  if (!isStr(v)) throw new Error('Durations are like "30s", "15m" or "1h"');
  const s = v.trim().toLowerCase();
  const bad = () => new Error(`Unreadable duration ${JSON.stringify(s)}; use e.g. 30s, 15m or 1h`);
  if (/^\+?\d+$/.test(s)) return Number(s);
  let total = 0;
  let num = "";
  for (const c of s) {
    if (c >= "0" && c <= "9") {
      num += c;
      continue;
    }
    if (num === "") throw bad();
    const unit = { s: 1, m: 60, h: 3600, d: 86400 }[c];
    if (!unit) throw bad();
    total += Number(num) * unit;
    num = "";
  }
  if (num !== "" || (total === 0 && !s.startsWith("0"))) throw bad();
  return total;
}

/** Minutes since midnight for "HH:MM", or null. */
function minutes(t) {
  const s = t.trim();
  const i = s.indexOf(":");
  if (i < 0) return null;
  const [h, m] = [s.slice(0, i).trim(), s.slice(i + 1).trim()];
  if (!/^\+?\d+$/.test(h) || !/^\+?\d+$/.test(m)) return null;
  return Number(h) < 24 && Number(m) < 60 ? Number(h) * 60 + Number(m) : null;
}

/** The JSONPath subset: $, .key, ['key'], [n], [*]. */
export function parsePath(s) {
  s = s.trim();
  if (!s.startsWith("$")) throw new Error("a path starts with $");
  const cs = [...s.slice(1)];
  let i = 0;
  while (i < cs.length) {
    if (cs[i] === ".") {
      let j = i + 1;
      while (j < cs.length && cs[j] !== "." && cs[j] !== "[") j++;
      if (j === i + 1) throw new Error(`empty key in ${s}`);
      i = j;
    } else if (cs[i] === "[") {
      const end = cs.indexOf("]", i);
      if (end < 0) throw new Error(`unclosed [ in ${s}`);
      const inner = cs.slice(i + 1, end).join("").trim();
      const quoted = inner.length >= 2 && ((inner[0] === "'" && inner.at(-1) === "'") || (inner[0] === '"' && inner.at(-1) === '"'));
      if (!(inner === "*" || /^\+?\d+$/.test(inner) || quoted)) throw new Error(`[${inner}] must be a number, * or a quoted key`);
      i = end + 1;
    } else {
      throw new Error(`unexpected ${JSON.stringify(cs[i])} in ${s}`);
    }
  }
}

/** Replaces each {{...}} with "x", as the desktop does before checking a URL. */
function stripPlaceholders(s) {
  let out = "";
  let rest = s;
  for (;;) {
    const i = rest.indexOf("{{");
    if (i < 0) return out + rest;
    out += rest.slice(0, i);
    const j = rest.indexOf("}}", i);
    if (j < 0) return out;
    out += "x";
    rest = rest.slice(j + 2);
  }
}

/** Every {{name}} in a string, trimmed, without a :format or |filters. */
function placeholders(s) {
  return [...s.matchAll(/\{\{([^}]*)\}\}/g)].map((m) => m[1].split("|")[0].split(":")[0].trim());
}

/** Format 1.1: every {{...|filter[:arg]}} names a known filter with a valid argument. */
export function checkFilters(t, what) {
  for (const m of t.matchAll(/\{\{([^}]*)\}\}/g)) {
    for (const f of m[1].split("|").slice(1)) {
      const i = f.indexOf(":");
      const name = (i < 0 ? f : f.slice(0, i)).trim();
      const arg = i < 0 ? null : f.slice(i + 1);
      const int = (a) => (/^\s*[+-]?\d+\s*$/.test(a ?? "") ? Number(a) : NaN);
      const ok =
        (["upper", "lower", "trim", "num", "mins"].includes(name) && arg === null) ||
        (name === "round" && (arg === null || (/^\s*\+?\d+\s*$/.test(arg) && Number(arg) <= 6))) ||
        (name === "default" && arg !== null) ||
        (name === "pad" && Number.isInteger(int(arg)) && int(arg) !== 0 && Math.abs(int(arg)) <= 40) ||
        name === "time";
      if (!ok) throw new Error(FILTERS.includes(name) ? `${what}: |${f} has a missing or invalid argument` : `${what}: unknown filter |${name}; use ${FILTERS.join(", ")}`);
    }
  }
}

const optionValue = (o) => (isObj(o) && "value" in o ? o.value : o);
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const validKey = (k) => isStr(k) && k.length >= 1 && k.length <= 40 && /^[A-Za-z0-9_]+$/.test(k);
const HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

function checkSettingValue(spec, v) {
  const fail = (what) => {
    throw new Error(`must be a ${what}`);
  };
  switch (spec.type) {
    case "toggle":
      if (typeof v !== "boolean") fail("true or false");
      return;
    case "number":
      if (typeof v !== "number") fail("number");
      return;
    case "text":
      if (!isStr(v) || Buffer.byteLength(v) > 2000) fail("string");
      return;
    case "date":
      if (!isStr(v) || !(v === "" || validDate(v))) fail("date like 2026-12-25");
      return;
    case "time":
      if (!isStr(v) || !(v === "" || minutes(v) !== null)) fail("time like 07:30");
      return;
    case "select":
      if (!spec.options.some((o) => sameJson(optionValue(o), v))) throw new Error(`must be one of ${spec.options.map((o) => JSON.stringify(optionValue(o))).join(", ")}`);
      return;
    case "lines": {
      const a = isStr(v) ? v.split(/\r?\n/) : v;
      if (!Array.isArray(a) || a.length > 500 || !a.every((l) => isStr(l) && Buffer.byteLength(l) <= 500)) fail("list of lines");
      return;
    }
  }
}

function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// ------------------------------------------------------------------ manifest

/**
 * Validates a manifest as the desktop app does (format 1, not a built-in), then the community
 * rules. Returns the facts the index needs; throws with every problem found.
 */
export function checkManifest(m, folder) {
  const errors = [];
  const err = (msg) => errors.push(msg);
  const guard = (fn) => {
    try {
      fn();
    } catch (e) {
      err(e.message);
    }
  };
  if (!isObj(m)) throw new Error("A plugin manifest is a JSON object");
  if (Buffer.byteLength(JSON.stringify(m)) > MAX_MANIFEST) err("The manifest is too large (64 KB at most)");
  if (m.format !== 1) err(m.format === undefined ? 'The manifest needs "format": 1' : `This manifest is format ${JSON.stringify(m.format)}; Rattleboard reads format 1`);

  const str = (k, what = k) => {
    if (absent(m[k])) return "";
    if (!isStr(m[k])) {
      err(`${what} must be a string`);
      return "";
    }
    return m[k];
  };
  const id = str("id").trim();
  if (id.length < 3 || id.length > 100 || !/^[A-Za-z0-9._-]+$/.test(id)) err("id must be 3–100 letters, digits, dots, dashes or underscores, like com.example.news");
  if (id.startsWith("rattleboard.")) err("Ids starting with rattleboard. are kept for Rattleboard's built-ins");
  if (!/^[a-z0-9.-]+$/.test(id)) err("In this repo the id is lower-case letters, digits, dots and dashes, like community.hacker-news");
  if (folder !== undefined && id !== folder) err(`id ${JSON.stringify(id)} must equal the folder name ${JSON.stringify(folder)}`);
  const name = str("name").trim();
  if (chars(name) < 1 || chars(name) > 60) err("name must be 1 to 60 characters");
  str("description");
  const kind = str("kind");
  if (kind === "command") err("Command plugins aren't accepted here: they run programs on the user's computer, and plugin links refuse them");
  else if (!KINDS.includes(kind)) err(`kind must be one of ${KINDS.join(", ")}`);
  const http = ["rss", "json", "ical"].includes(kind);

  // fetch
  let url = "";
  let headers = {};
  let signKey = "";
  const f = m.fetch;
  if (!absent(f) && !isObj(f)) err("fetch must be an object");
  if (http) {
    if (!isObj(f)) err(`A ${kind} plugin needs fetch.url`);
    else {
      if (!absent(f.url) && !isStr(f.url)) err("fetch.url must be a string");
      url = isStr(f.url) ? f.url.trim() : "";
      if (!url) err(`A ${kind} plugin needs fetch.url`);
      else if (url.length > 2000) err("fetch.url is too long");
      else {
        if (!url.startsWith("https://")) err("fetch.url must start with https:// (written out, not from a placeholder)");
        guard(() => {
          const u = new URL(stripPlaceholders(url));
          if (u.protocol !== "https:") throw new Error("fetch.url must be https://");
        });
      }
      if (!absent(f.method) && (!isStr(f.method) || !["GET", "POST"].includes(f.method.toUpperCase()))) err("fetch.method must be GET or POST");
      if (!absent(f.headers)) {
        if (!isObj(f.headers)) err("fetch.headers must be an object of strings");
        else {
          if (Object.keys(f.headers).length > 20) err("At most 20 fetch.headers");
          for (const [k, v] of Object.entries(f.headers)) {
            if (!isStr(v)) err(`Header ${k} must be a string`);
            else if (!HEADER_NAME.test(k) || v.length > 4000) err(`Header ${k} isn't valid`);
          }
          headers = f.headers;
        }
      }
      guard(() => checkFilters(url, "fetch.url"));
      for (const v of Object.values(headers)) if (isStr(v)) guard(() => checkFilters(v, "fetch.headers"));
      if (!absent(f.sign)) {
        const g = f.sign;
        if (!isObj(g)) err("fetch.sign must be an object");
        else {
          if (!["hmac-sha1", "hmac-sha256"].includes(g.type)) err("fetch.sign.type must be hmac-sha1 or hmac-sha256");
          if (!isStr(g.key) || !g.key.trim() || g.key.trim().length > 500) err("fetch.sign.key must be the signing key, like {{secret.key}}");
          else signKey = g.key;
          if (!absent(g.over) && g.over !== "path+query") err(`fetch.sign.over ${JSON.stringify(g.over)} must be path+query`);
          if (!absent(g.param) && !(isStr(g.param) && /^[A-Za-z0-9_.-]{1,40}$/.test(g.param))) err("fetch.sign.param must be 1–40 letters, digits, _ . or -");
          if (!absent(g.case) && !["upper", "lower"].includes(g.case)) err(`fetch.sign.case ${JSON.stringify(g.case)} must be upper or lower`);
        }
      }
    }
  }
  if (!absent(m.run)) err('"run" is only for command plugins, which aren\'t accepted here');

  // every
  const everyV = [isObj(f) ? f.every : undefined, isObj(m.run) ? m.run.every : undefined, m.every].find((v) => !absent(v));
  const [minEvery, defEvery] = kind === "text" ? [10, 60] : [60, 900];
  let every = defEvery;
  if (!absent(everyV)) guard(() => (every = duration(everyV)));
  if (every < minEvery || every > 7 * 86400) err(`every must be at least ${minEvery === 60 ? "1m" : "10s"} for a ${kind} plugin`);

  // pick
  const pick = m.pick;
  if (!absent(pick)) {
    if (!isObj(pick)) err("pick must be an object");
    else
      for (const k of ["items", "id", "title", "body", "time"]) {
        const v = pick[k];
        if (absent(v)) continue;
        if (!isStr(v)) {
          err(`pick.${k} must be a string`);
          continue;
        }
        if (v.trim() && !v.includes("{{")) guard(() => {
          try {
            parsePath(v);
          } catch (e) {
            throw new Error(`pick.${k}: ${e.message}`);
          }
        });
      }
  }
  // Format 1.1 pick additions
  const fieldNames = [];
  const whenSettings = [];
  const whereValues = [];
  let status = false;
  const path11 = (v, what) => {
    if (!isStr(v) || !v.trim()) return err(`${what} needs a path like $.name`);
    if (v.length > 2000) return err(`${what} is too long`);
    if (!v.includes("{{"))
      guard(() => {
        try {
          parsePath(v);
        } catch (e) {
          throw new Error(`${what}: ${e.message}`);
        }
      });
  };
  if (isObj(pick)) {
    const extra = ["fields", "where", "sort", "as"].filter((k) => !absent(pick[k]));
    if (extra.length && kind !== "json") err("pick.fields, pick.where, pick.sort and pick.as are for json plugins");
    if (!absent(pick.fields)) {
      if (!isObj(pick.fields) || Object.keys(pick.fields).length > 20) err("pick.fields must be an object of at most 20 names and paths");
      else
        for (const [k, v] of Object.entries(pick.fields)) {
          if (!validKey(k)) err(`pick.fields name ${JSON.stringify(k)} must be letters, digits or _`);
          fieldNames.push(k);
          if (Array.isArray(v) && v.length >= 1 && v.length <= 5) v.forEach((p) => path11(p, `pick.fields.${k}`));
          else if (isStr(v)) path11(v, `pick.fields.${k}`);
          else err(`pick.fields.${k} must be a path or a list of up to 5 paths`);
        }
    }
    if (!absent(pick.where)) {
      if (!Array.isArray(pick.where) || pick.where.length > 20) err("pick.where must be a list of at most 20 conditions");
      else
        for (const c of pick.where) {
          if (!isObj(c)) {
            err('each pick.where condition is an object like {"path": "$.x", "op": "==", "value": 1}');
            continue;
          }
          path11(c.path, "pick.where");
          if (!OPS.includes(c.op)) err(`pick.where op ${JSON.stringify(c.op)} must be one of ${OPS.join(" ")}`);
          const unary = c.op === "exists" || c.op === "missing";
          if (unary && !absent(c.value)) err(`pick.where ${c.op} takes no value`);
          if (!unary && absent(c.value)) err(`pick.where ${c.op} needs a value`);
          if (!absent(c.value)) {
            if (!["string", "number", "boolean"].includes(typeof c.value)) err("pick.where value must be a string, number or true/false");
            if (isStr(c.value)) {
              if (c.value.length > 500) err("pick.where value is too long");
              if (c.value.includes("{{secret.")) err("Secrets can't be used in pick.where");
              guard(() => checkFilters(c.value, "pick.where value"));
              whereValues.push(c.value);
            }
          }
          if (!absent(c.when)) {
            const w = c.when;
            const is = isObj(w) ? (isStr(w.is) ? [w.is] : w.is) : null;
            if (!isObj(w) || !isStr(w.setting) || !Array.isArray(is) || is.length < 1 || is.length > 20 || !is.every(isStr)) err('pick.where when must be {"setting": "key", "is": ["value"]}');
            else whenSettings.push(w.setting);
          }
        }
    }
    if (!absent(pick.sort)) {
      const so = pick.sort;
      if (!isObj(so)) err('pick.sort must be {"path": "$.x", "order": "asc"}');
      else {
        path11(so.path, "pick.sort");
        if (!absent(so.order) && !["asc", "desc"].includes(so.order)) err(`pick.sort.order ${JSON.stringify(so.order)} must be asc or desc`);
        if (!absent(so.numeric) && typeof so.numeric !== "boolean") err("pick.sort.numeric must be true or false");
      }
    }
    if (!absent(pick.as) && !["feed", "status"].includes(pick.as)) err(`pick.as ${JSON.stringify(pick.as)} must be feed or status`);
    status = pick.as === "status";
    if ((!absent(pick.where) || !absent(pick.sort) || status) && !(isStr(pick.items) && pick.items.trim())) err("pick.where, pick.sort and pick.as need pick.items (the list)");
  }

  // card
  const card = m.card;
  let template = "";
  const cardExtra = [];
  if (!absent(card)) {
    if (!isObj(card)) err("card must be an object");
    else {
      if (!absent(card.template)) {
        if (!isStr(card.template)) err("card.template must be a string");
        else {
          template = card.template;
          if (template.length > 2000) err("card.template is too long");
          if (template.includes("{{secret.")) err("Secrets can only be used in fetch.url and fetch.headers, never in card.template");
          guard(() => checkFilters(template, "card.template"));
        }
      }
      for (const k of ["row", "empty"]) {
        const t = card[k];
        if (absent(t)) continue;
        if (!isStr(t)) {
          err(`card.${k} must be a string`);
          continue;
        }
        if (t.length > 2000) err(`card.${k} is too long`);
        if (t.includes("{{secret.")) err(`Secrets can only be used in fetch.url and fetch.headers, never in card.${k}`);
        guard(() => checkFilters(t, `card.${k}`));
        cardExtra.push(t);
        if (t.trim() && !status) err('card.row and card.empty are for "pick": {"as": "status"}');
      }
      const c = card.chip;
      if (!absent(c)) {
        if (isStr(c)) {
          if (c !== "" && c !== "none" && !CHIPS.includes(c.toLowerCase())) err(`Unknown chip colour ${JSON.stringify(c)}; use ${CHIPS.join(", ")}`);
        } else if (typeof c === "number") {
          if (!(Number.isInteger(c) && c >= 63 && c <= 70)) err("A chip code must be from 63 to 70");
        } else err("chip must be a colour name");
      }
      if (!absent(card.align) && !["center", "centre", "left"].includes(card.align)) err(`card.align ${JSON.stringify(card.align)} must be center or left`);
      if (!absent(card.pages) && !(Number.isInteger(card.pages) && card.pages >= 1 && card.pages <= 3)) err("card.pages must be 1, 2 or 3");
    }
  }
  if (kind === "json" && !(isObj(pick) && isStr(pick.title) && pick.title.trim()) && !template.trim()) err("A json plugin needs pick.title (a path like $.title) or a card.template");
  if (kind === "text" && !template.trim()) err("A text plugin needs a card.template");

  if (!absent(m.priority) && !["ambient", "alert"].includes(m.priority)) err(`priority ${JSON.stringify(m.priority)} must be ambient or alert`);
  if (!absent(m.alertWhen)) {
    if (!Array.isArray(m.alertWhen) || m.alertWhen.length > 50) err('alertWhen must be a list like ["keyword:launch"]');
    else for (const w of m.alertWhen) if (!isStr(w) || !w.startsWith("keyword:") || !w.slice(8).trim()) err(`alertWhen entries look like "keyword:launch", not ${JSON.stringify(w)}`);
  }
  if (!absent(m.maxItems) && !(Number.isInteger(m.maxItems) && m.maxItems >= 1 && m.maxItems <= 50)) err("maxItems must be from 1 to 50");
  if (!absent(m.dwell))
    guard(() => {
      const d = duration(m.dwell);
      if (d < 10 || d > 3600) throw new Error("dwell must be from 10s to 1h");
    });

  // schedule
  const s = m.schedule;
  if (!absent(s)) {
    if (!isObj(s)) err("schedule must be an object");
    else {
      if (!absent(s.days)) {
        if (!Array.isArray(s.days)) err('schedule.days must be a list like ["mon", "tue"]');
        else for (const d of s.days) if (!DAYS.some((x) => (isStr(d) ? d.toLowerCase() : "").startsWith(x))) err(`Unknown day ${JSON.stringify(d)}; use mon, tue, wed, thu, fri, sat, sun`);
      }
      const t = (k) => {
        const v = s[k];
        if (absent(v) || (isStr(v) && !v.trim())) return false;
        if (!isStr(v) || minutes(v) === null) err(`schedule.${k} must be HH:MM`);
        return true;
      };
      if (t("from") !== t("to")) err("A schedule needs both from and to, or neither");
    }
  }

  // settings and secrets
  const settings = [];
  if (!absent(m.settings)) {
    if (!Array.isArray(m.settings) || m.settings.length > 30) err("settings must be a list of at most 30");
    else
      for (const x of m.settings) {
        if (!isObj(x)) {
          err("each setting must be an object");
          continue;
        }
        const key = isStr(x.key) ? x.key : "";
        if (!validKey(key) || settings.some((y) => y.key === key)) {
          err(`Setting key ${JSON.stringify(key)} must be unique letters, digits or _`);
          continue;
        }
        if (!absent(x.label) && !isStr(x.label)) err(`Setting ${key}: label must be a string`);
        if (!absent(x.type) && !isStr(x.type)) err(`Setting ${key}: type must be a string`);
        const type = isStr(x.type) ? x.type : "text";
        if (!SETTING_TYPES.includes(type)) {
          err(`Setting ${key}: type must be one of ${SETTING_TYPES.join(", ")}`);
          continue;
        }
        if (!absent(x.options) && !Array.isArray(x.options)) err(`Setting ${key}: options must be a list`);
        const options = Array.isArray(x.options) ? x.options : [];
        if (type === "select" && !options.length) err(`Setting ${key}: a select needs options`);
        const spec = { key, label: [...(isStr(x.label) ? x.label : key)].slice(0, 60).join(""), type, options };
        if (!absent(x.default))
          guard(() => {
            try {
              checkSettingValue(spec, x.default);
            } catch (e) {
              throw new Error(`Setting ${key}: ${e.message}`);
            }
          });
        settings.push(spec);
      }
  }
  const secrets = [];
  if (!absent(m.secrets)) {
    if (!Array.isArray(m.secrets) || m.secrets.length > 10) err("secrets must be a list of at most 10");
    else
      for (const x of m.secrets) {
        const key = isObj(x) && isStr(x.key) ? x.key : "";
        if (!validKey(key) || secrets.some((y) => y.key === key) || settings.some((y) => y.key === key)) {
          err(`Secret key ${JSON.stringify(key)} must be unique letters, digits or _`);
          continue;
        }
        secrets.push({ key, label: [...(isObj(x) && isStr(x.label) ? x.label : key)].slice(0, 60).join("") });
      }
  }

  // Community rule: every {{settings.x}} / {{secret.x}} refers to something declared.
  const used = [url, signKey, ...Object.values(headers).filter(isStr), template, ...cardExtra, ...whereValues, ...(isObj(pick) ? Object.values(pick).filter(isStr) : [])].flatMap(placeholders);
  for (const p of [template, ...cardExtra].flatMap(placeholders)) if (p.startsWith("field.") && !fieldNames.includes(p.slice(6))) err(`{{${p}}} is used but pick.fields has no "${p.slice(6)}"`);
  for (const k of whenSettings) if (!settings.some((x) => x.key === k)) err(`pick.where: when.setting ${JSON.stringify(k)} isn't one of the settings`);
  for (const p of used) {
    if (p.startsWith("settings.") && !settings.some((x) => x.key === p.slice(9))) err(`{{${p}}} is used but there's no setting "${p.slice(9)}"`);
    if (p.startsWith("secret.") && !secrets.some((x) => x.key === p.slice(7))) err(`{{${p}}} is used but there's no secret "${p.slice(7)}"`);
  }
  if (isObj(pick) && Object.values(pick).some((v) => isStr(v) && v.includes("{{secret."))) err("Secrets can't be used in pick paths");

  if (errors.length) throw new Error(errors.join("\n"));
  return { id, name, kind, url, every, settings, secrets };
}

/** The host names a URL template fetches from; a host made from placeholders is "set by you". */
export function hostsOf(url) {
  if (!url) return [];
  const authority = url.replace(/^https:\/\//, "").split(/[/?#]/)[0];
  if (authority.includes("{{")) return [SET_BY_YOU];
  return [new URL(stripPlaceholders(url)).hostname.toLowerCase()];
}

// ------------------------------------------------------------------ meta.json and preview.json

const META_KEYS = new Set(["$schema", "name", "summary", "author", "tags", "version", "license", "homepage", "needsSecrets", "updated", "minAppVersion"]);
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function checkMeta(meta, manifestFacts) {
  const errors = [];
  const err = (m) => errors.push(`meta.json: ${m}`);
  if (!isObj(meta)) throw new Error("meta.json must be a JSON object");
  for (const k of Object.keys(meta)) if (!META_KEYS.has(k)) err(`unknown field "${k}"`);
  if (!isStr(meta.name) || chars(meta.name.trim()) < 1 || chars(meta.name) > 60) err("name must be 1 to 60 characters");
  if (!isStr(meta.summary) || chars(meta.summary.trim()) < 1 || chars(meta.summary) > 120) err("summary must be 1 to 120 characters");
  const a = meta.author;
  if (!isObj(a)) err('author must be an object like {"name": "Sam", "github": "slastrina"}');
  else {
    for (const k of Object.keys(a)) if (!["name", "github"].includes(k)) err(`author: unknown field "${k}"`);
    if (!isStr(a.name) || chars(a.name.trim()) < 1 || chars(a.name) > 100) err("author.name must be 1 to 100 characters");
    if (!absent(a.github) && (!isStr(a.github) || !/^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(a.github))) err("author.github must be a GitHub username");
  }
  if (!Array.isArray(meta.tags) || meta.tags.length < 1 || meta.tags.length > 5) err(`tags must be a list of 1 to 5 from: ${TAGS.join(", ")}`);
  else {
    for (const t of meta.tags) if (!TAGS.includes(t)) err(`unknown tag ${JSON.stringify(t)}; use ${TAGS.join(", ")}`);
    if (new Set(meta.tags).size !== meta.tags.length) err("tags must not repeat");
  }
  if (!isStr(meta.version) || !SEMVER.test(meta.version)) err('version must be semver, like "1.0.0"');
  if (!isStr(meta.license) || !/^[A-Za-z0-9.+\-() ]{1,64}$/.test(meta.license)) err('license must be an SPDX id like "MIT"');
  if (!absent(meta.homepage)) {
    let ok = isStr(meta.homepage) && meta.homepage.startsWith("https://");
    try {
      ok = ok && new URL(meta.homepage).protocol === "https:";
    } catch {
      ok = false;
    }
    if (!ok) err("homepage must be an https:// address");
  }
  if (typeof meta.needsSecrets !== "boolean") err("needsSecrets must be true or false");
  else if (manifestFacts && meta.needsSecrets !== manifestFacts.secrets.length > 0) err(`needsSecrets must be ${manifestFacts.secrets.length > 0} (the manifest declares ${manifestFacts.secrets.length} secret(s))`);
  if (!isStr(meta.updated) || !validDate(meta.updated)) err('updated must be a date like "2026-10-19"');
  if (!absent(meta.minAppVersion) && (!isStr(meta.minAppVersion) || !SEMVER.test(meta.minAppVersion))) err('minAppVersion must be semver, like "0.7.0"');
  if (errors.length) throw new Error(errors.join("\n"));
}

export function checkPreview(p) {
  const bad = (m) => {
    throw new Error(`preview.json: ${m}`);
  };
  if (!isObj(p)) bad('must be {"rows": 6, "cols": 22, "characters": [[...]]}');
  for (const k of Object.keys(p)) if (!["rows", "cols", "characters"].includes(k)) bad(`unknown field "${k}"`);
  if (!Number.isInteger(p.rows) || p.rows < 1 || p.rows > 12) bad("rows must be 1 to 12");
  if (!Number.isInteger(p.cols) || p.cols < 1 || p.cols > 40) bad("cols must be 1 to 40");
  if (!Array.isArray(p.characters) || p.characters.length !== p.rows) bad(`characters must have ${p.rows} rows`);
  for (const row of p.characters) {
    if (!Array.isArray(row) || row.length !== p.cols) bad(`each row of characters must have ${p.cols} codes`);
    if (!row.every((c) => Number.isInteger(c) && c >= 0 && c <= 71)) bad("character codes are whole numbers from 0 to 71");
  }
  if (p.characters.every((r) => r.every((c) => c === 0))) bad("the preview card is blank");
}

// ------------------------------------------------------------------ the folders

function readJson(path, what) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new Error(`${what} is missing`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${what} isn't valid JSON: ${e.message}`);
  }
}

function checkFolder(folder) {
  const dir = join(PLUGINS, folder);
  const errors = [];
  const files = readdirSync(dir);
  for (const f of files) {
    if (!ALLOWED_FILES.has(f)) errors.push(`unexpected file "${f}" (a folder holds only ${[...ALLOWED_FILES].join(", ")})`);
    else if (!statSync(join(dir, f)).isFile()) errors.push(`"${f}" must be a file`);
  }
  if (!/^[a-z0-9.-]{3,100}$/.test(folder)) errors.push("the folder name is the plugin id: 3–100 lower-case letters, digits, dots or dashes");
  let facts = null;
  let meta = null;
  try {
    facts = checkManifest(readJson(join(dir, MANIFEST_FILE), MANIFEST_FILE), folder);
  } catch (e) {
    errors.push(...e.message.split("\n").map((m) => (m.startsWith(MANIFEST_FILE) ? m : `${MANIFEST_FILE}: ${m}`)));
  }
  try {
    meta = readJson(join(dir, "meta.json"), "meta.json");
    checkMeta(meta, facts);
  } catch (e) {
    errors.push(...e.message.split("\n").map((m) => (m.startsWith("meta.json") ? m : `meta.json: ${m}`)));
  }
  const hasReadme = files.includes("README.md");
  if (hasReadme && statSync(join(dir, "README.md")).size > MAX_README) errors.push("README.md must be at most 20 KB");
  const hasPreview = files.includes("preview.json");
  if (hasPreview) {
    if (statSync(join(dir, "preview.json")).size > MAX_PREVIEW) errors.push("preview.json must be at most 32 KB");
    else
      try {
        checkPreview(readJson(join(dir, "preview.json"), "preview.json"));
      } catch (e) {
        errors.push(e.message);
      }
  }
  if (errors.length) return { folder, errors };
  const base = `${RAW}/plugins/${folder}`;
  return {
    folder,
    errors,
    entry: {
      id: facts.id,
      name: meta.name,
      summary: meta.summary,
      author: absent(meta.author.github) ? { name: meta.author.name } : { name: meta.author.name, github: meta.author.github },
      tags: meta.tags,
      version: meta.version,
      license: meta.license,
      homepage: meta.homepage ?? null,
      kind: facts.kind,
      needsSecrets: meta.needsSecrets,
      minAppVersion: meta.minAppVersion ?? null,
      settings: facts.settings.map((s) => ({ key: s.key, label: s.label, type: s.type })),
      secrets: facts.secrets.map((s) => ({ key: s.key, label: s.label })),
      hosts: hostsOf(facts.url),
      manifestUrl: `${base}/${MANIFEST_FILE}`,
      readmeUrl: hasReadme ? `${base}/README.md` : null,
      previewUrl: hasPreview ? `${base}/preview.json` : null,
      folderUrl: `${TREE}/plugins/${folder}`,
      updated: meta.updated,
    },
  };
}

export function buildIndex() {
  const folders = existsSync(PLUGINS) ? readdirSync(PLUGINS).filter((f) => !f.startsWith(".") && statSync(join(PLUGINS, f)).isDirectory()) : [];
  const stray = existsSync(PLUGINS) ? readdirSync(PLUGINS).filter((f) => !f.startsWith(".") && !statSync(join(PLUGINS, f)).isDirectory()) : [];
  const results = folders.sort().map(checkFolder);
  for (const f of stray) results.push({ folder: f, errors: ["plugins/ holds only one folder per plugin"] });
  const plugins = results.filter((r) => r.entry).map((r) => r.entry).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const newest = plugins.map((p) => p.updated).sort().at(-1) ?? "2026-10-19";
  const index = { format: 1, generated: `${newest}T00:00:00Z`, repo: REPO, plugins };
  return { results, json: JSON.stringify(index, null, 2) + "\n" };
}

// ------------------------------------------------------------------ version bumps (pull requests)

function semverCmp(a, b) {
  const pa = SEMVER.exec(a);
  const pb = SEMVER.exec(b);
  if (!pa || !pb) return 0;
  for (let i = 1; i <= 3; i++) if (Number(pa[i]) !== Number(pb[i])) return Number(pa[i]) - Number(pb[i]);
  if (pa[4] === pb[4]) return 0;
  if (!pa[4]) return 1; // 1.0.0 > 1.0.0-beta
  if (!pb[4]) return -1;
  return pa[4] < pb[4] ? -1 : 1;
}

function checkBumps(base) {
  const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const changed = git("diff", "--name-only", `${base}...HEAD`).split("\n").filter(Boolean);
  const ids = [...new Set(changed.filter((p) => p.startsWith("plugins/")).map((p) => p.split("/")[1]))].sort();
  const problems = [];
  const touched = [];
  for (const id of ids) {
    let before = null;
    try {
      before = JSON.parse(git("show", `${base}:plugins/${id}/meta.json`)).version;
    } catch {
      before = null; // a new plugin
    }
    if (!existsSync(join(PLUGINS, id))) {
      touched.push(`${id} (removed)`);
      continue;
    }
    touched.push(before ? `${id} (changed)` : `${id} (new)`);
    if (before) {
      let now = null;
      try {
        now = JSON.parse(readFileSync(join(PLUGINS, id, "meta.json"), "utf8")).version;
      } catch {}
      if (!now || semverCmp(now, before) <= 0) problems.push(`${id}: the plugin changed, so bump "version" in meta.json (it's ${before} on ${base})`);
    }
  }
  return { touched, problems };
}

// ------------------------------------------------------------------ main

function main() {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const validateOnly = args.includes("--validate-only");
  const baseAt = args.indexOf("--base");
  const base = baseAt >= 0 ? args[baseAt + 1] : null;

  const { results, json } = buildIndex();
  let failed = false;
  for (const r of results) {
    if (r.errors.length) {
      failed = true;
      console.error(`✗ plugins/${r.folder}`);
      for (const e of r.errors) console.error(`    ${e}`);
      // GitHub Actions annotation
      if (process.env.GITHUB_ACTIONS) console.log(`::error file=plugins/${r.folder}/${MANIFEST_FILE}::${r.errors.join("%0A")}`);
    } else console.log(`✓ plugins/${r.folder}`);
  }
  if (base) {
    const { touched, problems } = checkBumps(base);
    if (touched.length > 1) console.log(`! This change touches ${touched.length} plugins (${touched.join(", ")}); please send one plugin per pull request.`);
    for (const p of problems) {
      failed = true;
      console.error(`✗ ${p}`);
    }
  }
  if (failed) {
    console.error("\nValidation failed.");
    process.exit(1);
  }
  const count = results.length;
  if (check) {
    const current = existsSync(INDEX) ? readFileSync(INDEX, "utf8") : "";
    if (current !== json) {
      console.error("\n✗ index.json is out of date (or was edited by hand). Run `npm run build-index`, or leave index.json out of your change: it's regenerated when the change is merged.");
      process.exit(1);
    }
    console.log(`\n${count} plugin(s) valid; index.json is up to date.`);
  } else if (validateOnly) {
    console.log(`\n${count} plugin(s) valid.`);
  } else {
    writeFileSync(INDEX, json);
    console.log(`\n${count} plugin(s) valid; wrote index.json.`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
