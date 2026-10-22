// Dinner idea: a random meal from TheMealDB, or a cocktail from TheCocktailDB, with a link to
// its recipe, using both sites' free public test key ("1"). Up to three tries for one whose
// name fits and that wasn't suggested recently. New every time it comes round (newEachTime).

const SEEN = 60;
const OK = /^[A-Z0-9 !@#$()\-+&=;:'"%,.\/?°\n]*$/;

/** The board's version of some text: accents and curly quotes made plain, upper case. */
function plain(s) {
  return String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[‘’\u0060´]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...")
    .replace(/[{}]/g, "").replace(/[ \t]+/g, " ").trim().toUpperCase();
}

/** How many lines `text` takes at `cols`; Infinity if a word is longer than a line. */
function lineCount(text, cols) {
  let lines = 0;
  for (const para of text.split("\n")) {
    let cur = 0;
    lines++;
    for (const w of para.split(" ").filter(Boolean)) {
      if (w.length > cols) return Infinity;
      if (!cur) cur = w.length;
      else if (cur + 1 + w.length <= cols) cur += 1 + w.length;
      else (lines++, (cur = w.length));
    }
  }
  return lines;
}

const SITES = {
  meal: { host: "www.themealdb.com", list: "meals", id: "idMeal", name: "strMeal", page: "meal", about: (m) => [m.strArea !== "Unknown" && m.strArea, m.strCategory].filter(Boolean).join(" ") },
  cocktail: { host: "www.thecocktaildb.com", list: "drinks", id: "idDrink", name: "strDrink", page: "drink", about: (d) => (d.strAlcoholic === "Non alcoholic" ? "Alcohol free" : d.strCategory) },
};

export default async function (ctx) {
  const { rows, cols } = ctx.board;
  const want = String(ctx.settings.what || "meal");
  const kind = want === "both" ? (Math.random() < 0.5 ? "meal" : "cocktail") : want === "cocktail" ? "cocktail" : "meal";
  const site = SITES[kind];
  const seen = ctx.store.get("seen") || [];
  for (let tries = 0; tries < 3; tries++) {
    const r = await ctx.fetch(`https://${site.host}/api/json/v1/1/random.php`);
    if (!r.ok) throw new Error(`${site.host} answered HTTP ${r.status}`);
    const x = ((await r.json())[site.list] || [])[0];
    if (!x) throw new Error(`${site.host} sent nothing back`);
    const id = `${kind}-${x[site.id]}`;
    const name = plain(x[site.name]), about = plain(site.about(x));
    const heading = kind === "meal" ? "How about" : "Try a";
    const text = rows >= 5 ? `${heading}\n\n${name}\n${about}` : rows >= 3 ? `${name}\n${about}` : name;
    if (seen.includes(id) || !OK.test(text.toUpperCase()) || lineCount(text, cols) > rows) {
      ctx.log(`skipped ${name}`);
      continue;
    }
    ctx.store.set("seen", [id, ...seen].slice(0, SEEN));
    return { text, id, link: `https://${site.host}/${site.page}/${x[site.id]}` };
  }
  return null;
}
