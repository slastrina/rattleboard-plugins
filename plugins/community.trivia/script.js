// Trivia: a question from the Open Trivia Database (opentdb.com), then its answer on the next
// page. Questions come 20 at a time and wait in the store, so the site is asked once every
// 20 questions; it allows one request every 5 seconds from an address. Only questions that
// fit the board and use characters it has are kept. A new question every time it comes round
// (newEachTime).

const BATCH = 20;
const OK = /^[A-Z0-9 !@#$()\-+&=;:'"%,.\/?°]*$/;

/** The board's version of some text: accents and curly quotes made plain, upper case. */
function plain(s) {
  return String(s)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[‘’\u0060´]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...")
    .replace(/[{}]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}

/** Words into lines of at most `cols`; null if a word is longer than a line. */
function wrap(text, cols) {
  const out = [];
  for (const para of text.split("\n")) {
    let cur = "";
    for (const w of para.split(" ").filter(Boolean)) {
      if (w.length > cols) return null;
      if (!cur) cur = w;
      else if (cur.length + 1 + w.length <= cols) cur += " " + w;
      else (out.push(cur), (cur = w));
    }
    out.push(cur);
  }
  return out;
}

function decode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

async function fetchBatch(ctx, cat, diff) {
  let url = `https://opentdb.com/api.php?amount=${BATCH}&encode=url3986`;
  if (cat !== "any") url += `&category=${encodeURIComponent(cat)}`;
  if (diff !== "any") url += `&difficulty=${encodeURIComponent(diff)}`;
  const r = await ctx.fetch(url);
  if (r.status === 429) throw new Error("Open Trivia DB asks for a few seconds between requests; it'll try again next time");
  if (!r.ok) throw new Error(`opentdb.com answered HTTP ${r.status}`);
  const j = await r.json();
  if (j.response_code === 5) throw new Error("Open Trivia DB asks for a few seconds between requests; it'll try again next time");
  if (j.response_code !== 0) throw new Error(`Open Trivia DB has no questions for those settings (code ${j.response_code})`);
  return j.results
    .map((q) => ({ q: plain(decode(q.question)), a: plain(decode(q.correct_answer)), tf: q.type === "boolean" }))
    .filter((q) => OK.test(q.q) && OK.test(q.a));
}

export default async function (ctx) {
  const { rows, cols } = ctx.board;
  const cat = String(ctx.settings.category || "any");
  const diff = String(ctx.settings.difficulty || "any");
  const want = `${cat}/${diff}`;
  let queue = ctx.store.get("for") === want ? ctx.store.get("queue") || [] : [];

  for (let batches = 0; batches < 2; batches++) {
    if (!queue.length) {
      queue = await fetchBatch(ctx, cat, diff);
      ctx.store.set("for", want);
    }
    while (queue.length) {
      const q = queue.shift();
      const question = q.tf ? `True or false?\n${q.q}`.toUpperCase() : q.q;
      const lines = wrap(question, cols);
      const ans = wrap(q.a, cols);
      // Up to two pages of question, and an answer with room for its heading
      if (!lines || !ans || lines.length > rows * 2 || ans.length > Math.max(1, rows - 2)) continue;
      ctx.store.set("queue", queue);
      const pages = [];
      for (let i = 0; i < lines.length; i += rows) pages.push(lines.slice(i, i + rows).join("\n"));
      pages.push(rows >= 4 ? `The answer\n\n${ans.join("\n")}` : rows >= 2 ? `Answer\n${ans.join("\n")}` : ans.join(" "));
      ctx.log(`${queue.length} more questions waiting`);
      return { pages, color: "violet" };
    }
  }
  ctx.store.set("queue", queue);
  return null;
}
