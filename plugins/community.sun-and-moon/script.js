// Sun and moon: sunrise and sunset from the sunrise equation, and the moon's phase from its
// age in the synodic month. Everything is worked out here; nothing is fetched. The corner
// colour follows the moon: violet when new, blue as a crescent, green at a quarter, yellow
// when gibbous and white when full.

const RAD = Math.PI / 180;
const J1970 = 2440587.5;
const J2000 = 2451545.0;
const SYNODIC = 29.530588853;
const NEW_MOON = 2451550.1; // 6 Jan 2000 18:14 UTC, as a Julian day

const julian = (ms) => ms / 86400000 + J1970;
const fromJulian = (j) => (j - J1970) * 86400000;

/** Sunrise and sunset (ms since 1970) for the date `ymd` at a place, or why there are none. */
function sun(ymd, lat, lon) {
  const n = Math.ceil(julian(Date.parse(ymd + "T12:00:00Z")) - J2000 + 0.0008);
  const jStar = n - lon / 360;
  const m = (357.5291 + 0.98560028 * jStar) % 360;
  const c = 1.9148 * Math.sin(m * RAD) + 0.02 * Math.sin(2 * m * RAD) + 0.0003 * Math.sin(3 * m * RAD);
  const lambda = (m + c + 180 + 102.9372) % 360;
  const transit = J2000 + jStar + 0.0053 * Math.sin(m * RAD) - 0.0069 * Math.sin(2 * lambda * RAD);
  const sinDec = Math.sin(lambda * RAD) * Math.sin(23.4397 * RAD);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosW = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * sinDec) / (Math.cos(lat * RAD) * cosDec);
  if (cosW > 1) return { none: "Sun stays down" };
  if (cosW < -1) return { none: "Sun stays up" };
  const w = Math.acos(cosW) / RAD;
  return { rise: fromJulian(transit - w / 360), set: fromJulian(transit + w / 360) };
}

const PHASES = [
  [1.84, "New moon", "violet"],
  [5.53, "Waxing crescent", "blue"],
  [9.22, "First quarter", "green"],
  [12.91, "Waxing gibbous", "yellow"],
  [16.61, "Full moon", "white"],
  [20.3, "Waning gibbous", "yellow"],
  [23.99, "Last quarter", "green"],
  [27.68, "Waning crescent", "blue"],
  [SYNODIC, "New moon", "violet"],
];

function moon(ms) {
  const age = (((julian(ms) - NEW_MOON) % SYNODIC) + SYNODIC) % SYNODIC;
  const [, name, color] = PHASES.find(([upTo]) => age < upTo);
  const lit = Math.round(((1 - Math.cos((2 * Math.PI * age) / SYNODIC)) / 2) * 100);
  return { name, color, lit };
}

export default function (ctx) {
  const lat = Number(ctx.settings.latitude);
  const lon = Number(ctx.settings.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return "Set your latitude and longitude";
  const h24 = String(ctx.settings.clock) === "24";
  // Times on this board's clock: UTC plus its offset.
  const clock = (ms) => {
    const d = new Date(ms + ctx.utcOffset * 60000);
    const h = d.getUTCHours(), m = String(d.getUTCMinutes()).padStart(2, "0");
    return h24 ? `${String(h).padStart(2, "0")}:${m}` : `${h % 12 || 12}:${m} ${h < 12 ? "AM" : "PM"}`;
  };
  const s = sun(ctx.local.slice(0, 10), lat, lon);
  const m = moon(ctx.now);
  const sunLine = s.none ? [s.none] : [`Rise ${clock(s.rise)}`, `Set ${clock(s.set)}`];
  const lines = ctx.board.rows >= 5 ? [...sunLine, "", m.name, `${m.lit}% lit`] : s.none ? [s.none, m.name] : [`Sun ${clock(s.rise).replace(/ [AP]M/, "")}-${clock(s.set).replace(/ [AP]M/, "")}`, m.name, `${m.lit}% lit`];
  return { text: lines.join("\n"), color: m.color };
}
