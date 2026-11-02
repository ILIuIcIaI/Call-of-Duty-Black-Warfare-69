// =============================================================================
// Where somebody on another computer is, from the states he sends. Each state carries
// the sender's own clock, so one that comes late still lands where it belongs instead
// of bunching up with the next. It is shown a little in the past, just far enough to
// always have the next state at hand; if one goes missing, the last movement carries
// on for a moment. No imports: tools can test it on its own.
// =============================================================================

// The sender's clock in this computer's time. The smallest gap ever seen is the network
// at its fastest; whatever comes later than that is how much it wobbles.
export class Clock {
  constructor() { this.off = null; this.late = 0; }
  local(senderMs, nowMs) {
    const d = nowMs - senderMs;
    if (this.off === null || d < this.off) this.off = d;
    else this.off += (d - this.off) * 0.002; // (two clocks never run exactly alike)
    const late = d - this.off;
    // up quickly, down slowly: one bad moment on the network is followed by more
    this.late = late > this.late ? this.late + (late - this.late) * 0.3 : this.late + (late - this.late) * 0.01;
    return senderMs + this.off;
  }
}

export const MAX_AHEAD = 120; // ms a body moves on by itself after the last state

export class Track {
  constructor() { this.buf = []; this.gap = 50; }
  get last() { return this.buf[this.buf.length - 1]; }
  push(t, s) {
    const b = this.buf, last = this.last;
    if (last && t <= last.t) { if (t === last.t) last.s = s; return; }
    if (last) this.gap += (Math.min(250, t - last.t) - this.gap) * 0.15;
    b.push({ t, s });
    if (b.length > 40) b.shift();
  }
  reset(t, s) { this.buf = [{ t, s }]; }
  // How far behind the present to show it: one gap between states, and the wobble of the clock.
  delay(clock) { return Math.max(35, Math.min(260, this.gap * 1.15 + (clock ? clock.late * 1.3 : 30) + 6)); }
  // the two states around `at` and how far between them (past 1 when it runs on after the newest)
  sample(at, out) {
    const b = this.buf;
    while (b.length > 2 && b[1].t <= at) b.shift();
    const A = b[0], B = b[1] || b[0];
    out.A = A; out.B = B;
    if (B === A) { out.u = 1; return out; }
    const span = B.t - A.t;
    out.u = Math.max(0, Math.min(1 + MAX_AHEAD / span, (at - A.t) / span));
    return out;
  }
}
