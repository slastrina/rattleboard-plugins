# Script plugin conformance vectors

Every Rattleboard engine that runs script plugins (`"kind": "script"`) runs these: the desktop and Rattleboard Web (Rust and QuickJS), Android (QuickJS) and the Apple apps (JavaScriptCore). An engine conforms when every vector here passes.

- `script/NNN-name.json`: one vector each: a script, the input it runs with, canned answers for its fetches, and what must come out.
- `script-prelude.js`: the JavaScript half of the script API, which every engine evaluates word for word before the plugin's module. It's a copy of the desktop's `crates/rattleboard-core/src/script_prelude.js`; keep them identical (`scripts/sync-conformance.sh` in the desktop repository copies it here and the vectors there).

## A vector

```json
{
  "name": "fetch-host-not-allowed",
  "about": "A host outside the allow-list is refused before anything is sent.",
  "script": "export default async function (ctx) { ... }",
  "input": {
    "now": 1792363260000, "local": "2026-10-19T09:41:00", "utcOffset": 660,
    "board": { "rows": 6, "cols": 22 }, "name": "Test",
    "settings": {}, "secrets": { "token": "abc" }, "store": {},
    "hosts": ["api.example.com"]
  },
  "fetch": [
    { "method": "GET", "url": "https://api.example.com/x",
      "response": { "status": 200, "headers": { "content-type": "application/json" }, "body": "{}", "delayMs": 0 } }
  ],
  "expect": {
    "output": { "type": "card", "pages": [{ "text": "..." }], "color": null, "align": null, "link": null, "priority": "ambient", "id": null, "dwell": null },
    "requests": [{ "method": "GET", "url": "https://api.example.com/x", "headers": {}, "body": null }],
    "store": {}, "log": [], "render": { "pages": [["22 characters per row", "..."]] }
  }
}
```

- `input.secrets` are the declared secrets with their values (`""` is declared but not set). `input.hosts` is the manifest's allow-list.
- `fetch` answers requests by method and exact URL (after secrets are filled in). A request with no answer fails as a network error. `delayMs` is pretend time: it counts against the 15 s limit, but nothing sleeps. `"fail": "too_large"` (or `timeout`, `network`, `redirect_not_allowed`) fails the request that way instead of answering.
- `expect.output` is the checked result in canonical form; or `expect.error` is the error kind (or a list of kinds an engine may report), with `expect.message` when the exact text is defined.
- Optional: `requests` (exactly what was sent, header names lower-case), `store` (the store after the run), `log` (the log lines), `render` (the card on the board, in the tile notation of the format 1.1 spec: letters as themselves, colour tiles as `r o y g b v w k`, `█` for filled).

The porting spec describes the API, limits and error semantics these test.
