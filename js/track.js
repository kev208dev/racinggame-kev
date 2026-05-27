let trackCache = null;
let cachedTrackId = null;

export function drawTrack(ctx, track, canvasW, canvasH) {
  // Use offscreen cache
  if (cachedTrackId !== track.id) {
    trackCache   = buildTrackCache(track, canvasW, canvasH);
    cachedTrackId = track.id;
  }
  ctx.drawImage(trackCache, 0, 0);
}

function buildTrackCache(track, w, h) {
  const oc  = document.createElement('canvas');
  oc.width  = w;
  oc.height = h;
  const c   = oc.getContext('2d');

  // background (grass)
  c.fillStyle = track.backgroundColor;
  c.fillRect(0, 0, w, h);

  // track surface (fill between outer and inner using evenodd)
  c.beginPath();
  c.moveTo(...track.outerBoundary[0]);
  for (const p of track.outerBoundary) c.lineTo(...p);
  c.closePath();
  c.moveTo(...track.innerBoundary[0]);
  for (const p of track.innerBoundary) c.lineTo(...p);
  c.closePath();
  c.fillStyle = track.trackColor;
  c.fill('evenodd');

  // kerbs — dashed white/red border on outer edge
  _drawKerb(c, track.outerBoundary, track.kerbColor, 6);
  _drawKerb(c, track.innerBoundary, track.kerbColor, 4);

  // start/finish line
  const sl = track.startLine;
  c.strokeStyle = '#fff';
  c.lineWidth   = 3;
  c.beginPath();
  c.moveTo(sl.x1, sl.y1);
  c.lineTo(sl.x2, sl.y2);
  c.stroke();

  // sector lines
  for (const s of track.sectors) {
    const sc = s.checkLine;
    c.strokeStyle = 'rgba(255,255,0,0.4)';
    c.lineWidth   = 2;
    c.setLineDash([6,4]);
    c.beginPath();
    c.moveTo(sc.x1, sc.y1);
    c.lineTo(sc.x2, sc.y2);
    c.stroke();
    c.setLineDash([]);
  }

  return oc;
}

function _drawKerb(c, poly, color, width) {
  c.strokeStyle = color;
  c.lineWidth   = width;
  c.beginPath();
  c.moveTo(...poly[0]);
  for (const p of poly) c.lineTo(...p);
  c.closePath();
  c.stroke();

  // white stripe alternating
  c.strokeStyle = 'rgba(255,255,255,0.5)';
  c.lineWidth   = width * 0.5;
  c.setLineDash([8, 8]);
  c.beginPath();
  c.moveTo(...poly[0]);
  for (const p of poly) c.lineTo(...p);
  c.closePath();
  c.stroke();
  c.setLineDash([]);
}

export function invalidateTrackCache() {
  trackCache   = null;
  cachedTrackId = null;
}
