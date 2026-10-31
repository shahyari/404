/**
 * Maze generation and path finding. No DOM here.
 *
 * A maze is a grid of cells. `open[i]` is a bit mask of the sides of cell i
 * that have no wall, using the bits in DIRECTIONS.
 */

export const DIRECTIONS = {
  up: { dx: 0, dy: -1, bit: 1, opposite: 4 },
  right: { dx: 1, dy: 0, bit: 2, opposite: 8 },
  down: { dx: 0, dy: 1, bit: 4, opposite: 1 },
  left: { dx: -1, dy: 0, bit: 8, opposite: 2 },
};

const neighbour = ({ cols, rows }, i, { dx, dy }) => {
  const x = (i % cols) + dx;
  const y = Math.floor(i / cols) + dy;
  return x < 0 || y < 0 || x >= cols || y >= rows ? -1 : y * cols + x;
};

/**
 * Carves a maze with a randomized depth-first search, then knocks out a few
 * extra walls so there is more than one route (and wrong turns cost hops).
 */
export function generate(cols, rows, { loops = 0.08, random = Math.random } = {}) {
  const maze = { cols, rows, open: new Uint8Array(cols * rows) };
  const visited = new Uint8Array(cols * rows);
  const stack = [0];
  visited[0] = 1;

  while (stack.length) {
    const i = stack[stack.length - 1];
    const options = Object.values(DIRECTIONS)
      .map((dir) => [dir, neighbour(maze, i, dir)])
      .filter(([, j]) => j >= 0 && !visited[j]);
    if (!options.length) {
      stack.pop();
      continue;
    }
    const [dir, j] = options[Math.floor(random() * options.length)];
    maze.open[i] |= dir.bit;
    maze.open[j] |= dir.opposite;
    visited[j] = 1;
    stack.push(j);
  }

  const extra = Math.round(cols * rows * loops);
  for (let n = 0; n < extra; n++) {
    const i = Math.floor(random() * cols * rows);
    const dir = random() < 0.5 ? DIRECTIONS.right : DIRECTIONS.down;
    const j = neighbour(maze, i, dir);
    if (j < 0) continue;
    maze.open[i] |= dir.bit;
    maze.open[j] |= dir.opposite;
  }
  return maze;
}

/** The cell reached by moving from i in a direction, or -1 if a wall is in the way. */
export function move(maze, i, dir) {
  return maze.open[i] & dir.bit ? neighbour(maze, i, dir) : -1;
}

/** Shortest number of moves from `from` to every cell (breadth-first search). */
export function distances(maze, from) {
  const dist = new Int32Array(maze.cols * maze.rows).fill(-1);
  const queue = [from];
  dist[from] = 0;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    for (const dir of Object.values(DIRECTIONS)) {
      const j = move(maze, i, dir);
      if (j >= 0 && dist[j] < 0) {
        dist[j] = dist[i] + 1;
        queue.push(j);
      }
    }
  }
  return dist;
}
