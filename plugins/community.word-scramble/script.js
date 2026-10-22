// Word scramble: a word with its letters mixed up and a hint, then the answer on the next page.
// The words are built in, so nothing is fetched. A new word every time it comes round
// (newEachTime), not one used recently.

const WORDS = {
  animal: ["zebra", "giraffe", "penguin", "dolphin", "koala", "kangaroo", "elephant", "octopus", "squirrel", "tortoise",
    "flamingo", "hedgehog", "panther", "leopard", "gorilla", "hamster", "lobster", "pelican", "platypus", "wombat",
    "buffalo", "cheetah", "chicken", "donkey", "ferret", "gazelle", "jaguar", "meerkat", "ostrich", "rabbit",
    "raccoon", "reindeer", "salmon", "spider", "turtle", "walrus", "weasel", "camel", "eagle", "parrot"],
  food: ["pancake", "noodles", "avocado", "burrito", "cupcake", "pretzel", "lasagne", "omelette", "spinach", "broccoli",
    "cabbage", "pumpkin", "sausage", "biscuit", "custard", "dumpling", "meatball", "mushroom", "pineapple", "popcorn",
    "sandwich", "spaghetti", "strawberry", "tomato", "waffle", "yoghurt", "cheese", "cherry", "coconut", "lemonade",
    "mango", "muffin", "pastry", "peanut", "pickle", "potato", "radish", "risotto", "sushi", "toffee"],
  place: ["library", "airport", "bakery", "castle", "harbour", "island", "jungle", "kitchen", "museum", "volcano",
    "village", "theatre", "stadium", "station", "hospital", "lighthouse", "mountain", "desert", "garden", "market",
    "beach", "bridge", "canyon", "cinema", "forest", "glacier", "lagoon", "meadow", "office", "palace"],
  thing: ["umbrella", "bicycle", "keyboard", "blanket", "compass", "diamond", "envelope", "flashlight", "guitar", "hammock",
    "jigsaw", "kettle", "ladder", "magnet", "necklace", "notebook", "padlock", "pillow", "rainbow", "rocket",
    "scissors", "suitcase", "teapot", "telescope", "trumpet", "volleyball", "wardrobe", "whistle", "window", "balloon"],
};
const HINTS = { animal: "an animal", food: "something to eat", place: "a place", thing: "a thing" };

function shuffle(word) {
  for (let tries = 0; tries < 20; tries++) {
    const a = [...word];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    const s = a.join("");
    if (s !== word) return s;
  }
  return [...word].reverse().join("");
}

export default function (ctx) {
  const { rows, cols } = ctx.board;
  const theme = String(ctx.settings.theme || "mixed");
  const themes = theme === "mixed" ? Object.keys(WORDS) : [theme].filter((t) => WORDS[t]);
  const all = themes.flatMap((t) => WORDS[t].filter((w) => w.length <= cols).map((w) => [t, w]));
  if (!all.length) return null;
  const recent = ctx.store.get("recent") || [];
  let pool = all.filter(([, w]) => !recent.includes(w));
  if (!pool.length) pool = all;
  const [t, word] = pool[Math.floor(Math.random() * pool.length)];
  ctx.store.set("recent", [word, ...recent].slice(0, Math.min(60, all.length - 1)));

  const mixed = shuffle(word).toUpperCase();
  // Spaced out when there's room: easier to read across the room
  const letters = mixed.length * 2 - 1 <= cols ? [...mixed].join(" ") : mixed;
  const puzzle = rows >= 5 ? `Unscramble\n${HINTS[t]}\n\n${letters}` : rows >= 3 ? `Unscramble\n${letters}\n${HINTS[t]}` : letters;
  const answer = rows >= 5 ? `It's\n\n${word}` : rows >= 2 ? `It's\n${word}` : word;
  return { pages: [puzzle, answer], color: "yellow" };
}
