// Big countdown: the days left drawn as 3×5 digits made of colour tiles, the title beside
// them, and a bar along the bottom row that fills (red to violet) from the start date to the
// day. The whole layout is returned as "characters", so it's exactly as drawn. On the day it's
// an alert, once; small boards get plain text.

const DIGITS = [
  ["###", "#.#", "#.#", "#.#", "###"], [".#.", "##.", ".#.", ".#.", "###"], ["###", "..#", "###", "#..", "###"],
  ["###", "..#", "###", "..#", "###"], ["#.#", "#.#", "###", "..#", "..#"], ["###", "#..", "###", "..#", "###"],
  ["###", "#..", "###", "#.#", "###"], ["###", "..#", "..#", "..#", "..#"], ["###", "#.#", "###", "#.#", "###"],
  ["###", "#.#", "###", "..#", "###"],
];
const COLOURS = { red: 63, orange: 64, yellow: 65, green: 66, blue: 67, violet: 68, white: 69 };
const RAINBOW = [63, 64, 65, 66, 67, 68];
const SYMBOLS = { "!": 37, "@": 38, "#": 39, $: 40, "(": 41, ")": 42, "-": 44, "+": 46, "&": 47, "=": 48, ";": 49, ":": 50, "'": 52, '"': 53, "%": 54, ",": 55, ".": 56, "/": 59, "?": 60 };
const DAY_MS = 86400000;

/** A character's tile code (letters, digits and the board's punctuation; anything else is blank). */
function code(ch) {
  const c = ch.toUpperCase();
  if (c >= "A" && c <= "Z") return c.charCodeAt(0) - 64;
  if (c >= "1" && c <= "9") return c.charCodeAt(0) - 22;
  if (c === "0") return 36;
  return SYMBOLS[c] || 0;
}

/** Words into lines of at most `width` characters (a long word is cut). */
function wrap(text, width) {
  const lines = [];
  for (const word of text.toUpperCase().split(/\s+/).filter(Boolean)) {
    const w = word.slice(0, width);
    const last = lines[lines.length - 1];
    if (last !== undefined && last.length + 1 + w.length <= width) lines[lines.length - 1] = last + " " + w;
    else lines.push(w);
  }
  return lines;
}

const dayOf = (ymd) => Date.parse(ymd + "T00:00:00Z");

export default function (ctx) {
  const title = String(ctx.settings.title || "").trim() || "The day";
  const date = String(ctx.settings.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "Set the date in this source's settings";
  const today = ctx.local.slice(0, 10);
  const days = Math.round((dayOf(date) - dayOf(today)) / DAY_MS);
  const colour = String(ctx.settings.colour || "rainbow");
  const chip = colour === "rainbow" ? "violet" : colour;

  if (days === 0) {
    return { text: `{r}{o}{y}{g}{b}{v}\n${title}\nis today!\n{v}{b}{g}{y}{o}{r}`, color: chip, priority: "alert", id: `${title}-${date}` };
  }
  if (days < 0) return { text: `${title}\nwas ${-days} day${days === -1 ? "" : "s"} ago`, color: chip };

  // Where the bar starts: the "from" setting, or the day this source first counted to this date.
  let from = String(ctx.settings.from || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    const kept = ctx.store.get("since");
    from = kept && kept.date === date ? kept.from : today;
    ctx.store.set("since", { date, from });
  }
  const span = Math.max(1, (dayOf(date) - dayOf(from)) / DAY_MS);
  const done = Math.min(1, Math.max(0, 1 - days / span));

  const { rows, cols } = ctx.board;
  const digits = String(days);
  const digitsW = digits.length * 4 - 1;
  const textW = cols - digitsW - 1;
  if (rows < 6 || textW < 4) {
    return { text: `${days} day${days === 1 ? "" : "s"}\nto ${title}`, color: chip };
  }

  const grid = Array.from({ length: 6 }, () => new Array(cols).fill(0));
  // The digits, rows 0–4, each in its own colour (rainbow) or the chosen one.
  [...digits].forEach((d, k) => {
    const ink = colour === "rainbow" ? RAINBOW[(days + k) % RAINBOW.length] : COLOURS[colour] || 69;
    DIGITS[Number(d)].forEach((line, r) => {
      [...line].forEach((px, c) => {
        if (px === "#") grid[r][k * 4 + c] = ink;
      });
    });
  });
  // Beside them: "DAYS TO" and the title, centred in the space left.
  const words = [days === 1 ? "DAY" : "DAYS", "TO", ...wrap(title, textW)].slice(0, 5);
  const top = Math.floor((5 - words.length) / 2);
  words.forEach((w, r) => {
    const x = digitsW + 1 + Math.floor((textW - w.length) / 2);
    [...w].forEach((ch, c) => (grid[top + r][x + c] = code(ch)));
  });
  // The bar: how far from the start date to the day, red to violet.
  const filled = Math.round(done * cols);
  for (let c = 0; c < filled; c++) grid[5][c] = colour === "rainbow" ? RAINBOW[Math.floor((c * RAINBOW.length) / cols)] : COLOURS[colour] || 69;

  // Centred on bigger boards.
  const out = Array.from({ length: rows }, () => new Array(cols).fill(0));
  const off = Math.floor((rows - 6) / 2);
  grid.forEach((row, r) => (out[off + r] = row));
  return { characters: out, color: chip, id: `${title}-${date}-${days}` };
}
