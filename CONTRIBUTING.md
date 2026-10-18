# Making and sharing a Rattleboard plugin

This guide walks you through writing a plugin, testing it on your own board, and sending it to this repository so everyone can install it from **Community plugins** in the app. You don't need to know how to program, and you don't need to have made a pull request before.

**Contents**

1. [The rules](#1-the-rules)
2. [Write the manifest](#2-write-the-manifest)
   - [Worked example: an RSS feed](#example-1-an-rss-feed)
   - [Worked example: a JSON API](#example-2-a-json-api)
   - [Worked example: a plugin with settings](#example-3-a-plugin-with-settings)
   - [Every field](#every-field)
   - [Placeholders](#placeholders)
   - [How the card is laid out](#how-the-card-is-laid-out)
   - [Plugins that need a key](#plugins-that-need-a-key)
3. [Test it on your board](#3-test-it-on-your-board)
4. [Add the other files](#4-add-the-other-files)
5. [Send it in](#5-send-it-in)
6. [Updating a plugin](#6-updating-a-plugin)
7. [Requesting a plugin](#7-requesting-a-plugin)

---

## 1. The rules

Every plugin here is checked against these before it's merged. Most are checked automatically.

- **No command plugins.** `kind` is `rss`, `json`, `ical` or `text`. Command plugins run programs on the user's computer; they can be shared as files, but not here, and Rattleboard refuses them from links.
- **HTTPS only.** `fetch.url` starts with `https://`, written out in full (not built from a setting). Plain `http://` to a home server works in the app, but not in a shared plugin.
- **No keys, tokens or personal details in any file.** If the service needs a key, declare it under `secrets` and the user enters their own (see [Plugins that need a key](#plugins-that-need-a-key)). Don't put your own address, location, calendar link or account name in a default either, unless it's an obvious example.
- **Respect the service.** Use only feeds and APIs whose terms allow this kind of use, keep within their rate limits, and set `every` no faster than the data really changes: news every 15 minutes, prices every 15 minutes or more, daily things every few hours. Remember that every user's board fetches on its own schedule. If a service asks for attribution, say so in the plugin's README.
- **The folder name is the plugin's id.** Lower-case letters, digits, dots and dashes, reverse-DNS style: `community.my-plugin`, or `io.github.yourname.my-plugin`. `rattleboard.` is reserved.
- **Bump the version** in `meta.json` every time the plugin changes.
- **Include a `preview.json`**, made from a real card.
- **One plugin per pull request.**
- **License.** Plugins are MIT unless `meta.json` says otherwise. By sending one, you agree to publish it under that license.
- Keep it friendly: nothing hateful, adult or deceptive, and nothing that shows other people's private information.

## 2. Write the manifest

A plugin is one JSON file named `plugin.rattleboard-plugin.json`. Any text editor works. If your editor understands JSON Schema (VS Code does), add this line at the top to get autocomplete and warnings as you type:

```json
"$schema": "https://raw.githubusercontent.com/slastrina/rattleboard-plugins/main/schema/plugin.schema.json",
```

There are four kinds of plugin:

| `kind` | What it does |
| --- | --- |
| `rss` | Reads an RSS or Atom feed. Each new item is shown once, as it arrives. |
| `json` | Reads a JSON API. Either one value shown as it is now (a price, a position), or a list of items shown once each, like a feed. |
| `ical` | Reads an iCal calendar and shows the next event, with an alert 10 minutes before it starts. |
| `text` | Fetches nothing: its card is made from its template, for example the day of the week. |

### Example 1: an RSS feed

The simplest kind. This is the Hacker News plugin from this repository:

```json
{
  "format": 1,
  "id": "community.hacker-news",
  "name": "Hacker News",
  "description": "New stories from the Hacker News front page, one per card",
  "kind": "rss",
  "fetch": { "url": "https://hnrss.org/frontpage", "every": "15m" },
  "card": { "chip": "orange", "pages": 2 },
  "maxItems": 10,
  "dwell": "30s"
}
```

- `format` is always `1`.
- `id` is unique to your plugin, and is also its folder's name.
- `name` and `description` are what people see in **Settings → Sources**.
- `fetch.url` is the feed's address; `every` is how often to check it.
- `card.chip` is the colour tile in the card's corner. `pages: 2` lets a long headline continue on a second card instead of being cut off.
- `maxItems` is how many unseen stories to keep waiting at most; `dwell` is how long each card stays up.

With no `card.template`, an RSS card has the source's name and the time along the top and the headline below:

```
o HACKER NEWS     8:36
                      
SHOW HN: WHATSAPP MCP 
   RUNNING FREE ON    
      CLOUDFLARE      
```

### Example 2: a JSON API

A JSON plugin needs to know which values to take from the response. Say `https://api.wheretheiss.at/v1/satellites/25544` answers:

```json
{ "name": "iss", "latitude": 12.37, "longitude": -151.1, "altitude": 422.9, "visibility": "daylight" }
```

The ISS plugin picks the latitude as the item's **title** and the longitude as its **body**, then lays them out with a template:

```json
{
  "format": 1,
  "id": "community.iss-position",
  "name": "ISS position",
  "description": "Where the International Space Station is right now (no key needed)",
  "kind": "json",
  "fetch": { "url": "https://api.wheretheiss.at/v1/satellites/25544", "every": "2m" },
  "pick": { "title": "$.latitude", "body": "$.longitude" },
  "card": { "template": "ISS NOW\nLAT {{title}}\nLON {{body}}\n{{now:h:mm tt}}", "chip": "blue" },
  "dwell": "30s"
}
```

- `pick` uses a small part of JSONPath: `$` is the whole response, `.key` goes into an object, `['key']` does the same for keys with dots or spaces, `[0]` takes an item from a list and `[*]` takes every item. So `$.results[0].name` is "the `name` of the first entry in `results`".
- Each pick (`title`, `body`, and optionally `id` and `time`) fills the placeholder of the same name in the template. Numbers are shown with at most two decimal places.
- `\n` in the template starts a new line. `{{now:h:mm tt}}` is the time now, like `9:46 AM`.

The card:

```
b                     
       ISS NOW        
       LAT 9.91       
     LON -149.27      
       9:46 AM        
```

**Lists of items.** If the API returns a list of things to show one by one (articles, alerts, departures), add `"items"` with a path to every item, and write the other picks relative to one item:

```json
"pick": { "items": "$.articles[*]", "id": "$.id", "title": "$.headline", "body": "$.summary", "time": "$.published" }
```

Each item is then shown once, like a feed item. `id` is how Rattleboard knows it has shown an item already (without it, the title and body are used). `time` may be ISO 8601 (`2026-10-19T09:00:00Z`), RFC 2822, or seconds or milliseconds since 1970.

Without `items`, the whole response is one value, shown as it is whenever its turn comes.

### Example 3: a plugin with settings

Settings let each user fill in their own details. They appear as fields in the source's settings, and `{{settings.<key>}}` puts their values into the address, the template, or even the pick paths. The exchange-rate plugin:

```json
{
  "format": 1,
  "id": "community.exchange-rate",
  "name": "Exchange rate",
  "description": "The latest reference exchange rate between two currencies (no key needed)",
  "kind": "json",
  "fetch": { "url": "https://api.frankfurter.dev/v1/latest?from={{settings.from}}&to={{settings.to}}", "every": "1h" },
  "pick": { "title": "$.rates.{{settings.to}}", "body": "$.date" },
  "card": { "template": "{{settings.from}} TO {{settings.to}}\n{{title}}\nECB {{body}}", "chip": "green" },
  "dwell": "30s",
  "settings": [
    { "key": "from", "label": "From", "type": "select", "default": "USD", "options": ["AUD", "EUR", "GBP", "USD"] },
    { "key": "to", "label": "To", "type": "select", "default": "EUR", "options": ["AUD", "EUR", "GBP", "USD"] }
  ]
}
```

- The API answers `{"base": "USD", "date": "2026-10-16", "rates": {"EUR": 0.88865}}`, so the title path becomes `$.rates.EUR` for someone who chose EUR.
- A `select` keeps values exactly as the API expects them (here, upper case). Prefer it to free text when the choices are known.
- Values put into the URL are URL-encoded for you, so a city like `New York` arrives as `New%20York`. (That also means a `/` in a value is encoded: use two settings, like the GitHub stars plugin's owner and repository, rather than one `owner/repo` setting.)

The card, for USD to EUR:

```
g                     
      USD TO EUR      
         0.89         
    ECB 2026-10-16    
```

### Every field

Only `format`, `id`, `name` and `kind` are always needed. Unknown fields are ignored by the app, so `"$schema"` is fine.

| Field | |
| --- | --- |
| `format` | `1` |
| `id` | Your plugin's id: 3–100 lower-case letters, digits, dots or dashes, the same as its folder name. Installing a plugin with the same id updates it. |
| `name` | 1–60 characters, shown in Settings → Sources |
| `description` | Up to 300 characters, shown under the name |
| `kind` | `rss`, `json`, `ical` or `text` |
| `fetch` | For `rss`, `json` and `ical`: `url` (`https://`, up to 2000 characters), optional `method` (`GET` or `POST`), optional `headers` (up to 20, like `{"Accept": "application/json"}`) and `every`: how often to fetch, at least `1m`, at most `7d`, default `15m`. Each fetch has 10 seconds and may be up to 2 MB. |
| `every` | For `text` plugins (at the top level): how often the card is redrawn, at least `10s`, default `1m` |
| `pick` | For `json`: `items` (optional), `id`, `title`, `body` and `time`, as JSONPath (see [example 2](#example-2-a-json-api)). A `json` plugin needs `pick.title` or a `card.template`. RSS, Atom and iCal need no `pick`. |
| `card.template` | The card's text, laid out over the whole board (up to 2000 characters). Without one, the card shows the source's name and the time across the top and the item below. |
| `card.chip` | The corner colour: `red`, `orange`, `yellow`, `green`, `blue`, `violet`, `white` or `black` |
| `card.align` | `center` (default) or `left` |
| `card.pages` | `1`, `2` or `3`: long text continues on up to this many cards. Words are never split. |
| `priority` | `ambient` (default) or `alert`: every new item interrupts the rotation for a minute. Use sparingly. |
| `alertWhen` | Keywords that make a new item interrupt: `["keyword:outage", "keyword:launch"]` |
| `maxItems` | 1–50 items taken from each fetch (default 10) |
| `dwell` | How long the card stays up, `10s` to `1h`. Users can change it. |
| `schedule` | When it may show: `{"days": ["mon", "tue", "wed", "thu", "fri"], "from": "07:00", "to": "10:00"}`. No days means every day; `from`/`to` may run past midnight. |
| `settings` | Up to 30 fields for the user: `key` (letters, digits, `_`), `label`, `type` and `default`. Types: `text`, `number`, `toggle`, `select` (with `options`: values, or `{"value": …, "label": …}`), `date` (`2026-12-25`), `time` (`07:30`) and `lines` (a list, one per line). |
| `secrets` | Up to 10 private values, like API keys: `key` and `label`. See [Plugins that need a key](#plugins-that-need-a-key). |

Durations are written like `30s`, `15m`, `1h`, `1h30m` or `1d`, or as a number of seconds.

### Placeholders

Placeholders go in `fetch.url`, `fetch.headers`, `card.template` and `pick` paths:

| Placeholder | |
| --- | --- |
| `{{settings.city}}` | The value of the setting with key `city` (URL-encoded inside an address) |
| `{{secret.key}}` | A secret's value. **Only in `fetch.url` and `fetch.headers`**: never in a template or a pick. |
| `{{name}}` | The source's name |
| `{{title}}`, `{{body}}` | The item's title and body (from `pick`, or the feed item's title and summary) |
| `{{time}}`, `{{time:HH:mm}}` | The item's time, or a calendar event's start |
| `{{now}}`, `{{now:ddd d MMM}}` | The time now, in the board's time zone |

Time formats use `yyyy` `yy` (year), `MMMM` `MMM` `MM` `M` (October, Oct, 10, 10), `dddd` `ddd` (Monday, Mon), `dd` `d` (day of the month, 05 or 5), `HH` `H` (24-hour), `hh` `h` (12-hour), `mm` (minutes), `ss` (seconds) and `tt` (AM/PM). Text in `[brackets]` is kept as it is: `{{now:[WEEK OF] d MMM}}`. Dates work in addresses too, as in the On this day plugin: `https://…/onthisday/selected/{{now:MM}}/{{now:dd}}`.

Every `{{settings.…}}` and `{{secret.…}}` you use must be declared under `settings` or `secrets`; the checks will tell you if one isn't.

### How the card is laid out

- A board is a grid of tiles: Standard boards are 6 rows of 22, Compact boards 3 rows of 15. Your plugin should read well on both.
- Tiles show `A`–`Z`, `0`–`9`, the symbols `! @ # $ ( ) - + & = ; : ' " % , . / ?` and `°`, and colour tiles. Text is upper-cased, accents are dropped (`é` shows as `E`), and anything else shows as a blank.
- A template is word-wrapped and centred; `\n` starts a new line. If it doesn't fit, it continues on the next page (up to `card.pages`), and after that it's cut off.
- The `card.chip` colour goes in the top-left corner when that tile is free, so you don't need to add one yourself.
- Colour codes add colour tiles anywhere in a template: `{r}` red, `{o}` orange, `{y}` yellow, `{g}` green, `{b}` blue, `{v}` violet, `{w}` white, `{k}` black, or by number `{63}` to `{70}` (`{71}` is a filled tile). For example, `"{g}{g} OPEN {g}{g}"`. Each code takes one tile, so count them when you check the width.
- Short lines work best: under 15 characters fits both sizes without wrapping. "RISE 6:28:11 AM" fits a Compact row exactly; "SUNRISE 6:28:11 AM" would wrap.

### Plugins that need a key

Some services need an API key. Never put a key in the plugin. Declare a secret instead:

```json
"fetch": { "url": "https://api.nasa.gov/planetary/apod?api_key={{secret.key}}", "every": "3h" },
"secrets": [{ "key": "key", "label": "NASA API key (api.nasa.gov, or DEMO_KEY)" }]
```

or, for services that want the key in a header:

```json
"fetch": { "url": "https://api.example.com/v1/status", "headers": { "Authorization": "Bearer {{secret.token}}" } },
"secrets": [{ "key": "token", "label": "API token" }]
```

Each user enters their own key in the source's settings. Rattleboard keeps it in the device's credential store, only ever sends it to the address in `fetch`, and never shows it, logs it or exports it. In `meta.json`, set `"needsSecrets": true`, and say in the plugin's README where to get a key and whether it's free.

## 3. Test it on your board

Before you send a plugin in, make sure it really works. You need the Rattleboard desktop app (or Rattleboard Web).

1. **Import it.** Open **Settings → Sources** and drop your `plugin.rattleboard-plugin.json` on it, or choose **Import…**. If anything is wrong with the file, Rattleboard says what. Fix it and import again: importing the same `id` replaces the old one.
2. **Add it as a source.** Choose **Add source…**, pick your plugin, and fill in its settings (and key, if it has one).
3. **Look at the preview.** The source's preview shows its card in real flaps, as it would look right now, fetched live. If it says something like "Nothing found at $.results[*]" or "The server answered HTTP 404", check the address and pick paths against the real response (open the address in a browser to see it).
4. **Check both sizes.** In **Settings → Display → Size**, choose **Standard (6 × 22)** and check the preview; then choose **Compact (3 × 15)** and check it again. Nothing important should be cut off on either.
5. **Leave it running for a while** in the rotation, to make sure it keeps working and that new items arrive as you expect.

### Make preview.json

`preview.json` is the sample card people see before they install. Make it from the real thing:

1. Set the board to **Standard (6 × 22)**, and turn on the API server (**Settings → API server**) so you have its key.
2. In a copy of this repository (see [step 5](#5-send-it-in)), run:

   ```sh
   RATTLEBOARD_KEY=<your API key> node tools/make-preview.mjs community.my-plugin
   ```

   It asks your board for the card your source shows right now and saves its first page as `plugins/community.my-plugin/preview.json`. Use `--url http://<address>:7070` if the board isn't on this computer, and `--source <id>` if you have more than one source using the plugin.

If you'd rather write it by hand, it looks like this: `rows` and `cols`, then one list of tile codes per row (0 is blank, 1–26 are A–Z, 27–36 are 1–9 and 0, 37–62 are punctuation, 63–70 are colours and 71 is filled):

```json
{
  "rows": 6,
  "cols": 22,
  "characters": [
    [67,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,9,19,19,0,14,15,23,0,0,0,0,0,0,0,0],
    …
  ]
}
```

## 4. Add the other files

Each plugin has its own folder, named after its id:

```
plugins/community.my-plugin/
  plugin.rattleboard-plugin.json    the manifest (required)
  meta.json                         directory details (required)
  README.md                         a longer description, shown in the app (recommended)
  preview.json                      the sample card (required for new plugins)
```

No other files go in the folder.

**meta.json** describes the plugin in the directory:

```json
{
  "name": "My plugin",
  "summary": "One sentence about what it shows, up to 120 characters.",
  "author": { "name": "Your Name", "github": "your-github-username" },
  "tags": ["news"],
  "version": "1.0.0",
  "license": "MIT",
  "homepage": "https://example.com",
  "needsSecrets": false,
  "updated": "2026-10-19"
}
```

- `tags`: one to five of `news`, `weather`, `sport`, `finance`, `transport`, `space`, `calendar`, `fun`, `home`, `tech`, `other`.
- `version`: start at `1.0.0` and bump it on every change ([semver](https://semver.org): `1.0.1` for a fix, `1.1.0` for something new, `2.0.0` if users need to set it up again).
- `license`: an [SPDX id](https://spdx.org/licenses/); `MIT` unless you have a reason.
- `homepage` (optional): the service's or your page, `https://`.
- `needsSecrets`: `true` if, and only if, the manifest has `secrets`.
- `updated`: today's date, as `YYYY-MM-DD`.

For autocomplete in your editor, `meta.json` can start with `"$schema": "https://raw.githubusercontent.com/slastrina/rattleboard-plugins/main/schema/meta.schema.json"`. Any other field is refused, to catch typos.

**README.md** is shown in the app as plain text, so keep the formatting simple: a title, short paragraphs and lists. Say what the card shows, what each setting means, where the data comes from (with its terms or attribution, if it asks for any), how often it updates, and for a plugin with a key, how to get one.

## 5. Send it in

Contributions arrive as a **pull request**: a request to add your folder to this repository. GitHub does the hard parts. You need a free [GitHub account](https://github.com/signup).

### The easy way: in your browser

1. Open [github.com/slastrina/rattleboard-plugins](https://github.com/slastrina/rattleboard-plugins) and press **Fork** (top right), then **Create fork**. You now have your own copy.
2. In your fork, open the `plugins` folder, then choose **Add file → Create new file**.
3. In the name box, type `community.my-plugin/plugin.rattleboard-plugin.json` (typing the `/` makes the folder). Paste your manifest, then **Commit changes…** → **Commit changes**.
4. Open your new folder and use **Add file → Create new file** again for `meta.json`, `README.md` and `preview.json` (or **Add file → Upload files** to drag all of them in at once).
5. GitHub shows a banner, "This branch is 1 commit ahead". Choose **Contribute → Open pull request**.
6. Give it a title like "Add My plugin", fill in the checklist (type `x` between the brackets: `[x]`), and choose **Create pull request**.

### With git on your computer

```sh
gh repo fork slastrina/rattleboard-plugins --clone   # or fork on github.com, then git clone your fork
cd rattleboard-plugins
git checkout -b add-my-plugin
mkdir plugins/community.my-plugin
# add plugin.rattleboard-plugin.json, meta.json, README.md and preview.json
npm run validate                                     # needs Node 20 or later; nothing to install
git add plugins/community.my-plugin
git commit -m "Add My plugin"
git push -u origin add-my-plugin
gh pr create --fill                                  # or open the pull request on github.com
```

`npm run validate` runs the same checks as the pull request. `npm test` checks the checker itself.

**Don't edit `index.json`.** It's rebuilt automatically after your plugin is merged. (If you do include it, it must be exactly what `npm run build-index` produces.)

### What happens next

- The **Validate** check runs on your pull request within a minute or two. If it fails, open **Details** to see what's wrong (for example, `meta.json: needsSecrets must be true`), fix the file in your fork, and the check runs again by itself.
- A maintainer then reviews it. They'll look at:
  - whether the service allows this use, and whether `every` is gentle enough on it;
  - that it fetches only from the addresses it shows, over `https://`, and asks for no more than it needs;
  - that the card reads well at Standard and Compact sizes, and `preview.json` matches what it really shows;
  - that the name, summary and README are clear, and the settings have sensible defaults;
  - that it isn't a duplicate of an existing plugin (improving that one is better).
- They may ask for changes in the pull request's comments. Push more commits to the same branch (or edit the files in your fork) and the pull request updates.
- Once merged, your plugin appears in **Community plugins** in every app within a day (apps refresh the list daily, or straight away with **Refresh**).

## 6. Updating a plugin

To fix or improve a plugin (yours or anyone's), change its files the same way, and in `meta.json` **bump `version`** and set `updated` to today. The check fails if a plugin changed but its version didn't go up. Users who installed it see **Update available** in the app.

Keep the same `id`, so an update replaces the installed plugin instead of adding a second one. If you add a setting, give it a default so existing sources keep working.

## 7. Requesting a plugin

Would you like a plugin but don't want to build it? [Open a plugin request](https://github.com/slastrina/rattleboard-plugins/issues/new?template=plugin-request.yml): say what you'd like on the card and, if you know it, where the data could come from. Requests that use a public, keyless `https://` feed or API are the most likely to be picked up. Feel free to pick up someone else's request, too: mention it in your pull request.

Problems with the Rattleboard apps themselves go to the [Rattleboard repository](https://github.com/slastrina/rattleboard/issues).
