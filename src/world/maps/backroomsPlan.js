// =============================================================================
// The floor plan of BACKROOMS, on a grid of 2 m cells: 24 columns (x -24..24)
// and 20 rows (z 20..-20, row 0 in the north). Only the west half is drawn here,
// the east half is its mirror image, so both teams get the same ways.
// Walls stand on the cell edges; one character per edge:
//   '-' or '|' wall up to the ceiling    '^' doorway with wall above it
//   'A' arched doorway                   '=' arched window over a low sill
//   '_' half wall                        ' ' nothing
// Zones give a cell its paper, carpet and light: ' ' yellow, 'p' pale (arches),
// 'r' red, 'd' dark (the lights are out).
// =============================================================================
export const COLS = 24, ROWS = 20, CELL = 2, X0 = -24, Z0 = 20;

function draw(P) {
  const { zone, h, v, pillar, post, hole, spawn } = P;
  // ---------------------------------------------------------------- north: two arch rooms and their gallery, the red room
  zone(0, 0, 6, 3, 'p');
  zone(8, 0, 11, 2, 'r');
  v(3, 0, 'A|');
  v(7, 0, 'A|');
  v(8, 0, '|^|');
  h(2, 0, '-=A==A=');
  h(3, 8, '-  -');
  pillar(9, 1); pillar(11, 1);
  h(4, 0, '- --^-A');
  h(4, 7, '-^-- ');
  v(12, 3, '|'); // (from one gallery straight into the other would be a line from spawn to spawn)

  // ---------------------------------------------------------------- middle: spawn hall, maze, pillar hall
  v(3, 4, '| |^|| |^|');
  v(7, 4, '|^|| ||A||');
  pillar(1, 9); pillar(2, 11);
  h(12, 0, '_');
  for (const [c, r] of [[0, 5], [1, 6], [0, 7], [1, 8], [0, 10], [1, 11], [0, 12], [1, 13]]) spawn(c, r);
  // the maze between spawn and pillar hall: no straight way through
  v(5, 4, '||');
  h(7, 3, '--');
  v(5, 8, '|');
  h(10, 5, '^-');
  v(4, 10, '|');
  pillar(5, 12);
  h(13, 3, '_');
  // pillar hall: a pillar on every second corner
  for (const k of [8, 10, 12]) for (const r of [6, 8, 10, 12]) post(k, r);

  // ---------------------------------------------------------------- south: office, the holes, the dark
  zone(8, 14, 11, 19, 'd');
  h(14, 0, '-^ ');
  h(14, 3, '- -^');
  h(14, 7, '-^- -');
  v(4, 14, '|^|| |');
  v(8, 14, '|| |^|');
  // office: half-height partitions
  h(16, 0, '__ _');
  h(18, 1, '_ _');
  v(2, 16, '_ _');
  // holes
  for (const [c, r] of [[5, 15], [7, 17], [5, 18]]) hole(c, r);
  // the dark: a maze of its own
  v(10, 14, '| |');
  h(17, 8, '- -');
  v(11, 17, '||');
  pillar(9, 19);
}

// The whole map, both halves: what every cell and edge is.
export function buildPlan() {
  const cells = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => ({ zone: ' ', what: null, spawn: false })));
  const hE = Array.from({ length: ROWS + 1 }, () => new Array(COLS).fill(' ')); // hE[r][c]: north edge of cell (c, r)
  const vE = Array.from({ length: ROWS }, () => new Array(COLS + 1).fill(' ')); // vE[r][k]: west edge of cell (k, r)
  const posts = new Set();
  const mc = (c) => COLS - 1 - c, mk = (k) => COLS - k;
  const P = {
    zone(c0, r0, c1, r1, z) { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { cells[r][c].zone = z; cells[r][mc(c)].zone = z; } },
    h(r, c0, pat) { [...pat].forEach((ch, i) => { if (ch !== ' ') { hE[r][c0 + i] = ch; hE[r][mc(c0 + i)] = ch; } }); },
    v(k, r0, pat) { [...pat].forEach((ch, i) => { if (ch !== ' ') { vE[r0 + i][k] = ch; vE[r0 + i][mk(k)] = ch; } }); },
    pillar(c, r) { cells[r][c].what = 'pillar'; cells[r][mc(c)].what = 'pillar'; },
    post(k, r) { posts.add(k + ',' + r); posts.add(mk(k) + ',' + r); },
    hole(c, r) { cells[r][c].what = 'hole'; cells[r][mc(c)].what = 'hole'; },
    spawn(c, r) { cells[r][c].spawn = 0; cells[r][mc(c)].spawn = 1; },
  };
  draw(P);
  // the outer walls
  for (let c = 0; c < COLS; c++) { hE[0][c] = '#'; hE[ROWS][c] = '#'; }
  for (let r = 0; r < ROWS; r++) { vE[r][0] = '#'; vE[r][COLS] = '#'; }
  return { cells, hE, vE, posts: [...posts].map((s) => s.split(',').map(Number)) };
}
