// Run with `npm test`. The manifest cases mirror the desktop app's own tests
// (rattleboard-core/src/plugins.rs, `manifests`), so the two validators stay in step.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkManifest, checkMeta, checkPreview, duration, parsePath, hostsOf } from "./build-index.mjs";

const hn = () => ({
  format: 1, id: "community.hn", name: "Hacker News", kind: "rss",
  fetch: { url: "https://hnrss.org/frontpage", every: "15m" }, card: { chip: "orange", pages: 2 },
  alertWhen: ["keyword:launch"], dwell: "30s", futureField: { ignored: true },
  schedule: { days: ["mon", "tue"], from: "07:00", to: "10:00" },
  settings: [{ key: "city", label: "City", type: "text", default: "Melbourne" }],
  secrets: [{ key: "token", label: "API token" }],
});

test("a good manifest passes", () => {
  const f = checkManifest(hn(), "community.hn");
  assert.equal(f.every, 900);
  assert.deepEqual(f.secrets, [{ key: "token", label: "API token" }]);
});

test("the desktop's refusals are refused here too", () => {
  const cases = [
    ["format", 2, "format 2"],
    ["format", undefined, '"format": 1'],
    ["id", "x", "id must be"],
    ["id", "rattleboard.clock", "built-ins"],
    ["id", "has space", "id must be"],
    ["name", "", "name must be"],
    ["kind", "shell", "kind must be"],
    ["kind", "native", "kind must be"],
    ["fetch", undefined, "needs fetch.url"],
    ["fetch", { url: "http://example.com/feed" }, "https://"],
    ["fetch", { url: "ftp://example.com/feed" }, "https://"],
    ["fetch", { url: "https://a.b/", every: "30s" }, "at least 1m"],
    ["fetch", { url: "https://a.b/", method: "DELETE" }, "GET or POST"],
    ["fetch", { url: "https://a.b/", headers: { X: 3 } }, "Header X"],
    ["card", { template: "{{secret.token}}" }, "never in card.template"],
    ["card", { chip: "pink" }, "Unknown chip"],
    ["card", { pages: 4 }, "pages"],
    ["card", { align: "right" }, "center or left"],
    ["priority", "urgent", "ambient or alert"],
    ["alertWhen", ["launch"], "keyword:"],
    ["maxItems", 0, "maxItems"],
    ["dwell", "5s", "dwell"],
    ["schedule", { days: ["funday"] }, "Unknown day"],
    ["schedule", { from: "7am", to: "10:00" }, "HH:MM"],
    ["schedule", { from: "07:00" }, "both"],
    ["settings", [{ key: "a b" }], "Setting key"],
    ["settings", [{ key: "a", type: "colour" }], "type must be"],
    ["settings", [{ key: "a", type: "select" }], "needs options"],
    ["settings", [{ key: "a", type: "toggle", default: "yes" }], "true or false"],
    ["secrets", [{ key: "city" }], "Secret key"],
  ];
  for (const [k, v, msg] of cases) {
    const m = hn();
    if (k === "id" && v !== undefined) m.id = v;
    if (v === undefined) delete m[k];
    else m[k] = v;
    assert.throws(() => checkManifest(m), (e) => e.message.includes(msg), `${k}=${JSON.stringify(v)}`);
  }
});

test("community rules", () => {
  const cmd = { format: 1, id: "community.git", name: "Git", kind: "command", run: { path: "/usr/bin/git" } };
  assert.throws(() => checkManifest(cmd, "community.git"), /Command plugins/);
  assert.throws(() => checkManifest(hn(), "community.other"), /must equal the folder name/);
  const local = { ...hn(), fetch: { url: "http://192.168.1.20/feed" } };
  assert.throws(() => checkManifest(local, "community.hn"), /https:\/\//);
  const templated = { ...hn(), fetch: { url: "{{settings.url}}" }, settings: [{ key: "url", type: "text" }], secrets: [] };
  assert.throws(() => checkManifest(templated, "community.hn"), /https:\/\//);
  const undeclared = { ...hn(), fetch: { url: "https://x.io/?q={{settings.nope}}&k={{secret.key}}" } };
  assert.throws(() => checkManifest(undeclared, "community.hn"), (e) => /no setting "nope"/.test(e.message) && /no secret "key"/.test(e.message));
  const upper = { ...hn(), id: "Community.HN" };
  assert.throws(() => checkManifest(upper, "Community.HN"), /lower-case/);
  const text = { format: 1, id: "community.t", name: "T", kind: "text", every: "5s", card: { template: "{{now:HH:mm}}" } };
  assert.throws(() => checkManifest(text, "community.t"), /10s/);
  const json = { format: 1, id: "community.iss", name: "ISS", kind: "json", fetch: { url: "https://api.wheretheiss.at/v1/satellites/25544" } };
  assert.throws(() => checkManifest(json, "community.iss"), /pick.title/);
  assert.throws(() => checkManifest({ ...json, pick: { title: "$.latitude", body: "$[x]" } }, "community.iss"), /pick.body/);
  assert.ok(checkManifest({ ...json, pick: { title: "$.latitude", body: "$.longitude" } }, "community.iss"));
});

test("durations and paths", () => {
  for (const [s, n] of [["30s", 30], ["15m", 900], ["1h", 3600], ["1h30m", 5400], ["90", 90], ["0", 0], [45, 45]]) assert.equal(duration(s), n);
  for (const bad of ["", "m", "5x", "1.5m", "abc"]) assert.throws(() => duration(bad));
  for (const ok of ["$", "$.list[*].title", "$.list[1].id", "$['a.b'].c"]) parsePath(ok);
  for (const bad of ["list", "$.", "$[x]", "$[1", "$..a"]) assert.throws(() => parsePath(bad));
});

test("hosts", () => {
  assert.deepEqual(hostsOf("https://API.example.com/x?q={{settings.q}}"), ["api.example.com"]);
  assert.deepEqual(hostsOf("https://{{settings.host}}/api"), ["set by you"]);
});

test("meta.json and preview.json", () => {
  const facts = { secrets: [] };
  const meta = { name: "HN", summary: "s", author: { name: "Sam", github: "slastrina" }, tags: ["news"], version: "1.0.0", license: "MIT", needsSecrets: false, updated: "2026-10-19" };
  checkMeta(meta, facts);
  assert.throws(() => checkMeta({ ...meta, needsSecrets: true }, facts), /needsSecrets must be false/);
  assert.throws(() => checkMeta({ ...meta, tags: ["memes"] }, facts), /unknown tag/);
  assert.throws(() => checkMeta({ ...meta, version: "1.0" }, facts), /semver/);
  assert.throws(() => checkMeta({ ...meta, homepage: "http://x.io" }, facts), /https/);
  assert.throws(() => checkMeta({ ...meta, summary: "x".repeat(121) }, facts), /summary/);
  assert.throws(() => checkMeta({ ...meta, updated: "2026-02-30" }, facts), /updated/);
  const row = (c) => Array(22).fill(c);
  checkPreview({ rows: 6, cols: 22, characters: [row(1), row(0), row(0), row(0), row(0), row(0)] });
  assert.throws(() => checkPreview({ rows: 6, cols: 22, characters: [row(0)] }), /6 rows/);
  assert.throws(() => checkPreview({ rows: 1, cols: 22, characters: [row(72)] }), /0 to 71/);
  assert.throws(() => checkPreview({ rows: 1, cols: 22, characters: [row(0)] }), /blank/);
});
