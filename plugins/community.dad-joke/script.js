// Dad joke: a random joke from icanhazdadjoke.com. The store remembers the last 30 jokes'
// ids, so one doesn't come round again soon (up to three tries for a new one).

const SEEN = 30;

export default async function (ctx) {
  const seen = ctx.store.get("seen") || [];
  let joke = null;
  for (let tries = 0; tries < 3; tries++) {
    // The service asks for JSON this way; Rattleboard's user agent identifies the app.
    const r = await ctx.fetch("https://icanhazdadjoke.com/", { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`icanhazdadjoke.com answered HTTP ${r.status}`);
    joke = await r.json();
    if (!seen.includes(joke.id)) break;
    ctx.log(`seen ${joke.id} already; trying again`);
  }
  ctx.store.set("seen", [joke.id, ...seen.filter((id) => id !== joke.id)].slice(0, SEEN));
  return { text: joke.joke, id: joke.id, link: `https://icanhazdadjoke.com/j/${joke.id}` };
}
