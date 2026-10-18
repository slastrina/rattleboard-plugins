<!-- Thanks for sharing a plugin! See CONTRIBUTING.md for the full guide. One plugin per pull request, please. -->

**Plugin:** `plugins/<id>/`
**What it shows:**
**Where the data comes from (service + link to its terms or docs):**

### Checklist

- [ ] The folder name and the manifest's `"id"` are the same (lower-case, like `community.my-plugin`)
- [ ] `kind` is `rss`, `json`, `ical` or `text` (no `command` plugins)
- [ ] Every address is `https://`
- [ ] No API keys, tokens or personal addresses in any file: anything private is a `secrets` entry, and `meta.json` has `"needsSecrets": true`
- [ ] The service's terms allow this use, and `every` is gentle on it (no faster than the data really changes)
- [ ] I installed it in Rattleboard and checked the preview at Standard (6×22) and Compact (3×15)
- [ ] `preview.json` is from a real card (Export or the steps in CONTRIBUTING.md)
- [ ] `meta.json` is filled in; for an update, `version` is bumped
- [ ] `npm run validate` passes
- [ ] I didn't edit `index.json` (it's regenerated after merging)
- [ ] I'm happy for this plugin to be published under the license in `meta.json` (MIT unless stated)
