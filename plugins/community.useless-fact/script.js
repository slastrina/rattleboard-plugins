// Useless fact: a random fact from uselessfacts.jsph.pl, as long as it fits the board in two
// pages and uses characters the board has (up to four tries). The store remembers the last
// 100, so one doesn't come round again soon. New every time it comes round (newEachTime).

const SEEN = 100;
const OK = /^[A-Z0-9 !@#$()\-+&=;:'"%,.\/?°]*$/;

/** The board's version of some text: accents and curly quotes made plain, upper case. */
function plain(s) {
  return String(s)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[‘’\u0060´]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...")
    .replace(/[{}]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}

/** How many lines `text` takes at `cols`; Infinity if a word is longer than a line. */
function lineCount(text, cols) {
  let lines = 1, cur = 0;
  for (const w of text.split(" ").filter(Boolean)) {
    if (w.length > cols) return Infinity;
    if (!cur) cur = w.length;
    else if (cur + 1 + w.length <= cols) cur += 1 + w.length;
    else (lines++, (cur = w.length));
  }
  return lines;
}

export default async function (ctx) {
  const { rows, cols } = ctx.board;
  const seen = ctx.store.get("seen") || [];
  for (let tries = 0; tries < 4; tries++) {
    const r = await ctx.fetch("https://uselessfacts.jsph.pl/api/v2/facts/random?language=en");
    if (!r.ok) throw new Error(`uselessfacts.jsph.pl answered HTTP ${r.status}`);
    const f = await r.json();
    const text = plain(f.text);
    if (seen.includes(f.id) || !OK.test(text) || lineCount(text, cols) > rows * 2) {
      ctx.log(`skipped ${f.id}`);
      continue;
    }
    ctx.store.set("seen", [f.id, ...seen].slice(0, SEEN));
    const link = /^https:\/\//.test(f.source_url || "") ? f.source_url : undefined;
    return { text, id: f.id, link };
  }
  return null;
}
