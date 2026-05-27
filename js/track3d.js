import * as THREE from 'three';

export function getTrackGroup(track, scene) {
  const grp = _buildTrackGroup(track);
  scene.add(grp);
  return grp;
}

function _buildTrackGroup(track) {
  const grp = new THREE.Group();

  const groundGeo = new THREE.PlaneGeometry(15000, 15000);
  groundGeo.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(groundGeo, _makeGroundMaterial());
  ground.position.y = -0.35;
  ground.receiveShadow = true;
  ground.frustumCulled = false;
  grp.add(ground);

  _addTrackRibbon(grp, track);
  _addRoadMarkings(grp, track);
  _addKerbStripes(grp, track);
  _addWallRideBanks(grp, track);
  _addGuardrails(grp, track);

  const sl = track.startLine;
  const slCx = (sl.x1 + sl.x2) / 2;
  const slCy = (sl.y1 + sl.y2) / 2;
  const slHeight = _trackHeight(track, 0, slCx, slCy);
  _addFlatLine(grp, sl.x1, sl.y1, sl.x2, sl.y2, 0xffffff, 4.8, 0.24 + slHeight);

  _addStartGrid(grp, track.startPos, track);
  return grp;
}

function _addTrackRibbon(grp, track) {
  const cl = track.centerLine || [];
  const width = track.width || 100;
  if (cl.length < 3) return;

  const verts = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i < cl.length; i++) {
    const [x, y] = cl[i];
    const left = _offsetPoint(cl, i, width / 2, 1);
    const right = _offsetPoint(cl, i, width / 2, -1);
    const crown = 0.08 + Math.sin(i * 0.17) * 0.015 + _trackHeight(track, i, x, y);

    verts.push(left.x, crown, -left.y);
    verts.push(right.x, crown, -right.y);
    uvs.push(0, i / 18, 1, i / 18);
  }

  for (let i = 0; i < cl.length; i++) {
    const a = i * 2;
    const b = ((i + 1) % cl.length) * 2;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, _makeRoadMaterial());
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  grp.add(mesh);
}

function _makeRoadMaterial() {
  return new THREE.MeshLambertMaterial({
    color: 0x5f625c,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
}

function _makeGroundMaterial() {
  return new THREE.MeshLambertMaterial({ color: 0x293426 });
}

function _addRoadMarkings(grp, track) {
  const cl = track.centerLine || [];
  const stride = Math.max(2, _visualStride(cl, 180));
  for (let i = 0; i < cl.length; i += stride) {
    const [x1, y1] = cl[i];
    const [x2, y2] = cl[(i + stride) % cl.length];
    const { len } = _segBasis(x1, y1, x2, y2);
    if (len < 1) continue;
    if (_localTurnMax(cl, i, 3) > 0.035) continue;

    if (Math.floor(i / stride) % 3 === 0) {
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const h = _trackHeight(track, i, mx, my);
      _addCenteredDash(grp, x1, y1, x2, y2, 0xf0ece0, 2.0, 0.32 + h, 14);
    }
  }
}

function _addKerbStripes(grp, track) {
  const cl = track.centerLine || [];
  const half = (track.width || 100) / 2;
  const stride = 1;
  const matA = new THREE.MeshLambertMaterial({ color: 0xc91f1f });
  const matB = new THREE.MeshLambertMaterial({ color: 0xf3f3ee });

  for (let i = 0; i < cl.length; i += stride) {
    const [x1, y1] = cl[i];
    const [x2, y2] = cl[(i + stride) % cl.length];
    const { len, px, py, angle } = _segBasis(x1, y1, x2, y2);
    if (len < 1) continue;

    for (const side of [-1, 1]) {
      const off = half + 2.5;
      const cx = (x1 + x2) / 2 + side * px * off;
      const cy = (y1 + y2) / 2 + side * py * off;
      if (_localTurnMax(cl, i, 3) > 0.14) continue;
      if (!_offsetVisualIsClear(track, cx, cy, half - 8, i)) continue;

      const h = _trackHeight(track, i, cx, cy);
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(Math.min(len, 24), 0.18, 5),
        Math.floor(i / stride) % 2 === 0 ? matA : matB
      );
      mesh.position.set(cx, 0.18 + h, -cy);
      mesh.rotation.y = angle;
      grp.add(mesh);
    }
  }
}

function _addGuardrails(grp, track) {
  const cl = track.centerLine || [];
  const half = (track.width || 100) / 2;
  const wallMat = new THREE.MeshLambertMaterial({ color: 0xbec4c8, side: THREE.DoubleSide });
  const stripeMat = new THREE.MeshLambertMaterial({ color: 0xc91f1f, side: THREE.DoubleSide });
  const postMat = new THREE.MeshLambertMaterial({ color: 0x202225 });
  const off = half + 6;

  for (const side of [-1, 1]) {
    const rail = _offsetLine(cl, side, off);
    _addGuardrailStrip(grp, rail, wallMat, 0.7, 4.7, track);
    _addGuardrailStrip(grp, rail, stripeMat, 4.75, 5.35, track);
    _addGuardrailPosts(grp, rail, postMat, 10, track);
  }
}

function _addWallRideBanks(grp, track) {
  const cl = track.centerLine || [];
  const half = (track.width || 100) / 2;
  if (cl.length < 8) return;

  const mats = [
    _makeWallRideBankMaterial(0x22d3ee),
    _makeWallRideBankMaterial(0xfacc15),
  ];
  const stride = 2;

  for (let i = 0; i < cl.length; i += stride) {
    const turn = _localTurnMax(cl, i, 4);
    if (turn < 0.105) continue;

    const [x1, y1] = cl[i];
    const [x2, y2] = cl[(i + stride) % cl.length];
    const { len } = _segBasis(x1, y1, x2, y2);
    if (len < 8) continue;

    const outerSide = _curveOuterSide(cl, i, stride);
    if (!outerSide) continue;
    const mat = mats[Math.floor(i / stride) % mats.length];
    _addWallRideBankSegment(grp, cl, i, stride, outerSide, half, turn, mat, track);
  }
}

function _curveOuterSide(cl, i, stride) {
  const N = cl.length;
  const [px, py] = cl[(i - stride + N) % N];
  const [cx, cy] = cl[i];
  const [nx, ny] = cl[(i + stride) % N];
  const ax = cx - px, ay = cy - py;
  const bx = nx - cx, by = ny - cy;
  const cross = ax * by - ay * bx;
  if (cross > 0.0001) return -1;
  if (cross < -0.0001) return 1;
  return 0;
}

function _makeWallRideBankMaterial(color) {
  return new THREE.MeshLambertMaterial({
    color,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
}

function _addWallRideBankSegment(grp, cl, i, stride, side, half, turn, mat, track) {
  const i2 = (i + stride) % cl.length;
  const innerOff = half + 3.5;
  const outerOff = half + 13.0;
  const innerY = 0.32;
  const outerY = 2.05 + Math.min(0.95, turn * 1.6);
  const baseY = 0.08;

  const a1 = _offsetPoint(cl, i, innerOff, side);
  const a2 = _offsetPoint(cl, i2, innerOff, side);
  const b1 = _offsetPoint(cl, i, outerOff, side);
  const b2 = _offsetPoint(cl, i2, outerOff, side);
  const h1 = _trackHeight(track, i, a1.x, a1.y);
  const h2 = _trackHeight(track, i2, a2.x, a2.y);

  const v = (pt, h, ph) => [pt.x, h + ph, -pt.y];
  const verts = [
    ...v(a1, innerY, h1),
    ...v(a2, innerY, h2),
    ...v(b2, outerY, h2),
    ...v(b1, outerY, h1),
    ...v(a1, baseY, h1),
    ...v(a2, baseY, h2),
    ...v(b2, baseY, h2),
    ...v(b1, baseY, h1),
  ];
  const indices = [
    0, 1, 2, 0, 2, 3,
    3, 2, 6, 3, 6, 7,
    1, 0, 4, 1, 4, 5,
    0, 3, 7, 0, 7, 4,
    2, 1, 5, 2, 5, 6,
  ];

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const bank = new THREE.Mesh(geo, mat);
  bank.receiveShadow = true;
  bank.castShadow = true;
  bank.frustumCulled = false;
  grp.add(bank);
}

function _offsetLine(cl, side, off) {
  const pts = [];
  for (let i = 0; i < cl.length; i++) {
    const p = _offsetPoint(cl, i, off, side);
    pts.push({ x: p.x, y: p.y, i });
  }
  return pts;
}

function _offsetPoint(cl, i, off, side) {
  const N = cl.length;
  const [px, py] = cl[(i - 1 + N) % N];
  const [cx, cy] = cl[i];
  const [nx, ny] = cl[(i + 1) % N];

  const inDx = cx - px;
  const inDy = cy - py;
  const outDx = nx - cx;
  const outDy = ny - cy;
  const inLen = Math.hypot(inDx, inDy) || 1;
  const outLen = Math.hypot(outDx, outDy) || 1;
  const n1 = { x: inDy / inLen, y: -inDx / inLen };
  const n2 = { x: outDy / outLen, y: -outDx / outLen };
  let mx = n1.x + n2.x;
  let my = n1.y + n2.y;
  let ml = Math.hypot(mx, my);
  if (ml < 0.001) {
    mx = n2.x;
    my = n2.y;
    ml = 1;
  }
  mx /= ml;
  my /= ml;
  const denom = Math.max(0.62, Math.abs(mx * n2.x + my * n2.y));
  const scale = Math.min(off * 1.02, off / denom);
  return {
    x: cx + mx * scale * side,
    y: cy + my * scale * side,
  };
}

function _addGuardrailStrip(grp, pts, mat, y0, y1, track) {
  if (pts.length < 3) return;
  const verts = [];
  const indices = [];
  for (const p of pts) {
    const h = _trackHeight(track, p.i, p.x, p.y);
    verts.push(p.x, y0 + h, -p.y, p.x, y1 + h, -p.y);
  }
  for (let i = 0; i < pts.length; i++) {
    const a = i * 2;
    const b = ((i + 1) % pts.length) * 2;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  grp.add(mesh);
}

function _addGuardrailPosts(grp, pts, mat, stride, track) {
  for (let i = 0; i < pts.length; i += stride) {
    const p = pts[i];
    const n = pts[(i + 1) % pts.length];
    const angle = Math.atan2(n.y - p.y, n.x - p.x);
    const h = _trackHeight(track, p.i, p.x, p.y);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, 5.4, 1.6), mat);
    post.position.set(p.x, 2.7 + h, -p.y);
    post.rotation.y = angle;
    post.castShadow = true;
    post.receiveShadow = true;
    grp.add(post);
  }
}

function _addFlatLine(grp, x1, y1, x2, y2, color, thickness, yOff) {
  const { len, angle } = _segBasis(x1, y1, x2, y2);
  if (len < 0.5) return;
  const geo = new THREE.BoxGeometry(len, 0.08, thickness);
  const mat = new THREE.MeshBasicMaterial({ color, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set((x1 + x2) / 2, yOff, -(y1 + y2) / 2);
  mesh.rotation.y = angle;
  mesh.renderOrder = 3;
  grp.add(mesh);
}

function _addCenteredDash(grp, x1, y1, x2, y2, color, thickness, yOff, dashLength) {
  const { len, angle } = _segBasis(x1, y1, x2, y2);
  if (len < 0.5) return;
  const geo = new THREE.BoxGeometry(Math.min(dashLength, len * 0.6), 0.08, thickness);
  const mat = new THREE.MeshBasicMaterial({ color, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set((x1 + x2) / 2, yOff, -(y1 + y2) / 2);
  mesh.rotation.y = angle;
  mesh.renderOrder = 3;
  grp.add(mesh);
}

function _addStartGrid(grp, startPos, track) {
  const a = startPos.angle;
  const cosA = Math.cos(a), sinA = Math.sin(a);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false });
  for (let i = 0; i < 4; i++) {
    const offset = i * 24;
    const wx = startPos.x - cosA * offset;
    const wy = startPos.y - sinA * offset;
    const h = _trackHeight(track, 0, wx, wy);
    const geo = new THREE.BoxGeometry(14, 0.08, 6);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(wx, 0.36 + h, -wy);
    mesh.rotation.y = a;
    mesh.renderOrder = 4;
    grp.add(mesh);
  }
}

function _segBasis(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  return {
    len,
    px: dy / len,
    py: -dx / len,
    angle: Math.atan2(dy, dx),
  };
}

function _turnAmount(points, i) {
  const N = points.length;
  if (N < 4) return 0;
  const [px, py] = points[(i - 1 + N) % N];
  const [cx, cy] = points[i];
  const [nx, ny] = points[(i + 1) % N];
  const ax = cx - px;
  const ay = cy - py;
  const bx = nx - cx;
  const by = ny - cy;
  const al = Math.hypot(ax, ay) || 1;
  const bl = Math.hypot(bx, by) || 1;
  const dot = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (al * bl)));
  return Math.acos(dot);
}

function _localTurnMax(points, i, radius) {
  let maxTurn = 0;
  for (let off = -radius; off <= radius; off++) {
    maxTurn = Math.max(maxTurn, _turnAmount(points, (i + off + points.length) % points.length));
  }
  return maxTurn;
}

function _offsetVisualIsClear(track, x, y, minAllowedDist, ownIndex) {
  const cl = track.centerLine || [];
  if (cl.length < 3) return true;
  let nearest = Infinity;
  for (let i = 0; i < cl.length; i++) {
    const wrappedDist = Math.min(
      Math.abs(i - ownIndex),
      cl.length - Math.abs(i - ownIndex)
    );
    if (wrappedDist <= 4) continue;
    const [x1, y1] = cl[i];
    const [x2, y2] = cl[(i + 1) % cl.length];
    nearest = Math.min(nearest, _pointSegmentDistance(x, y, x1, y1, x2, y2));
    if (nearest < minAllowedDist) return false;
  }
  return true;
}

function _pointSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const x = x1 + dx * t;
  const y = y1 + dy * t;
  return Math.hypot(px - x, py - y);
}

function _visualStride(points, targetSegments) {
  return Math.max(1, Math.ceil((points?.length || 1) / targetSegments));
}

function _trackHeight(track, i, x, y) {
  const profile = track.roadProfile;
  if (!profile) return 0;
  const n = Math.max(1, track.centerLine?.length || 1);
  const p = i / n;
  if (profile.type === 'climb') {
    const climb = Math.sin(p * Math.PI) ** 1.25;
    const loopPulse = Math.sin(p * Math.PI * 4) * 0.12;
    return (profile.height || 28) * Math.max(0, climb + loopPulse);
  }
  if (profile.type === 'rumble') {
    const amp = profile.roughness || 1;
    return Math.sin(x * 0.018 + y * 0.011) * amp
      + Math.sin(x * 0.041 - y * 0.023) * amp * 0.55;
  }
  return 0;
}
