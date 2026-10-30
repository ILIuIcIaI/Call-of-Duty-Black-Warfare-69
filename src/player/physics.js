// Character physics shared by player and bots: swept AABB hull vs static boxes,
// with Quake-style step-up for stairs and ground snapping for walking down steps.
export const STEP_HEIGHT = 0.46;
const EPS = 1e-4;
const hmin = [0, 0, 0], hmax = [0, 0, 0];

function setHull(p, r, h) {
  hmin[0] = p.x - r; hmin[1] = p.y; hmin[2] = p.z - r;
  hmax[0] = p.x + r; hmax[1] = p.y + h; hmax[2] = p.z + r;
}

// Moves pos by vel*dt. Mutates pos & vel. Returns info object (reused).
const info = { ground: false, blockedX: false, blockedZ: false, ceiling: false, stepUp: 0, hitWall: false };
export function moveCharacter(col, pos, vel, dt, r, h, wasGrounded) {
  info.ground = false; info.blockedX = false; info.blockedZ = false; info.ceiling = false; info.stepUp = 0; info.hitWall = false;
  const dx = vel.x * dt, dy = vel.y * dt, dz = vel.z * dt;
  const ext = Math.abs(dx) + Math.abs(dz) + STEP_HEIGHT + 0.1;
  col.gather(pos.x - r - ext, pos.y - Math.abs(dy) - STEP_HEIGHT - 0.1, pos.z - r - ext, pos.x + r + ext, pos.y + h + Math.abs(dy) + STEP_HEIGHT + 0.1, pos.z + r + ext);

  // ---- horizontal
  setHull(pos, r, h);
  const sx = pos.x, sy = pos.y, sz = pos.z;
  let ax = col.sweepAxis(0, hmin, hmax, dx);
  pos.x += ax; setHull(pos, r, h);
  let az = col.sweepAxis(2, hmin, hmax, dz);
  pos.z += az; setHull(pos, r, h);
  let bx = Math.abs(ax - dx) > EPS, bz = Math.abs(az - dz) > EPS;

  if ((bx || bz) && wasGrounded && vel.y <= 0.01) {
    // try stepping up
    const px = pos.x, py = pos.y, pz = pos.z;
    pos.x = sx; pos.y = sy; pos.z = sz; setHull(pos, r, h);
    const up = col.sweepAxis(1, hmin, hmax, STEP_HEIGHT);
    pos.y += up; setHull(pos, r, h);
    const ax2 = col.sweepAxis(0, hmin, hmax, dx); pos.x += ax2; setHull(pos, r, h);
    const az2 = col.sweepAxis(2, hmin, hmax, dz); pos.z += az2; setHull(pos, r, h);
    const down = col.sweepAxis(1, hmin, hmax, -up - 0.02);
    pos.y += down; setHull(pos, r, h);
    const progressOld = Math.hypot(px - sx, pz - sz), progressNew = Math.hypot(pos.x - sx, pos.z - sz);
    const landed = down > -up - 0.02 + EPS; // something under us
    if (landed && progressNew > progressOld + 0.001 && pos.y - sy > 0.01) {
      info.stepUp = pos.y - sy;
      ax = ax2; az = az2;
      bx = Math.abs(ax2 - dx) > EPS; bz = Math.abs(az2 - dz) > EPS;
      info.ground = true;
    } else {
      pos.x = px; pos.y = py; pos.z = pz; setHull(pos, r, h);
    }
  }
  if (bx) { vel.x = 0; info.blockedX = true; info.hitWall = true; }
  if (bz) { vel.z = 0; info.blockedZ = true; info.hitWall = true; }

  // ---- vertical
  const ay = col.sweepAxis(1, hmin, hmax, dy);
  pos.y += ay; setHull(pos, r, h);
  if (dy < 0 && ay > dy + EPS) { info.ground = true; vel.y = 0; }
  if (dy > 0 && ay < dy - EPS) { info.ceiling = true; vel.y = 0; }

  // ---- snap down onto stairs / slopes when walking off a small ledge
  if (!info.ground && wasGrounded && vel.y <= 0.01) {
    const sd = col.sweepAxis(1, hmin, hmax, -STEP_HEIGHT);
    if (sd > -STEP_HEIGHT + EPS) { pos.y += sd; info.ground = true; vel.y = 0; info.stepUp = sd; }
  }
  return info;
}

// Can a hull of height h stand at pos?
export function hullFits(col, x, y, z, r, h) {
  return !col.overlaps(x - r, y + 0.01, z - r, x + r, y + h, z + r);
}

// Distance to the nearest wall in the 4 axis directions within maxD. Returns {d, nx, nz} or null.
export function probeWall(col, pos, r, h, maxD, out = {}) {
  setHull(pos, r, h * 0.9);
  hmin[1] = pos.y + 0.3; // ignore the floor/low curbs
  col.gather(pos.x - r - maxD, pos.y, pos.z - r - maxD, pos.x + r + maxD, pos.y + h, pos.z + r + maxD);
  let best = maxD, nx = 0, nz = 0;
  const px = col.sweepAxis(0, hmin, hmax, maxD); if (px < best) { best = px; nx = -1; nz = 0; }
  const mx = -col.sweepAxis(0, hmin, hmax, -maxD); if (mx < best) { best = mx; nx = 1; nz = 0; }
  const pz = col.sweepAxis(2, hmin, hmax, maxD); if (pz < best) { best = pz; nx = 0; nz = -1; }
  const mz = -col.sweepAxis(2, hmin, hmax, -maxD); if (mz < best) { best = mz; nx = 0; nz = 1; }
  if (best >= maxD) return null;
  out.d = best; out.nx = nx; out.nz = nz;
  return out;
}
