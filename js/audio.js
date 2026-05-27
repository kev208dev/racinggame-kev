// Minimal Web Audio: only event sounds (lap ding, wall thud).
// Continuous engine hum has been removed per user request.
let ctx = null;
let master = null;
let lastThudAt = 0;

function init() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0.72;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -18;
  limiter.knee.value = 20;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.006;
  limiter.release.value = 0.18;
  master.connect(limiter);
  limiter.connect(ctx.destination);
}

// Engine functions kept as no-ops so existing imports still work.
export function startEngine() {}
export function stopEngine() {}
export function updateEngineSound() {}

export function resumeContext() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

// Short celebratory chord on lap complete.
export function playLapDing(isNewBest = false) {
  try {
    init();
    const now = ctx.currentTime;
    const notes = isNewBest ? [880, 1108, 1318, 1760] : [659, 880, 988];
    notes.forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = freq;
      o.connect(g); g.connect(master);
      const start = now + i * 0.07;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.10, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0005, start + 0.55);
      o.start(start);
      o.stop(start + 0.6);
    });
  } catch (e) {}
}

// Brief impact thud on wall hits.
export function playWallThud(magnitude = 1) {
  try {
    init();
    const now = ctx.currentTime;
    if (now - lastThudAt < 0.08) return;
    lastThudAt = now;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const level = 0.032 * Math.min(1.6, Math.max(0.4, magnitude));
    o.type = 'sine';
    o.frequency.setValueAtTime(118 * (0.82 + Math.random() * 0.22), now);
    o.frequency.exponentialRampToValueAtTime(46, now + 0.22);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(360, now);
    filter.frequency.exponentialRampToValueAtTime(120, now + 0.22);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(level, now + 0.018);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
    o.connect(filter); filter.connect(g); g.connect(master);
    o.start(now); o.stop(now + 0.28);
  } catch (e) {}
}
