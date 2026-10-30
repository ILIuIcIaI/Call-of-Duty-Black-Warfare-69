// =============================================================================
// Full-screen scope pictures. Each one is painted once onto the HUD canvas
// (black surround, glass tint, reticle); the world shows through the hole.
// =============================================================================
const line = (x, x0, y0, x1, y1, w, col) => {
  x.fillStyle = col;
  if (y0 === y1) x.fillRect(Math.min(x0, x1), y0 - w / 2, Math.abs(x1 - x0), w);
  else x.fillRect(x0 - w / 2, Math.min(y0, y1), w, Math.abs(y1 - y0));
};
const dot = (x, cx, cy, r, col) => { x.fillStyle = col; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); };
const scanlines = (x, x0, y0, w, h, step, alpha) => {
  x.fillStyle = `rgba(0,0,0,${alpha})`;
  for (let y = y0; y < y0 + h; y += step) x.fillRect(x0, y, w, 1);
};

// round glass: dark toward the edge, solid black around it
function roundGlass(x, W, H, cx, cy, R) {
  const g = x.createRadialGradient(cx, cy, R * 0.8, cx, cy, R);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.72, 'rgba(0,0,0,0.5)'); g.addColorStop(1, '#000');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
}

const DRAW = {
  // 8x: thin cross, thicker center bar, red dot
  duplex(x, W, H, cx, cy, R) {
    roundGlass(x, W, H, cx, cy, R);
    line(x, cx - R, cy, cx + R, cy, 2, '#000');
    line(x, cx, cy - R, cx, cy + R, 2, '#000');
    line(x, cx - R * 0.4, cy, cx + R * 0.4, cy, 4, '#000');
    x.shadowColor = '#ff3030'; x.shadowBlur = 6;
    dot(x, cx, cy, 3, '#e02020');
    x.shadowBlur = 0;
  },

  // 5x hunting glass: three heavy posts that stop short of a fine cross, warm tint
  hunter(x, W, H, cx, cy, R) {
    x.fillStyle = 'rgba(255,205,140,0.05)'; x.fillRect(0, 0, W, H);
    roundGlass(x, W, H, cx, cy, R);
    const gap = R * 0.22;
    x.fillStyle = '#000';
    x.fillRect(cx - R, cy - 5, R - gap, 10);
    x.fillRect(cx + gap, cy - 5, R - gap, 10);
    x.beginPath(); x.moveTo(cx - 7, cy + R); x.lineTo(cx - 7, cy + gap + 16); x.lineTo(cx, cy + gap); x.lineTo(cx + 7, cy + gap + 16); x.lineTo(cx + 7, cy + R); x.closePath(); x.fill();
    line(x, cx - gap, cy, cx + gap, cy, 1.5, '#000');
    line(x, cx, cy - gap, cx, cy + gap, 1.5, '#000');
    x.shadowColor = '#ff9a30'; x.shadowBlur = 5;
    dot(x, cx, cy, 2.2, '#ffb040');
    x.shadowBlur = 0;
  },

  // 12x: fine cross, mil dots on both axes, holdover marks for long shots
  mildot(x, W, H, cx, cy, R) {
    x.fillStyle = 'rgba(160,190,220,0.04)'; x.fillRect(0, 0, W, H);
    roundGlass(x, W, H, cx, cy, R);
    line(x, cx - R, cy, cx + R, cy, 1.5, '#000');
    line(x, cx, cy - R, cx, cy + R, 1.5, '#000');
    line(x, cx - R, cy, cx - R * 0.84, cy, 6, '#000');
    line(x, cx + R * 0.84, cy, cx + R, cy, 6, '#000');
    line(x, cx, cy - R, cx, cy - R * 0.84, 6, '#000');
    line(x, cx, cy + R * 0.84, cx, cy + R, 6, '#000');
    const s = R * 0.082;
    for (let i = 1; i <= 9; i++) {
      for (const [dx, dy] of [[i, 0], [-i, 0], [0, -i], [0, i]]) {
        dot(x, cx + dx * s, cy + dy * s, 3.4, 'rgba(255,255,255,0.35)');
        dot(x, cx + dx * s, cy + dy * s, 2.8, '#000');
      }
    }
    // holdover marks with range labels to the right of the lower axis
    x.font = `700 ${Math.round(R * 0.032)}px Rajdhani, sans-serif`;
    x.textBaseline = 'middle';
    [200, 300, 400, 500, 600].forEach((m, i) => {
      const y = cy + (i + 1) * s * 1.5 + s * 0.25, len = 16 + i * 7;
      line(x, cx, y, cx + len, y, 1.5, '#000');
      x.fillStyle = 'rgba(255,255,255,0.8)'; x.fillText(String(m), cx + len + 7, y + 0.8);
      x.fillStyle = '#000'; x.fillText(String(m), cx + len + 6, y);
    });
    x.shadowColor = '#ff3030'; x.shadowBlur = 4;
    dot(x, cx, cy, 1.7, '#ff3020');
    x.shadowBlur = 0;
  },

  // 8x thermal: sensor scan lines, open white cross, corner marks
  thermal(x, W, H, cx, cy, R) {
    scanlines(x, 0, 0, W, H, 3, 0.11);
    roundGlass(x, W, H, cx, cy, R);
    const w = 'rgba(255,255,255,0.92)', gap = R * 0.09;
    line(x, cx - R * 0.8, cy, cx - gap, cy, 2, w);
    line(x, cx + gap, cy, cx + R * 0.8, cy, 2, w);
    line(x, cx, cy - R * 0.8, cx, cy - gap, 2, w);
    line(x, cx, cy + gap, cx, cy + R * 0.8, 2, w);
    dot(x, cx, cy, 2, '#fff');
    const b = R * 0.26, n = R * 0.07;
    x.strokeStyle = w; x.lineWidth = 2;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      x.beginPath(); x.moveTo(cx + sx * b, cy + sy * (b - n)); x.lineTo(cx + sx * b, cy + sy * b); x.lineTo(cx + sx * (b - n), cy + sy * b); x.stroke();
    }
    x.fillStyle = w; x.font = `700 ${Math.round(R * 0.04)}px Rajdhani, sans-serif`; x.textAlign = 'center';
    x.fillText('WEISS-HEISS  ·  8x', cx, cy + R * 0.72);
    x.textAlign = 'left';
  },

  // 10x digital: a rectangular screen with a green chevron and an elevation tape
  digital(x, W, H, cx, cy) {
    const sw = Math.min(W * 0.84, H * 1.46), sh = H * 0.86, l = cx - sw / 2, t = cy - sh / 2;
    x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = 'destination-out';
    x.beginPath(); x.roundRect(l, t, sw, sh, 22); x.fill();
    x.globalCompositeOperation = 'source-over';
    x.save();
    x.beginPath(); x.roundRect(l, t, sw, sh, 22); x.clip();
    x.fillStyle = 'rgba(30,255,180,0.055)'; x.fillRect(l, t, sw, sh);
    scanlines(x, l, t, sw, sh, 3, 0.07);
    const v = x.createRadialGradient(cx, cy, sh * 0.42, cx, cy, sw * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.6)');
    x.fillStyle = v; x.fillRect(l, t, sw, sh);
    x.restore();
    const g = '#5dffb0';
    x.strokeStyle = g; x.fillStyle = g; x.lineWidth = 2;
    x.shadowColor = 'rgba(40,255,170,0.7)'; x.shadowBlur = 6;
    // chevron: its tip is the aim point
    x.beginPath(); x.moveTo(cx - 17, cy + 22); x.lineTo(cx, cy); x.lineTo(cx + 17, cy + 22); x.stroke();
    line(x, cx - 130, cy, cx - 46, cy, 2, g);
    line(x, cx + 46, cy, cx + 130, cy, 2, g);
    for (const i of [1, 2, 3]) line(x, cx - 7 + i * 1.5, cy + 34 + i * 22, cx + 7 - i * 1.5, cy + 34 + i * 22, 2, g);
    // screen corners
    const m = 46, n = 30;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const qx = cx + sx * (sw / 2 - m), qy = cy + sy * (sh / 2 - m);
      x.beginPath(); x.moveTo(qx - sx * n, qy); x.lineTo(qx, qy); x.lineTo(qx, qy - sy * n); x.stroke();
    }
    // elevation tape on the left
    const tx = cx - sw * 0.33; // clear of the minimap
    x.font = '700 15px Rajdhani, sans-serif'; x.textBaseline = 'middle';
    for (let i = -6; i <= 6; i++) {
      const y = cy + i * 28, big = i % 2 === 0;
      line(x, tx, y, tx + (big ? 18 : 10), y, 2, g);
      if (big) x.fillText(String(-i * 5), tx + 24, y);
    }
    x.font = '700 18px Rajdhani, sans-serif';
    x.fillText('BW-10 DIGITAL', tx, cy - sh / 2 + 62);
    x.textAlign = 'right';
    x.fillText('10x  ·  STAB', cx + sw * 0.33, cy - sh / 2 + 62);
    x.textAlign = 'left';
    x.shadowBlur = 0;
  },
};

export function drawScope(c, kind) {
  const W = c.width = window.innerWidth, H = c.height = window.innerHeight, x = c.getContext('2d');
  x.clearRect(0, 0, W, H);
  (DRAW[kind] || DRAW.duplex)(x, W, H, W / 2, H / 2, H * 0.46);
}
