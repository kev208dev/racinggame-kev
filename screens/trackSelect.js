import { TRACKS } from '../data/tracks.js';

let selectedIndex = 0;
let onSelect      = null;
let onBack        = null;
let raceMode      = 'online';

export function initTrackSelect(cb, backCb, options = {}) {
  onSelect      = cb;
  onBack        = backCb;
  raceMode      = options.mode || 'online';
  selectedIndex = 0;
  _render();
}

// ── render ───────────────────────────────────────────────────
function _render() {
  const grid = document.getElementById('track-grid');
  if (!grid) return;
  grid.innerHTML = '';

  TRACKS.forEach((track, i) => {
    const card = document.createElement('div');
    card.className = 'track-card' + (i === selectedIndex ? ' selected' : '');

    // mini-map canvas
    const cv = document.createElement('canvas');
    cv.className = 'track-map';
    cv.width  = 320;
    cv.height = 190;
    _drawMiniMap(cv, track);
    card.appendChild(cv);

    // info
    const info = document.createElement('div');
    info.className = 'track-info';
    const cornerText = track.famousCorners?.length ? track.famousCorners.join(' / ') : '';
    info.innerHTML = `
      <h3>${track.name}</h3>
      ${track.gpName ? `<span class="track-gp">${track.country} · ${track.gpName}</span>` : ''}
      <span>${track.length}</span>
      ${track.laps ? `<span>${track.laps} laps</span>` : ''}
      ${track.turns ? `<span>${track.turns} turns</span>` : ''}
      ${track.firstGrandPrix ? `<span>since ${track.firstGrandPrix}</span>` : ''}
      <span>난이도: ${track.difficulty}</span>
      ${track.desc ? `<span class="desc">${track.desc}</span>` : ''}
      ${track.character ? `<span class="desc track-character">${track.character}</span>` : ''}
      ${cornerText ? `<span class="desc">Famous corners: ${cornerText}</span>` : ''}
      ${track.fastestLapRecord ? `<span class="desc">Fastest lap: ${track.fastestLapRecord} · ${track.fastestLapDriver}</span>` : ''}
      ${track.polePositionRecord ? `<span class="desc">Pole record: ${track.polePositionRecord} · ${track.polePositionDriver}</span>` : ''}
      ${track.mostWinsDriver ? `<span class="desc">Most wins: ${track.mostWinsDriver} (${track.mostWinsCount})</span>` : ''}
      ${track.iconicMomentTitle ? `<span class="desc">Iconic moment: ${track.iconicMomentTitle}</span>` : ''}
    `;
    card.appendChild(info);

    if (i === selectedIndex) {
      const badge = document.createElement('span');
      badge.className = 'track-selected-badge';
      badge.textContent = '✓ 선택됨';
      card.appendChild(badge);
    }

    card.addEventListener('click', () => { selectedIndex = i; _render(); });
    grid.appendChild(card);
  });

  // ── buttons ──
  const backBtn  = document.getElementById('btn-back-car');
  const startBtn = document.getElementById('btn-start-game');
  const modeEl = document.getElementById('track-mode-label');
  const ghostBox = document.getElementById('ghost-option-box');
  const ghostToggle = document.getElementById('track-ghost-toggle');
  if (modeEl) modeEl.textContent = raceMode === 'offline' ? '오프라인 연습' : '온라인 랭킹';
  if (ghostBox) ghostBox.classList.toggle('hidden', raceMode !== 'offline');
  if (backBtn)  backBtn.onclick  = () => { if (onBack)   onBack(); };
  if (startBtn) startBtn.onclick = () => {
    if (onSelect) onSelect(TRACKS[selectedIndex], {
      mode: raceMode,
      ghostEnabled: raceMode === 'offline' && !!ghostToggle?.checked,
    });
  };
}

// ── mini map drawing ─────────────────────────────────────────
function _drawMiniMap(canvas, track) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;

  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#101820');
  bg.addColorStop(0.55, track.backgroundColor || '#2d5a1b');
  bg.addColorStop(1, '#0b1117');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const pts  = track.outerBoundary;
  const xs   = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad  = 16;
  const scale = Math.min((w - pad*2) / (maxX - minX), (h - pad*2) / (maxY - minY));
  const offX  = pad + (w - pad*2 - (maxX - minX) * scale) / 2 - minX * scale;
  const offY  = pad + (h - pad*2 - (maxY - minY) * scale) / 2 - minY * scale;
  const tp    = ([x, y]) => [x * scale + offX, y * scale + offY];

  // track surface (evenodd)
  ctx.beginPath();
  ctx.moveTo(...tp(track.outerBoundary[0]));
  for (const p of track.outerBoundary) ctx.lineTo(...tp(p));
  ctx.closePath();
  ctx.moveTo(...tp(track.innerBoundary[0]));
  for (const p of track.innerBoundary) ctx.lineTo(...tp(p));
  ctx.closePath();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = track.trackColor || '#3e3e3e';
  ctx.fill('evenodd');
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // F1-style colored sector centerline
  const center = track.centerLine || [];
  if (center.length) {
    const colors = [track.accentColor || '#ffd166', track.sectors?.[0]?.color || '#2ec4b6', track.sectors?.[1]?.color || '#c77dff'];
    for (let s = 0; s < 3; s++) {
      const a = Math.floor(center.length * s / 3);
      const b = Math.floor(center.length * (s + 1) / 3);
      ctx.strokeStyle = colors[s];
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(...tp(center[a]));
      for (let i = a + 1; i < b; i++) ctx.lineTo(...tp(center[i]));
      ctx.stroke();
    }
  }

  // outer edge
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(...tp(track.outerBoundary[0]));
  for (const p of track.outerBoundary) ctx.lineTo(...tp(p));
  ctx.closePath();
  ctx.stroke();

  // start line
  if (track.startLine) {
    const sl = track.startLine;
    const [sx1, sy1] = tp([sl.x1, sl.y1]);
    const [sx2, sy2] = tp([sl.x2, sl.y2]);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(sx1, sy1);
    ctx.lineTo(sx2, sy2);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('START', (sx1 + sx2) / 2, (sy1 + sy2) / 2 - 8);
  }

  for (const [idx, sector] of (track.sectors || []).entries()) {
    const line = sector.checkLine;
    const [x1, y1] = tp([line.x1, line.y1]);
    const [x2, y2] = tp([line.x2, line.y2]);
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    ctx.fillStyle = sector.color || '#2ec4b6';
    ctx.beginPath();
    ctx.arc(mx, my, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#091014';
    ctx.font = 'bold 10px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`S${idx + 2}`, mx, my + 0.5);
  }
}
