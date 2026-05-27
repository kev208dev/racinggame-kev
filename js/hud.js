import { formatTime } from '../utils/math.js';
import { KMH_PER_UNIT, TOP_SPEED_MULT } from './physics.js';

export function drawHUD(ctx, car, timing, canvasW, canvasH, track, ghost = null) {
  const kmh = car.speed * KMH_PER_UNIT;
  const rpmRatio = car.rpm / car.maxRpm;

  ctx.save();
  ctx.resetTransform();

  // --- bottom cockpit cluster ---
  const barH = 118;
  const barY = canvasH - barH;
  const panel = ctx.createLinearGradient(0, barY, 0, canvasH);
  panel.addColorStop(0, 'rgba(12,16,22,0.78)');
  panel.addColorStop(1, 'rgba(3,5,8,0.94)');
  ctx.fillStyle = panel;
  ctx.fillRect(0, barY, canvasW, barH);
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, barY + 0.5);
  ctx.lineTo(canvasW, barY + 0.5);
  ctx.stroke();

  // Speedometer
  _speedometer(ctx, kmh, car.maxSpeed * TOP_SPEED_MULT, 86, barY + 60);

  // RPM bar
  _rpmBar(ctx, rpmRatio, 180, barY + 22, canvasW * 0.36, 24);

  // gear (large, with redline flash + auto/manual badge)
  const gearX = 300, gearY = barY + 75;
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = (car.transmission === 'manual') ? '#f4a261' : '#79b8ff';
  ctx.fillText(car.transmission === 'manual' ? 'MANUAL' : 'AUTO', gearX, barY + 18);

  const redline = rpmRatio > 0.92;
  ctx.font = 'bold 56px monospace';
  ctx.fillStyle = redline ? (Math.floor(performance.now() / 100) % 2 === 0 ? '#ff3b3b' : '#fff') : '#fff';
  ctx.fillText(car.gear === 0 ? 'N' : car.gear, gearX, gearY + 8);

  // off-track + drift status (left of the gear digit)
  ctx.font = '13px monospace';
  ctx.textAlign = 'left';
  if (car.offTrack) {
    ctx.fillStyle = '#f4a261';
    ctx.fillText('OFF TRACK', 180, barY + 55);
  } else if (car.drifting) {
    ctx.fillStyle = '#9be9a8';
    ctx.fillText('DRIFT!', 180, barY + 55);
  }

  // boost meters
  _boostMeter(ctx, car, 180, barY + 82, canvasW * 0.24, 10);
  _superBoostMeter(ctx, car, 180, barY + 106, canvasW * 0.24, 8);

  // live lap timer (top-center)
  if (timing.started && timing.lapStart !== null) {
    const elapsed = performance.now() - timing.lapStart;
    ctx.font = 'bold 24px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.textAlign = 'center';
    ctx.fillText(formatTime(elapsed), canvasW / 2, 36);
  }

  if (track?.name) {
    ctx.font = 'bold 15px system-ui';
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.textAlign = 'center';
    ctx.fillText(track.name, canvasW / 2, 64);
  }

  // lap times
  const lapX = canvasW - 315;
  ctx.textAlign = 'left';
  ctx.font = '14px monospace';
  ctx.fillStyle = '#aaa';
  ctx.fillText('LAST', lapX, barY + 28);
  ctx.font = 'bold 20px monospace';
  ctx.fillStyle = '#fff';
  ctx.fillText(timing.currentLap ? formatTime(timing.currentLap) : '--:--.---', lapX, barY + 52);

  ctx.font = '12px monospace';
  ctx.fillStyle = '#aaa';
  ctx.fillText('BEST', lapX + 150, barY + 28);
  ctx.font = 'bold 16px monospace';
  ctx.fillStyle = '#c77dff';
  ctx.fillText(timing.bestLap ? formatTime(timing.bestLap) : '--:--.---', lapX + 150, barY + 52);

  // sectors
  _sectors(ctx, timing, lapX, barY + 74, canvasW);

  // off-track warning (top-center)
  if (car.offTrack) {
    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = '#f4a261';
    ctx.textAlign = 'center';
    ctx.fillText('OFF TRACK', canvasW / 2, 50);
  }

  // top-left hint (before first lap start)
  if (!timing.started) {
    ctx.font = '13px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.textAlign = 'left';
    ctx.fillText('W/A/S/D 로 주행 — 출발선 통과 시 랩 시작', 10, 24);
  }

  // minimap (top-right)
  if (track) _drawMinimap(ctx, car, track, canvasW - 250, 20, 230, 165, ghost);

  ctx.restore();
}

// ── minimap ──────────────────────────────────────────────────
let _miniCache = null;
let _miniCacheKey = null;

function _drawMinimap(ctx, car, track, x, y, w, h, ghost) {
  // Build & cache static layer (background + track outline) per-track.
  if (_miniCacheKey !== track.id) {
    _miniCache = _buildMinimap(track, w, h);
    _miniCacheKey = track.id;
  }
  ctx.drawImage(_miniCache.canvas, x, y);
  const m = _miniCache;

  if (ghost?.path?.length) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.9)';
    ctx.lineWidth = 2.2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ghost.path.forEach((p, i) => {
      const gx = x + (p.x - m.minX) * m.scale + m.padX;
      const gy = y + (p.y - m.minY) * m.scale + m.padY;
      if (i === 0) ctx.moveTo(gx, gy);
      else ctx.lineTo(gx, gy);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    const head = ghost.path[Math.min(ghost.path.length - 1, Math.floor(ghost.path.length * 0.55))];
    const hx = x + (head.x - m.minX) * m.scale + m.padX;
    const hy = y + (head.y - m.minY) * m.scale + m.padY;
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(hx, hy, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Live overlay: car position dot.
  const cx = x + (car.x - m.minX) * m.scale + m.padX;
  const cy = y + (car.y - m.minY) * m.scale + m.padY;
  // direction indicator
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.atan2(Math.sin(car.angle), Math.cos(car.angle)));
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4, 3);
  ctx.lineTo(-4, -3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function _buildMinimap(track, w, h) {
  const cv  = document.createElement('canvas');
  cv.width  = w;
  cv.height = h;
  const c   = cv.getContext('2d');

  const pts  = track.outerBoundary;
  const xs   = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad  = 12;
  const scale = Math.min((w - pad * 2) / (maxX - minX), (h - pad * 2) / (maxY - minY));
  const padX  = pad + (w - pad * 2 - (maxX - minX) * scale) / 2;
  const padY  = pad + (h - pad * 2 - (maxY - minY) * scale) / 2;
  const tp    = ([px, py]) => [(px - minX) * scale + padX, (py - minY) * scale + padY];

  // panel background
  const bg = c.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, 'rgba(12,18,26,0.86)');
  bg.addColorStop(1, 'rgba(44,55,62,0.72)');
  c.fillStyle = bg;
  c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(255,255,255,0.32)';
  c.lineWidth = 1;
  c.strokeRect(0.5, 0.5, w - 1, h - 1);

  // track surface (outer minus inner, evenodd fill)
  c.beginPath();
  c.moveTo(...tp(track.outerBoundary[0]));
  for (const p of track.outerBoundary) c.lineTo(...tp(p));
  c.closePath();
  c.moveTo(...tp(track.innerBoundary[0]));
  for (const p of track.innerBoundary) c.lineTo(...tp(p));
  c.closePath();
  c.fillStyle = '#666';
  c.fill('evenodd');

  const center = track.centerLine || [];
  if (center.length) {
    const colors = [track.accentColor || '#ffd166', track.sectors?.[0]?.color || '#2ec4b6', track.sectors?.[1]?.color || '#c77dff'];
    for (let s = 0; s < 3; s++) {
      const a = Math.floor(center.length * s / 3);
      const b = Math.floor(center.length * (s + 1) / 3);
      c.strokeStyle = colors[s];
      c.lineWidth = 4.2;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(...tp(center[a]));
      for (let i = a + 1; i < b; i++) c.lineTo(...tp(center[i]));
      c.stroke();
    }
  }

  // outline
  c.strokeStyle = 'rgba(255,255,255,0.82)';
  c.lineWidth = 1.1;
  c.beginPath();
  c.moveTo(...tp(track.outerBoundary[0]));
  for (const p of track.outerBoundary) c.lineTo(...tp(p));
  c.closePath();
  c.stroke();

  // start line
  if (track.startLine) {
    const sl = track.startLine;
    const [sx1, sy1] = tp([sl.x1, sl.y1]);
    const [sx2, sy2] = tp([sl.x2, sl.y2]);
    c.strokeStyle = '#fff';
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(sx1, sy1);
    c.lineTo(sx2, sy2);
    c.stroke();
  }

  return { canvas: cv, minX, minY, scale, padX, padY };
}

function _speedometer(ctx, kmh, maxKmh, cx, cy) {
  const r = 45;
  // background circle
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  const face = ctx.createRadialGradient(cx, cy, 8, cx, cy, r);
  face.addColorStop(0, 'rgba(35,43,54,0.95)');
  face.addColorStop(1, 'rgba(5,8,12,0.95)');
  ctx.fillStyle = face;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // speed arc
  const ratio  = Math.min(kmh / maxKmh, 1);
  const start  = -Math.PI * 0.8;
  const end    = start + ratio * Math.PI * 1.6;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 4, start, end);
  ctx.strokeStyle = ratio > 0.85 ? '#e63946' : '#2ec4b6';
  ctx.lineWidth = 6;
  ctx.stroke();
  const needle = start + ratio * Math.PI * 1.6;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(needle) * (r - 11), cy + Math.sin(needle) * (r - 11));
  ctx.stroke();
  ctx.fillStyle = '#2ec4b6';
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();

  // speed text
  ctx.font = 'bold 18px monospace';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText(Math.round(kmh), cx, cy + 6);
  ctx.font = '10px monospace';
  ctx.fillStyle = '#aaa';
  ctx.fillText('km/h', cx, cy + 20);
}

function _rpmBar(ctx, ratio, x, y, w, h) {
  ctx.fillStyle = '#222';
  ctx.fillRect(x, y, w, h);
  const color = ratio > 0.85 ? '#e63946' : ratio > 0.65 ? '#f4a261' : '#2ec4b6';
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * ratio, h);
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  ctx.font = '10px monospace';
  ctx.fillStyle = '#aaa';
  ctx.textAlign = 'left';
  ctx.fillText('RPM', x, y - 3);
}

function _boostMeter(ctx, car, x, y, w, h) {
  const rawMeter = car.boostMeter || 0;
  const meter = Math.max(0, Math.min(100, rawMeter)) / 100;
  // background
  ctx.fillStyle = '#222';
  ctx.fillRect(x, y, w, h);
  // fill (green at low, gold at high, magenta when actively boosting)
  let col = '#5acdb3';
  if (meter > 0.66) col = '#f0c060';
  if (car.boosting) col = '#e040ff';
  ctx.fillStyle = col;
  ctx.fillRect(x, y, w * meter, h);
  // outline
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  // label
  ctx.font = '10px monospace';
  ctx.fillStyle = '#aaa';
  ctx.textAlign = 'left';
  ctx.fillText('BOOST', x, y - 2);
  // ready hint
  if ((car.boostMeter || 0) >= (car.boostCost || 38) && !car.boosting) {
    ctx.fillStyle = '#9be9a8';
    ctx.textAlign = 'right';
    ctx.fillText('SHIFT', x + w, y - 2);
  }
}

function _superBoostMeter(ctx, car, x, y, w, h) {
  const rawMeter = car.superBoostMeter ?? 100;
  const meter = Math.max(0, Math.min(100, rawMeter)) / 100;
  ctx.fillStyle = '#111820';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = car.drsActive ? '#53f7ff' : car.drsAvailable ? '#32d3ff' : '#355566';
  ctx.fillRect(x, y, w * meter, h);
  ctx.strokeStyle = car.drsAvailable ? '#7eefff' : '#3d4b55';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  ctx.font = '10px monospace';
  ctx.fillStyle = car.drsAvailable ? '#9ff8ff' : '#7b8b92';
  ctx.textAlign = 'left';
  ctx.fillText('DRX', x, y - 2);
  if (car.drsAvailable && !car.drsActive && rawMeter > 8) {
    ctx.textAlign = 'right';
    ctx.fillText('SHIFT x2', x + w, y - 2);
  }
}

function _sectors(ctx, timing, x, y, canvasW) {
  const labels = ['S1', 'S2', 'S3'];
  let dx = 0;
  for (let i = 0; i < 3; i++) {
    const t = timing.sectorTimes[i];
    const best = timing.sectorBest[i];
    let color = '#aaa';
    if (t !== null) {
      color = (best && t <= best) ? '#c77dff' : '#4caf50';
    }
    ctx.font = '11px monospace';
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.fillText(`${labels[i]} ${t !== null ? formatTime(t) : '--:--.---'}`, x + dx, y);
    ctx.fillStyle = '#7d8590';
    ctx.fillText(`BEST ${best ? formatTime(best) : '--:--.---'}`, x + dx, y + 17);
    dx += 105;
  }
}
