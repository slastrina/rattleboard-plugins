// Next public holiday: the country's (and, optionally, a state's) next public holiday from
// Nager.Date (date.nager.at), and how many days are left. Green when it's a while off, then
// yellow, orange and red as it gets close.

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const DAY_MS = 86400000;

export default async function (ctx) {
  const country = String(ctx.settings.country || "AU").trim().toUpperCase();
  const region = String(ctx.settings.region || "").trim().toUpperCase();
  const r = await ctx.fetch(`https://date.nager.at/api/v3/NextPublicHolidays/${encodeURIComponent(country)}`);
  if (r.status === 404 || r.status === 204) return `No holidays known for ${country}`;
  if (!r.ok) throw new Error(`date.nager.at answered HTTP ${r.status}`);
  const holidays = await r.json();

  // National holidays, plus the region's own when one is set.
  const today = ctx.local.slice(0, 10);
  const applies = (h) => h.global || (region !== "" && (h.counties || []).includes(region));
  const next = holidays.find((h) => h.date >= today && applies(h) && (h.types || []).includes("Public"));
  if (!next) return null;

  const days = Math.round((Date.parse(next.date + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / DAY_MS);
  const d = new Date(next.date + "T00:00:00Z");
  const when = `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  const left = days === 0 ? "Today!" : days === 1 ? "Tomorrow" : `In ${days} days`;
  const color = days <= 1 ? "red" : days <= 7 ? "orange" : days <= 30 ? "yellow" : "green";
  ctx.log(`${holidays.length} holidays; next for ${region || country}: ${next.date} ${next.localName}`);

  // A Compact board has three rows: leave the heading out.
  const text = ctx.board.rows >= 5 ? `Next holiday\n\n${next.localName}\n${when}\n${left}` : `${next.localName}\n${when}\n${left}`;
  return { text, color, id: `${country}-${region}-${next.date}`, link: "https://date.nager.at/PublicHoliday/Country/" + country };
}
