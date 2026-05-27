// Remote-car interpolation buffer.
// We sample server snapshots ~20Hz, render at the local frame rate, and play
// back state 100ms behind "now" so we always have two samples to lerp between.
// Falls back to extrapolation up to 250ms when newer samples haven't arrived.

const RENDER_DELAY_MS = 100;
const MAX_EXTRAPOLATION_MS = 250;
const BUFFER_MAX = 8;

export class RemoteCarInterp {
  constructor() {
    this.samples = []; // sorted by serverTime ascending
    this.offsetEstimate = null; // serverNow - localNow
  }

  push(serverTime, snap) {
    const sample = {
      serverTime,
      x: snap.x,
      y: snap.y,
      a: snap.a,
      vx: snap.vx,
      vy: snap.vy,
      g: snap.g,
      drift: !!snap.drift,
      boost: !!snap.boost,
      drs: !!snap.drs,
      lap: snap.lap,
      finished: !!snap.finished,
    };
    const last = this.samples[this.samples.length - 1];
    if (last && serverTime <= last.serverTime) return;
    if (last) {
      const dAng = wrapAngle(sample.a - last.a);
      sample.a = last.a + dAng;
    }
    this.samples.push(sample);
    while (this.samples.length > BUFFER_MAX) this.samples.shift();
    const localNow = performance.now();
    const measured = serverTime - localNow;
    this.offsetEstimate = this.offsetEstimate == null
      ? measured
      : this.offsetEstimate * 0.92 + measured * 0.08;
  }

  /**
   * Sample interpolated state at the local clock.
   * Returns null if the buffer is empty.
   */
  sample(localNow) {
    if (this.samples.length === 0) return null;
    const offset = this.offsetEstimate ?? 0;
    const renderTime = localNow + offset - RENDER_DELAY_MS;

    const samples = this.samples;
    if (samples.length === 1) {
      return this._extrapolate(samples[0], renderTime);
    }

    let a = null, b = null;
    for (let i = 0; i < samples.length - 1; i++) {
      if (samples[i].serverTime <= renderTime && renderTime <= samples[i + 1].serverTime) {
        a = samples[i];
        b = samples[i + 1];
        break;
      }
    }
    if (a && b) {
      const span = b.serverTime - a.serverTime || 1;
      const t = Math.max(0, Math.min(1, (renderTime - a.serverTime) / span));
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        a: a.a + (b.a - a.a) * t,
        vx: a.vx + (b.vx - a.vx) * t,
        vy: a.vy + (b.vy - a.vy) * t,
        g: t < 0.5 ? a.g : b.g,
        drift: t < 0.5 ? a.drift : b.drift,
        boost: t < 0.5 ? a.boost : b.boost,
        drs: t < 0.5 ? a.drs : b.drs,
        lap: Math.max(a.lap, b.lap),
        finished: a.finished || b.finished,
      };
    }

    const newest = samples[samples.length - 1];
    if (renderTime > newest.serverTime) {
      return this._extrapolate(newest, renderTime);
    }
    const oldest = samples[0];
    return cloneSample(oldest);
  }

  _extrapolate(sample, renderTime) {
    const ahead = Math.min(MAX_EXTRAPOLATION_MS, renderTime - sample.serverTime);
    const dt = Math.max(0, ahead) / 1000;
    return {
      x: sample.x + sample.vx * dt,
      y: sample.y + sample.vy * dt,
      a: sample.a,
      vx: sample.vx,
      vy: sample.vy,
      g: sample.g,
      drift: sample.drift,
      boost: sample.boost,
      drs: sample.drs,
      lap: sample.lap,
      finished: sample.finished,
    };
  }
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function cloneSample(s) {
  return {
    x: s.x, y: s.y, a: s.a,
    vx: s.vx, vy: s.vy, g: s.g,
    drift: s.drift, boost: s.boost, drs: s.drs,
    lap: s.lap, finished: s.finished,
  };
}
