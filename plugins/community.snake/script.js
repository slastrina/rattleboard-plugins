// Snake: a snake that plays itself. Every run (every 10 seconds) it moves a couple of tiles,
// heading for the food by the shortest path it can find and otherwise for the most room. It
// grows when it eats; when it boxes itself in it flashes red and starts again. The game is
// kept in the store, so it carries on between runs.

const COLOURS = { green: 66, blue: 67, violet: 68, orange: 64, white: 69 };
const HEAD = 65, FOOD = 63, DEAD = 63;
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

const key = (r, c) => r * 1000 + c;

function newGame(rows, cols) {
  const r = Math.floor(rows / 2), c = Math.floor(cols / 4);
  const body = [[r, c + 2], [r, c + 1], [r, c]];
  return { rows, cols, body, food: placeFood(rows, cols, body), dead: 0, best: 0 };
}

function placeFood(rows, cols, body) {
  const taken = new Set(body.map(([r, c]) => key(r, c)));
  const free = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (!taken.has(key(r, c))) free.push([r, c]);
  return free.length ? free[Math.floor(Math.random() * free.length)] : null;
}

/** The squares the head can go to: on the board and not the body (the tail moves away). */
function moves(g, body) {
  const [hr, hc] = body[0];
  const blocked = new Set(body.slice(0, -1).map(([r, c]) => key(r, c)));
  return DIRS.map(([dr, dc]) => [hr + dr, hc + dc]).filter(([r, c]) => r >= 0 && c >= 0 && r < g.rows && c < g.cols && !blocked.has(key(r, c)));
}

/** First step of a shortest path from the head to the food, avoiding the body. */
function towardFood(g) {
  if (!g.food) return null;
  const blocked = new Set(g.body.slice(0, -1).map(([r, c]) => key(r, c)));
  const start = g.body[0];
  const prev = new Map([[key(...start), null]]);
  const queue = [start];
  while (queue.length) {
    const [r, c] = queue.shift();
    if (r === g.food[0] && c === g.food[1]) {
      let at = [r, c];
      while (prev.get(key(...at)) && key(...prev.get(key(...at))) !== key(...start)) at = prev.get(key(...at));
      return at;
    }
    for (const [dr, dc] of DIRS) {
      const n = [r + dr, c + dc];
      if (n[0] < 0 || n[1] < 0 || n[0] >= g.rows || n[1] >= g.cols || blocked.has(key(...n)) || prev.has(key(...n))) continue;
      prev.set(key(...n), [r, c]);
      queue.push(n);
    }
  }
  return null;
}

/** How many squares can be reached from `from` once the snake has moved there. */
function room(g, from) {
  const body = [from, ...g.body.slice(0, -1)];
  const blocked = new Set(body.slice(1).map(([r, c]) => key(r, c)));
  const seen = new Set([key(...from)]);
  const stack = [from];
  while (stack.length) {
    const [r, c] = stack.pop();
    for (const [dr, dc] of DIRS) {
      const n = [r + dr, c + dc];
      if (n[0] < 0 || n[1] < 0 || n[0] >= g.rows || n[1] >= g.cols || blocked.has(key(...n)) || seen.has(key(...n))) continue;
      seen.add(key(...n));
      stack.push(n);
    }
  }
  return seen.size;
}

/** One move; false when it's stuck. */
function step(g) {
  const options = moves(g, g.body);
  if (!options.length) return false;
  let next = towardFood(g);
  // Don't take the food path into a dead end shorter than the snake
  if (next && room(g, next) < g.body.length) next = null;
  if (!next) next = options.reduce((a, b) => (room(g, b) > room(g, a) ? b : a));
  const eats = g.food && next[0] === g.food[0] && next[1] === g.food[1];
  g.body.unshift(next);
  if (eats) g.food = placeFood(g.rows, g.cols, g.body);
  else g.body.pop();
  return true;
}

export default function (ctx) {
  const { rows, cols } = ctx.board;
  const colour = COLOURS[ctx.settings.colour] || COLOURS.green;
  let g = ctx.store.get("game");
  if (!g || g.rows !== rows || g.cols !== cols) g = newGame(rows, cols);

  if (g.dead) {
    // It flashed red last time: start again
    g = { ...newGame(rows, cols), best: g.best };
  } else {
    const steps = Math.max(1, Math.min(4, Number(ctx.settings.speed) || 2));
    for (let i = 0; i < steps; i++) {
      if (!step(g) || !g.food) {
        g.dead = 1;
        break;
      }
    }
  }
  g.best = Math.max(g.best || 0, g.body.length);
  ctx.store.set("game", g);

  const grid = Array.from({ length: rows }, () => Array(cols).fill(0));
  if (g.food) grid[g.food[0]][g.food[1]] = FOOD;
  g.body.forEach(([r, c], i) => (grid[r][c] = g.dead ? DEAD : i === 0 ? HEAD : colour));
  ctx.log(`length ${g.body.length}, best ${g.best}${g.dead ? ", stuck: starting again" : ""}`);
  return { characters: grid, color: "none" };
}
