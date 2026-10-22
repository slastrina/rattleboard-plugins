// Fortune teller: a fortune-cookie fortune with lucky numbers, or a crystal ball's answer to
// whatever you were wondering. All made up here, nothing fetched. The store remembers the
// last few, so one doesn't come round again soon; with newEachTime every turn is new.

const FORTUNES = [
  "A pleasant surprise is waiting for you",
  "Your hard work is about to pay off",
  "Today is a good day to start something",
  "Someone is thinking of you right now",
  "Good news will come to you by mail",
  "You will find what you lost when you stop looking",
  "A small kindness today brings a big smile tomorrow",
  "Your next idea is a good one. Write it down",
  "An old friend will get in touch soon",
  "The answer you need is closer than you think",
  "You will be hungry again in one hour",
  "Take the scenic route today",
  "Adventure is coming. Bring a snack",
  "Your talents will be recognised and rewarded",
  "A fresh start will put you on your way",
  "Believe it can be done",
  "Now is the time to try something new",
  "Your smile will brighten someone's day",
  "The coffee will be good today",
  "You will solve a problem that has bugged you",
  "Luck is on your side this week",
  "Patience now, celebration later",
  "Say yes to the next invitation",
  "A good laugh is in your near future",
  "You are braver than you think",
  "Something you planned will go better than expected",
  "Do the thing you have been putting off",
  "Today your code compiles first time",
  "Expect a kind word from an unexpected place",
  "A nap would do you good",
  "Fortune favours the curious",
  "You will finish what you start today",
  "The best is yet to come",
  "Clear your desk, clear your mind",
  "Help is on the way",
  "Your inbox will be kind to you today",
  "A walk outside will bring a good idea",
  "Trust your instincts this week",
  "Someone admires your work more than you know",
  "Good things come to those who stretch",
  "You will learn something surprising today",
  "This is your sign to call your mum",
  "A happy event is coming",
  "Your plants are proud of you",
  "Tidy up one thing and everything feels better",
  "The weekend will be worth the wait",
  "You will make someone laugh today",
  "An unexpected snack is in your future",
  "Your next step is the right one",
  "Keep going. You are nearly there",
];

const BALL = [
  "Signs point to yes", "Without a doubt", "Absolutely", "Yes, and soon", "It looks good",
  "Count on it", "The stars agree", "Most likely", "Go for it",
  "Ask again after lunch", "Too foggy to tell", "Try again later", "Hard to say", "Sleep on it",
  "Not today", "Doubtful", "The stars say no", "Better not", "Don't count on it",
];

const COLOURS = { yes: "green", maybe: "yellow", no: "red" };
const RECENT = 12;

function luckyNumbers() {
  const n = new Set();
  while (n.size < 4) n.add(1 + Math.floor(Math.random() * 45));
  return [...n].sort((a, b) => a - b).join(" ");
}

/** A random index into `list` not among the recent ones kept under `key`. */
function pick(ctx, key, list) {
  const recent = ctx.store.get(key) || [];
  let i = Math.floor(Math.random() * list.length);
  for (let tries = 0; tries < 20 && recent.includes(i); tries++) i = Math.floor(Math.random() * list.length);
  ctx.store.set(key, [i, ...recent].slice(0, Math.min(RECENT, list.length - 1)));
  return i;
}

export default function (ctx) {
  const mode = String(ctx.settings.mode || "mix");
  const ball = mode === "ball" || (mode === "mix" && Math.random() < 0.4);
  const big = ctx.board.rows >= 5;
  if (ball) {
    const i = pick(ctx, "ball", BALL);
    const mood = i < 9 ? "yes" : i < 14 ? "maybe" : "no";
    return { text: big ? `The crystal ball says\n\n${BALL[i]}` : BALL[i], color: COLOURS[mood] };
  }
  const i = pick(ctx, "fortune", FORTUNES);
  const lucky = big ? `\n\nLucky numbers\n${luckyNumbers()}` : "";
  return { text: `${FORTUNES[i]}${lucky}`, color: "violet" };
}
