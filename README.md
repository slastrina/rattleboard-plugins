# Rattleboard community plugins

Plugins for [Rattleboard](https://github.com/slastrina/rattleboard), the split-flap message board for your desktop, phone, tablet and TV, shared by the people who use it.

A plugin is one small JSON file that adds a **source** to your board's rotation: a news feed, a JSON API, a calendar or a text card. Plugins here need no code, and they only ever fetch from the `https://` addresses they list.

**Want to make one?** Read the step-by-step guide in **[CONTRIBUTING.md](CONTRIBUTING.md)**. It takes you from an empty file to a merged pull request, even if you've never opened one before.

## Plugins

| Plugin | What it shows | Key needed |
| --- | --- | --- |
| [Hacker News](plugins/community.hacker-news) | New front-page stories | No |
| [BBC World News](plugins/community.bbc-world) | New world headlines | No |
| [ISS position](plugins/community.iss-position) | Where the space station is now | No |
| [On this day](plugins/community.on-this-day) | An event from history on today's date | No |
| [Exchange rate](plugins/community.exchange-rate) | The rate between two currencies | No |
| [Bitcoin price](plugins/community.bitcoin-price) | Price and 24-hour change | No |
| [Sunrise and sunset](plugins/community.sunrise-sunset) | Today's times for a place | No |
| [GitHub stars](plugins/community.github-repo-stars) | A repository's star count | No |

The full list, with authors, versions and the hosts each plugin contacts, is [`index.json`](index.json).

## Installing a plugin

**From the app.** In Rattleboard, open **Settings → Sources** and choose **Community plugins**. Search or filter by tag, open a plugin to see what it shows, which addresses it contacts and what it asks for, then choose **Install**. When a newer version is published, the button says **Update**.

**From a link.** Every plugin can also be installed with a `rattleboard://plugin` link to its manifest. Paste it into **Settings → Sources → Add source…**, or open it on a device with Rattleboard installed:

```
rattleboard://plugin?url=https://raw.githubusercontent.com/slastrina/rattleboard-plugins/main/plugins/community.hacker-news/plugin.rattleboard-plugin.json
```

**From a file.** Download a plugin's `plugin.rattleboard-plugin.json` and drop it on **Settings → Sources** in the desktop app, or choose it with **Import…**.

Whichever way you choose, Rattleboard shows you the plugin and asks before installing it. Then add it to the rotation and fill in its settings. If it needs a key, enter it in the source's settings: keys are kept in your device's credential store, never in the plugin file.

## What's in this repository

```
plugins/<id>/                       one folder per plugin; the folder name is the plugin's id
  plugin.rattleboard-plugin.json    the manifest the app installs
  meta.json                         directory details: name, summary, author, tags, version, license
  README.md                         a longer description, shown in the app
  preview.json                      a sample card, shown in the app before you install
index.json                          the directory the apps read (generated: never edit it by hand)
schema/                             JSON Schemas for the manifest and meta.json, for your editor
tools/build-index.mjs               checks every plugin and writes index.json
tools/make-preview.mjs              saves preview.json from a card on your own board
.github/                            the checks that run on every pull request, and the templates
```

The apps read `index.json` from
`https://raw.githubusercontent.com/slastrina/rattleboard-plugins/main/index.json`. A GitHub Action rebuilds it whenever a change is merged.

## Contributing

New plugins and improvements are welcome. In short:

- Plugins are `rss`, `json`, `ical` or `text` only. **No `command` plugins**: they run programs on someone's computer, and Rattleboard refuses them from links.
- Every address is `https://`.
- **No keys or tokens in any file.** Declare a `secrets` field and the user enters their own.
- Respect the service's terms and rate limits, and fetch no more often than the data changes.
- The folder name is the plugin's `id`; bump `version` in `meta.json` on every change; include a `preview.json`.
- One plugin per pull request.

The full guide, with worked examples, is **[CONTRIBUTING.md](CONTRIBUTING.md)**. To ask for a plugin you'd like someone else to build, [open a plugin request](https://github.com/slastrina/rattleboard-plugins/issues/new?template=plugin-request.yml).

### Create your own

1. Write a `plugin.rattleboard-plugin.json` (start from one of the [examples in the guide](CONTRIBUTING.md#2-write-the-manifest)).
2. Import it into Rattleboard and check its card at Standard and Compact sizes.
3. Fork this repository, add `plugins/<your-id>/` with the manifest, `meta.json`, `README.md` and `preview.json`, run `npm run validate`, and open a pull request.

## License

The files in this repository are under the [MIT license](LICENSE). Each plugin states its own license in its `meta.json` (MIT unless it says otherwise). The data a plugin shows belongs to the service it comes from, under that service's terms.
