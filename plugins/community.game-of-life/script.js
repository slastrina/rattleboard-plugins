// Game of Life: Conway's cellular automaton, one generation every run (every 10 seconds). The
// edges wrap round. Cells are coloured by age, so you can see what's new (yellow) and what has
// lasted (green, then blue, then violet). When it dies out or settles into a loop it starts
// again from a random soup or a famous pattern. The board is kept in the store.

const AGE_COLOURS = [65, 66, 66, 67, 67, 67, 68]; // 1, 2-3, 4-6, 7+
const ONE = { green: 66, yellow: 65, orange: 64, red: 63, blue: 67, violet: 68, white: 69 };
const MAX_GENERATIONS = 400;

// Patterns, as rows of "#" and "."
const PATTERNS = {
  glider: [".#.", "..#", "###"],
  "r-pentomino": [".##", "##.", ".#."],
  acorn: [".#.....", "...#...", "##..###"],
  "diehard": ["......#.", "##......", ".#...###"],
  "lightweight spaceship": [".#..#", "#....", "#...#", "####."],
  pulsar: ["..###...###..", ".............", "#....#.#....#", "#....#.#....#", "#....#.#....#", "..###...###.."],
};

function seed(rows, cols) {
  const cells = Array(rows * cols).fill(0);
  const names = Object.keys(PATTERNS).filter((n) => PATTERNS[n].length <= rows && PATTERNS[n][0].length <= cols);
  if (Math.random() < 0.35 && names.length) {
    const name = names[Math.floor(Math.random() * names.length)];
    const p = PATTERNS[name];
    const top = Math.floor((rows - p.length) / 2), left = Math.floor((cols - p[0].length) / 2);
    p.forEach((line, r) => [...line].forEach((ch, c) => ch === "#" && (cells[(top + r) * cols + left + c] = 1)));
    return { cells, name };
  }
  for (let i = 0; i < cells.length; i++) cells[i] = Math.random() < 0.32 ? 1 : 0;
  return { cells, name: "random soup" };
}

function next(cells, rows, cols) {
  const out = Array(cells.length).fill(0);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      let n = 0;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          if (cells[((r + dr + rows) % rows) * cols + ((c + dc + cols) % cols)]) n++;
        }
      const age = cells[r * cols + c];
      out[r * cols + c] = age ? (n === 2 || n === 3 ? Math.min(age + 1, 99) : 0) : n === 3 ? 1 : 0;
    }
  return out;
}

const shape = (cells) => cells.map((a) => (a ? "#" : ".")).join("");

export default function (ctx) {
  const { rows, cols } = ctx.board;
  let s = ctx.store.get("life");
  if (!s || s.rows !== rows || s.cols !== cols || s.restart) {
    const fresh = seed(rows, cols);
    s = { rows, cols, cells: fresh.cells, name: fresh.name, gen: 0, seen: [], stale: 0 };
  } else {
    s.cells = next(s.cells, rows, cols);
    s.gen++;
    // Dead, looping (the same shape as one of the last 12 generations) or old: a few more
    // generations to look at it, then start again.
    const now = shape(s.cells);
    const looping = s.seen.includes(now);
    s.seen = [now, ...s.seen].slice(0, 12);
    if (!s.cells.some(Boolean) || looping || s.gen >= MAX_GENERATIONS) s.stale++;
    if (s.stale >= 4) s.restart = true;
  }
  ctx.store.set("life", s);

  const one = ONE[ctx.settings.colour];
  const grid = [];
  for (let r = 0; r < rows; r++)
    grid.push(s.cells.slice(r * cols, (r + 1) * cols).map((age) => (!age ? 0 : one || AGE_COLOURS[Math.min(age, AGE_COLOURS.length) - 1])));
  ctx.log(`${s.name}, generation ${s.gen}, ${s.cells.filter(Boolean).length} alive`);
  return { characters: grid, color: "none" };
}
