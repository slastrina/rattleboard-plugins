// London arrivals: two TfL Unified API requests, one after the other. First the stop's
// arrival predictions; then the status of the lines in them, which sets the colour (green for
// good service, yellow for minor delays, orange or red for worse) and adds a line saying what's
// wrong. Rows are laid out in columns with blank tiles ({0}), which the layout never squeezes.

const API = "https://api.tfl.gov.uk";

const short = (s, n) => (s.length <= n ? s : s.slice(0, n).trimEnd());
// TfL's statusSeverity codes, from fine to worst: good service (and "no issues"), minor
// problems, delays and part closures, and closed or suspended.
const GOOD = [10, 18, 19];
const MINOR = [9, 12, 13, 14, 17];
const DELAYS = [3, 5, 6, 7, 8, 11, 15];
const rank = (sev) => (GOOD.includes(sev) ? 0 : MINOR.includes(sev) ? 1 : DELAYS.includes(sev) ? 2 : 3);
const COLOURS = ["green", "yellow", "orange", "red"];
const pad = (s, n) => s + "{0}".repeat(Math.max(0, n - s.length));

function place(a) {
  const t = (a.towards || a.destinationName || "")
    .replace(/ (Underground|Rail|DLR|Bus) Station$/i, "")
    .replace(/\band\b/gi, "&")
    .replace(/^Check Front of Train$/i, "")
    .trim();
  return t || (a.platformName || "").replace(/ - Platform.*$/, "").replace(/bound$/i, "");
}

export default async function (ctx) {
  const stop = String(ctx.settings.stop || "").trim();
  if (!/^[A-Za-z0-9]{3,20}$/.test(stop)) return "Set a TfL stop id in this source's settings";
  const only = String(ctx.settings.line || "").trim().toLowerCase();
  const r = await ctx.fetch(`${API}/StopPoint/${stop}/Arrivals`);
  if (r.status === 404) return `No TfL stop ${stop}`;
  if (!r.ok) throw new Error(`TfL answered HTTP ${r.status}`);
  const arrivals = (await r.json())
    .filter((a) => !only || a.lineId === only || String(a.lineName).toLowerCase() === only)
    .sort((a, b) => a.timeToStation - b.timeToStation);
  const station = String(ctx.settings.name || "").trim() || (arrivals[0] ? arrivals[0].stationName.replace(/ (Underground|Rail|DLR|Bus) Station$/i, "") : stop);

  // The second request: how those lines are running.
  let worst = null;
  const lines = [...new Set(arrivals.map((a) => a.lineId))].slice(0, 10);
  if (lines.length) {
    const s = await ctx.fetch(`${API}/Line/${lines.map(encodeURIComponent).join(",")}/Status`);
    if (s.ok) {
      for (const line of await s.json()) {
        for (const st of line.lineStatuses || []) {
          const k = rank(st.statusSeverity);
          if (!worst || k > worst.rank) worst = { rank: k, text: st.statusSeverityDescription, line: line.name };
        }
      }
    }
  }
  const bad = worst ? worst.rank : 0;
  const color = COLOURS[bad];
  ctx.log(`${arrivals.length} arrivals; lines ${lines.join(",") || "none"}; worst ${worst ? worst.line + ": " + worst.text : "n/a"}`);

  const cols = ctx.board.cols;
  const nameW = cols >= 20 ? 9 : 5;
  // A colour tile before the name: the left-aligned card has no corner chip.
  const rows = [`{${color[0]}} ` + short(station, cols - 2)];
  const room = ctx.board.rows - 1 - (bad > 0 ? 1 : 0);
  for (const a of arrivals.slice(0, Math.max(1, room))) {
    const mins = Math.floor(a.timeToStation / 60);
    const when = mins < 1 ? "due" : `${mins}m`;
    const name = short(a.lineName, nameW - 1);
    const where = short(place(a), cols - nameW - when.length - 1);
    // Words cut at a word boundary where they can be ("Elephant &" → "Elephant").
    const tidy = where.replace(/[\s&-]+$/, "");
    rows.push(pad(name, nameW) + pad(tidy, cols - nameW - when.length) + when);
  }
  if (!arrivals.length) rows.push("Nothing due");
  if (bad > 0) {
    const full = `${worst.text} ${worst.line}`;
    rows.push(full.length <= cols ? full : short(worst.text, cols));
  }
  return { text: rows.join("\n"), color, align: "left", link: `https://tfl.gov.uk/stop-points/${stop}` };
}
