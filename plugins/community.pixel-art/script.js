// Pixel art: little pictures made of colour tiles. Some are drawn from a sprite (letters for
// colours), and the rainbow, sunset and night sky are worked out for the board's size, so
// they fill any board. A different picture every time it comes round (newEachTime).

const C = { R: 63, O: 64, Y: 65, G: 66, B: 67, V: 68, W: 69, K: 70, ".": 0 };
const RED = 63, ORANGE = 64, YELLOW = 65, GREEN = 66, BLUE = 67, VIOLET = 68, WHITE = 69;

// Six rows tall, for Standard and bigger boards.
const SPRITES = {
  heart: [".RRR...RRR.", "RRRRR.RRRRR", "RRRRRRRRRRR", ".RRRRRRRRR.", "...RRRRR...", ".....R....."],
  invader: ["..G.....G..", "...G...G...", "..GGGGGGG..", ".GG.GGG.GG.", "GGGGGGGGGGG", "G.G.....G.G"],
  chomp: [".YYYY..............", "YYYYYY........RRR..", "YYY.....W..W.RRRRR.", "YYY.....W..W.RWRWR.", "YYYYYY.......RRRRR.", ".YYYY........R.R.R."],
  mushroom: ["...RRRRR...", ".RRWRRRWRR.", "RRWWWRWWWRR", "RRRRRRRRRRR", "...WKWKW...", "...WWWWW..."],
  tree: ["....YY....", "...GGGG...", "..GGRGGG..", ".GGGGGBGG.", "....OO....", "....OO...."],
  house: [".....R.....", "...RRRRR...", ".RRRRRRRRR.", "..WWWWWWW..", "..WBWWWOW..", "..WWWWWOW.."],
  smiley: ["..YYYYY..", ".YKYYYKY.", "YYYYYYYYY", "YKYYYYYKY", ".YKKKKKY.", "..YYYYY.."],
  cat: ["O.......O", "OO.....OO", "OOOOOOOOO", "OKOOOOOKO", "OOOOWOOOO", ".OOOOOOO."],
};
// Three rows, for Compact boards.
const MINI = {
  heart: ["RR.RR", "RRRRR", ".RRR."],
  chomp: [".YY.......", "YY..W.W.W.", ".YY......."],
  invader: ["G.GGG.G", "GGGGGGG", "G.G.G.G"],
};

function blank(rows, cols) {
  return Array.from({ length: rows }, () => Array(cols).fill(0));
}

function sprite(art, rows, cols) {
  const g = blank(rows, cols);
  const w = Math.max(...art.map((r) => r.length));
  const top = Math.floor((rows - art.length) / 2), left = Math.floor((cols - w) / 2);
  art.forEach((line, r) => [...line].forEach((ch, c) => (g[top + r][left + c] = C[ch] || 0)));
  return g;
}

// Tiles are taller than they are wide: this makes circles round.
const ASPECT = 0.62;

function rainbow(rows, cols) {
  const g = blank(rows, cols);
  // Centred just below the board, one row per band straight up the middle
  const cx = (cols - 1) / 2, cy = rows, outer = rows + 0.5;
  const bands = [RED, ORANGE, YELLOW, GREEN, BLUE, VIOLET];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const i = Math.floor(outer - Math.hypot((c - cx) * ASPECT, r - cy));
      if (i >= 0 && i < bands.length) g[r][c] = bands[i];
    }
  return g;
}

function sunset(rows, cols) {
  const g = blank(rows, cols);
  const horizon = Math.max(1, Math.round(rows * 0.6));
  const sky = [VIOLET, RED, ORANGE, ORANGE, YELLOW];
  const cx = (cols - 1) / 2, radius = Math.max(1.2, horizon * 0.75);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (r < horizon) {
        const sun = Math.hypot((c - cx) * ASPECT, (r - horizon + 0.3) * 1.0) <= radius;
        g[r][c] = sun ? YELLOW : sky[Math.min(sky.length - 1, Math.floor((r / horizon) * (sky.length - 1)))];
      } else {
        // The sun's path on the water, narrowing towards you
        const path = Math.abs(c - cx) <= Math.max(0.5, radius / ASPECT / (1 + (r - horizon)) / 2);
        g[r][c] = path && (r + c) % 2 === 0 ? YELLOW : path ? ORANGE : BLUE;
      }
    }
  return g;
}

function nightSky(rows, cols) {
  const g = blank(rows, cols);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (Math.random() < 0.08) g[r][c] = Math.random() < 0.8 ? WHITE : YELLOW;
  // A crescent moon in a corner
  const mr = Math.min(1, rows - 1), mc = cols - 4;
  const moon = rows >= 5 ? [".YY", "YY.", "YY.", ".YY"] : [".Y", "Y.", ".Y"].slice(0, rows);
  moon.forEach((line, r) => [...line].forEach((ch, c) => {
    if (mr + r < rows && mc + c < cols) g[mr + r][mc + c] = ch === "Y" ? YELLOW : 0;
  }));
  return g;
}

const DRAWN = { rainbow, sunset, "night sky": nightSky };

export default function (ctx) {
  const { rows, cols } = ctx.board;
  const fits = (art) => art.length <= rows && Math.max(...art.map((r) => r.length)) <= cols;
  const sprites = rows >= 6 ? SPRITES : MINI;
  const names = [...Object.keys(sprites).filter((k) => fits(sprites[k])), ...Object.keys(DRAWN)];
  const recent = ctx.store.get("recent") || [];
  let pool = names.filter((n) => !recent.includes(n));
  if (!pool.length) pool = names;
  const name = pool[Math.floor(Math.random() * pool.length)];
  ctx.store.set("recent", [name, ...recent].slice(0, Math.min(4, names.length - 1)));
  const characters = DRAWN[name] ? DRAWN[name](rows, cols) : sprite(sprites[name], rows, cols);
  ctx.log(`picture: ${name}`);
  return { characters, color: "none" };
}
