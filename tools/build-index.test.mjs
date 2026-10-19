// Run with `npm test`. The manifest cases mirror the desktop app's own tests
// (rattleboard-core/src/plugins.rs, `manifests`), so the two validators stay in step.
import { test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { checkManifest, checkMeta, checkPreview, checkFilters, duration, parsePath, hostsOf, checkHost, checkScript, stripLiterals } from "./build-index.mjs";

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

// Format 1.1, mirroring rattleboard-core/src/plugins.rs `manifest_format_1_1`.
const list = (pick, card = {}) => ({
  format: 1, id: "community.list", name: "List", kind: "json", fetch: { url: "https://example.com/x" }, pick, card,
  settings: [{ key: "phase", type: "select", default: "departures", options: ["departures", "arrivals", "airborne"] }, { key: "dir", type: "text", default: "" }],
});

test("format 1.1: a status list with where, sort, fields and filters passes", () => {
  checkManifest(list(
    { items: "$.ac[*]", title: "$.flight", as: "status", fields: { type: "$.t", alt: ["$.alt_baro", "$.alt_geom"] },
      where: [{ path: "$.alt_baro", op: "!=", value: "ground" }, { path: "$.baro_rate", op: ">", value: 300, when: { setting: "phase", is: "departures" } }, { path: "$.r", op: "exists" }, { path: "$.d", op: "==", value: "{{settings.dir}}" }],
      sort: { path: "$.alt_baro", order: "asc", numeric: true } },
    { template: "{{settings.phase|upper}}\n{{rows}}", row: "{{title|pad:8}}{{field.type}} {{field.alt|num}} FT", empty: "Nothing nearby" }), "community.list");
});

test("format 1.1: the desktop's refusals are refused here too", () => {
  const cases = [
    [{ items: "$.a[*]", title: "$.t", where: [{ path: "$.x", op: "=~", value: 1 }] }, {}, 'op "=~"'],
    [{ items: "$.a[*]", title: "$.t", where: [{ path: "$.x", op: "==" }] }, {}, "needs a value"],
    [{ items: "$.a[*]", title: "$.t", where: [{ path: "$.x", op: "exists", value: 1 }] }, {}, "takes no value"],
    [{ items: "$.a[*]", title: "$.t", where: [{ path: "x", op: "exists" }] }, {}, "starts with $"],
    [{ items: "$.a[*]", title: "$.t", where: [{ path: "$.x", op: "==", value: [1] }] }, {}, "string, number"],
    [{ items: "$.a[*]", title: "$.t", where: [{ path: "$.x", op: "==", value: "{{secret.k}}" }] }, {}, "Secrets"],
    [{ items: "$.a[*]", title: "$.t", where: [{ path: "$.x", op: "==", value: 1, when: { setting: "nope", is: "a" } }] }, {}, "when.setting"],
    [{ title: "$.t", where: [{ path: "$.x", op: "exists" }] }, {}, "need pick.items"],
    [{ items: "$.a[*]", title: "$.t", sort: { path: "$.x", order: "up" } }, {}, "asc or desc"],
    [{ items: "$.a[*]", title: "$.t", sort: { path: "$.x", numeric: "yes" } }, {}, "numeric"],
    [{ items: "$.a[*]", title: "$.t", fields: { "a b": "$.x" } }, {}, "pick.fields name"],
    [{ items: "$.a[*]", title: "$.t", fields: { a: "$[x]" } }, {}, "pick.fields.a"],
    [{ items: "$.a[*]", title: "$.t", fields: { a: [] } }, {}, "up to 5 paths"],
    [{ items: "$.a[*]", title: "$.t", as: "table" }, {}, "feed or status"],
    [{ items: "$.a[*]", title: "$.t" }, { row: "{{title}}" }, "card.row and card.empty"],
    [{ title: "$.t" }, { template: "{{title|shout}}" }, "unknown filter |shout"],
    [{ title: "$.t" }, { template: "{{title|pad:0}}" }, "|pad:0"],
    [{ title: "$.t" }, { template: "{{title|round:9}}" }, "|round:9"],
    [{ title: "$.t" }, { template: "{{title|default}}" }, "|default"],
    [{ title: "$.t" }, { template: "{{field.nope}}" }, 'pick.fields has no "nope"'],
  ];
  for (const [pick, card, msg] of cases) assert.throws(() => checkManifest(list(pick, card), "community.list"), (e) => e.message.includes(msg), `${JSON.stringify(pick)} ${JSON.stringify(card)}`);
  const rss = { format: 1, id: "community.r", name: "R", kind: "rss", fetch: { url: "https://example.com/f" }, pick: { fields: { a: "$.a" } } };
  assert.throws(() => checkManifest(rss, "community.r"), /json plugins/);
  checkManifest(list({ items: "$.hits[*]", title: "$.title", link: "$.url" }), "community.list");
  assert.throws(() => checkManifest(list({ items: "$.hits[*]", title: "$.title", link: "$[bad" }), "community.list"), /pick.link/);
  assert.throws(() => checkManifest({ ...rss, pick: { link: "$.url" } }, "community.r"), /json plugins/);
  for (const ok of ["{{a|upper|lower|trim|num|mins}}", "{{a|round}}{{a|round:2}}{{a|default:-}}{{a|pad:-3}}{{a|time}}{{a|time:h:mm tt}}", "{{now-2h:epoch}}"]) checkFilters(ok, "t");
});

test("format 1.1: fetch.sign", () => {
  const signed = (sign, secrets = [{ key: "key" }]) => ({
    format: 1, id: "community.ptv", name: "PTV", kind: "json",
    fetch: { url: "https://timetableapi.ptv.vic.gov.au/v3/departures/route_type/0/stop/{{settings.stop}}?devid={{settings.devid}}", sign },
    pick: { title: "$.status.version" }, settings: [{ key: "stop" }, { key: "devid" }], secrets,
  });
  checkManifest(signed({ type: "hmac-sha1", key: "{{secret.key}}" }), "community.ptv");
  checkManifest(signed({ type: "hmac-sha256", key: "{{secret.key}}", over: "path+query", param: "sig", case: "lower" }), "community.ptv");
  for (const [sign, msg] of [
    [{ type: "md5", key: "k" }, "hmac-sha1 or hmac-sha256"],
    [{ type: "hmac-sha1" }, "fetch.sign.key"],
    [{ type: "hmac-sha1", key: "k", over: "url" }, "path+query"],
    [{ type: "hmac-sha1", key: "k", param: "a b" }, "fetch.sign.param"],
    [{ type: "hmac-sha1", key: "k", case: "mixed" }, "upper or lower"],
    ["hmac", "must be an object"],
  ]) assert.throws(() => checkManifest(signed(sign), "community.ptv"), (e) => e.message.includes(msg), JSON.stringify(sign));
  assert.throws(() => checkManifest(signed({ type: "hmac-sha1", key: "{{secret.key}}" }, []), "community.ptv"), /no secret "key"/);
});

test("minAppVersion", () => {
  const meta = { name: "HN", summary: "s", author: { name: "Sam" }, tags: ["news"], version: "1.0.0", license: "MIT", needsSecrets: false, updated: "2026-10-19" };
  checkMeta({ ...meta, minAppVersion: "0.7.0" }, { secrets: [] });
  assert.throws(() => checkMeta({ ...meta, minAppVersion: "0.7" }, { secrets: [] }), /minAppVersion must be semver/);
});

// ---------------------------------------------------------------- script plugins (0.8.0)

const joke = () => ({
  format: 1, id: "community.joke", name: "Joke", kind: "script", script: "script.js",
  hosts: ["icanhazdadjoke.com", "*.Example.org"], every: "1h",
  settings: [{ key: "lang", type: "text", default: "en" }], secrets: [{ key: "token", label: "Token" }],
});

test("script plugins: a good manifest passes", () => {
  const f = checkManifest(joke(), "community.joke");
  assert.deepEqual(f.hosts, ["icanhazdadjoke.com", "*.example.org"]);
  assert.equal(f.script, "script.js");
  assert.equal(f.every, 3600);
  // No hosts: it may run as often as every 10 s, and defaults to a minute.
  const pure = { ...joke(), hosts: [] };
  delete pure.every;
  assert.equal(checkManifest(pure).every, 60);
  assert.equal(checkManifest({ ...pure, every: "10s" }).every, 10);
});

test("script plugins: refusals", () => {
  const cases = [
    [{ hosts: undefined }, 'needs "hosts"'],
    [{ hosts: "x.com" }, "hosts must be a list"],
    [{ hosts: ["https://x.com"] }, "isn't a host name"],
    [{ hosts: ["*.com"] }, "too broad"],
    [{ hosts: ["192.168.1.10"] }, "public host name"],
    [{ hosts: ["homeassistant.local"] }, "public host name"],
    [{ hosts: ["printer"] }, "public host name"],
    [{ every: "30s" }, "at least 1m"],
    [{ script: undefined }, '"script": "script.js"'],
    [{ script: "../x.js" }, '"script": "script.js"'],
    [{ scriptInline: "export default () => 1" }, "not scriptInline"],
    [{ fetch: { url: "https://x.com" } }, "ctx.fetch"],
    [{ pick: { title: "$.x" } }, "pick is for json"],
    [{ card: { template: "{{title}}" } }, "card.template"],
    [{ permissions: ["fs"] }, "permissions"],
  ];
  for (const [patch, msg] of cases) {
    const m = { ...joke(), ...patch };
    for (const k of Object.keys(patch)) if (patch[k] === undefined) delete m[k];
    assert.throws(() => checkManifest(m), (e) => e.message.includes(msg), JSON.stringify(patch));
  }
  // The script-only fields aren't for other kinds.
  assert.throws(() => checkManifest({ ...hn(), hosts: ["x.com"] }), /only for script plugins/);
});

test("script plugins: hosts", () => {
  assert.equal(checkHost("API.Example.com."), "api.example.com");
  assert.equal(checkHost("*.example.co.uk"), "*.example.co.uk");
  for (const h of ["", "a..b", "-a.com", "a_b.com", "x.com/path", "localhost", "10.0.0.1"]) assert.throws(() => checkHost(h), undefined, h);
});

test("script plugins: the code", () => {
  const ok = (src) => checkScript(Buffer.from(src));
  ok("export default async function (ctx) { const r = await ctx.fetch('https://x.com/'); return (await r.json()).joke; }");
  ok("// import x from 'y' in a comment\nexport default () => 'import(\"x\")';");
  ok("const importance = 1; export default () => importance;");
  assert.throws(() => ok("import x from 'y';\nexport default () => x;"), /can't import/);
  assert.throws(() => ok("export default async () => (await import('y')).default;"), /can't import/);
  assert.throws(() => ok("export default () => eval('1');"), /eval and Function/);
  assert.throws(() => ok("export default () => new Function('return 1')();"), /eval and Function/);
  assert.throws(() => ok("export function f() {}"), /default export/);
  assert.throws(() => ok("export default function ( {"), /doesn't parse/);
  assert.throws(() => checkScript(Buffer.alloc(64 * 1024 + 1, 32)), /64 KB/);
  assert.throws(() => checkScript(Buffer.from([0x65, 0xff, 0xfe])), /./);
  assert.equal(stripLiterals("a('x') /* c */ b // d\nc").replace(/\s+/g, " "), "a( 0 ) b c");
});

test("script plugins need Rattleboard 0.8.0", () => {
  const meta = { name: "J", summary: "S", author: { name: "A" }, tags: ["fun"], version: "1.0.0", license: "MIT", needsSecrets: true, updated: "2026-10-19" };
  const facts = checkManifest(joke());
  assert.throws(() => checkMeta(meta, facts), /0\.8\.0/);
  assert.throws(() => checkMeta({ ...meta, minAppVersion: "0.7.0" }, facts), /0\.8\.0/);
  checkMeta({ ...meta, minAppVersion: "0.8.0" }, facts);
  checkMeta({ ...meta, minAppVersion: "1.0.0" }, facts);
});

test("conformance vectors are well formed", () => {
  const dir = new URL("../conformance/script/", import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  assert.ok(files.length >= 50);
  const names = new Set();
  for (const f of files) {
    const v = JSON.parse(readFileSync(new URL(f, dir), "utf8"));
    assert.match(f, /^\d{3}-[a-z0-9-]+\.json$/, f);
    assert.equal(f.slice(4, -5), v.name, f);
    assert.ok(!names.has(v.name), `two vectors called ${v.name}`);
    names.add(v.name);
    assert.equal(typeof v.script, "string", f);
    for (const k of ["now", "local", "utcOffset", "board", "settings", "secrets", "store", "hosts"]) assert.ok(k in v.input, `${f}: input.${k}`);
    assert.ok(("output" in v.expect) !== ("error" in v.expect), `${f}: expect.output or expect.error`);
  }
});
