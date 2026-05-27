// Background scenery — only BoxGeometry / CylinderGeometry, no asset loads.
// Placed close to the track edge for stronger speed sensation.

import * as THREE from 'three';
import { pointInPolygon } from '../utils/math.js';

// ── tree (cone leaf + cylinder trunk) ────────────────────────────────
function makeTree(scale = 1) {
  const g = new THREE.Group();
  const trunkH = 6 * scale;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7 * scale, 1.0 * scale, trunkH, 6),
    new THREE.MeshLambertMaterial({ color: 0x5a3a20 })
  );
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  g.add(trunk);
  const leafColor = [0x2a6b2a, 0x366f2c, 0x3d7a30, 0x2f5c25][Math.floor(Math.random()*4)];
  const leaf = new THREE.Mesh(
    new THREE.ConeGeometry(4 * scale, 12 * scale, 6),
    new THREE.MeshLambertMaterial({ color: leafColor })
  );
  leaf.position.y = trunkH + 5 * scale;
  leaf.castShadow = true;
  g.add(leaf);
  return g;
}

// ── grandstand (3 stepped boxes) ─────────────────────────────────────
function makeGrandstand() {
  const g = new THREE.Group();
  const matFrame = new THREE.MeshLambertMaterial({ color: 0xbec5c9 });
  const matSeats = new THREE.MeshLambertMaterial({ color: 0x656b72 });
  const matRoof  = new THREE.MeshLambertMaterial({ color: 0xd8d6c6 });
  const crowdMats = [
    new THREE.MeshBasicMaterial({ color: 0xe54b4b }),
    new THREE.MeshBasicMaterial({ color: 0xf2f2f2 }),
    new THREE.MeshBasicMaterial({ color: 0x3e8cff }),
    new THREE.MeshBasicMaterial({ color: 0xffd34d }),
    new THREE.MeshBasicMaterial({ color: 0x202226 }),
  ];
  for (let i = 0; i < 7; i++) {
    const w = 210, h = 5 + i * 3.2, d = 9;
    const step = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), matSeats);
    step.position.set(0, h / 2, -i * d);
    step.castShadow = true;
    step.receiveShadow = true;
    g.add(step);
    for (let j = -48; j <= 48; j += 7) {
      if (Math.random() < 0.18) continue;
      const p = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.8, 1.8), crowdMats[Math.floor(Math.random() * crowdMats.length)]);
      p.position.set(j * 2.0, h + 1.2, -i * d - 2.0);
      g.add(p);
    }
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(232, 2.6, 76), matRoof);
  roof.position.set(0, 44, -29);
  roof.rotation.x = -0.12;
  g.add(roof);
  for (let x = -96; x <= 96; x += 24) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(1.4, 44, 1.4), matFrame);
    post.position.set(x, 22, -7);
    g.add(post);
  }
  return g;
}

function makeCatchFence(length = 76) {
  const g = new THREE.Group();
  const postMat = new THREE.MeshLambertMaterial({ color: 0xb8c0c6 });
  const wireMat = new THREE.MeshBasicMaterial({ color: 0xdfe5e8, transparent: true, opacity: 0.45 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(length, 3.4, 0.9), new THREE.MeshLambertMaterial({ color: 0x9fa5a9 }));
  base.position.y = 1.7;
  g.add(base);
  for (let x = -length / 2; x <= length / 2; x += 6) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.55, 18, 0.55), postMat);
    post.position.set(x, 10, 0);
    g.add(post);
  }
  for (let y = 5; y <= 19; y += 2) {
    const wire = new THREE.Mesh(new THREE.BoxGeometry(length, 0.16, 0.22), wireMat);
    wire.position.y = y;
    g.add(wire);
  }
  return g;
}

function makeSponsorBridge(span = 150, labelColor = 0xffd500) {
  const g = new THREE.Group();
  const yellow = new THREE.MeshLambertMaterial({ color: labelColor });
  const black = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const pylonMat = new THREE.MeshLambertMaterial({ color: 0xb7bdc2 });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(span, 14, 9), yellow);
  beam.position.y = 42;
  beam.castShadow = true;
  g.add(beam);
  for (const x of [-span / 2 + 8, span / 2 - 8]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(5, 42, 5), pylonMat);
    post.position.set(x, 21, 0);
    g.add(post);
  }
  for (const x of [-44, 0, 44]) {
    const mark = new THREE.Mesh(new THREE.BoxGeometry(24, 6, 9.3), black);
    mark.position.set(x, 44, 0);
    g.add(mark);
  }
  return g;
}

function makeCrowdWall(length = 180) {
  const g = new THREE.Group();
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x3f464b });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0xd8d6c6 });
  const crowdMats = [
    new THREE.MeshBasicMaterial({ color: 0xe54b4b }),
    new THREE.MeshBasicMaterial({ color: 0xf2f2f2 }),
    new THREE.MeshBasicMaterial({ color: 0x3e8cff }),
    new THREE.MeshBasicMaterial({ color: 0xffd34d }),
    new THREE.MeshBasicMaterial({ color: 0x202226 }),
  ];
  const wall = new THREE.Mesh(new THREE.BoxGeometry(length, 42, 10), wallMat);
  wall.position.y = 21;
  wall.castShadow = true;
  wall.receiveShadow = true;
  g.add(wall);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(length + 16, 2.4, 26), roofMat);
  roof.position.set(0, 48, -5);
  roof.rotation.x = -0.08;
  g.add(roof);
  for (let row = 0; row < 3; row++) {
    for (let x = -length / 2 + 8; x < length / 2 - 8; x += 16) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2.6, 1.8), crowdMats[(row + Math.floor((x + length / 2) / 8)) % crowdMats.length]);
      p.position.set(x, 31 + row * 3.6, -5.8);
      g.add(p);
    }
  }
  return g;
}

function makePitWall(length = 150) {
  const g = new THREE.Group();
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(length, 4.5, 1.4),
    new THREE.MeshLambertMaterial({ color: 0xd9d9d6 })
  );
  wall.position.y = 2.25;
  wall.receiveShadow = true;
  g.add(wall);
  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(length, 0.7, 1.8),
    new THREE.MeshLambertMaterial({ color: 0x20252a })
  );
  rail.position.y = 5.0;
  g.add(rail);
  return g;
}

function makeCityBlock(seed = 0) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x65707a });
  const glass = new THREE.MeshLambertMaterial({ color: 0x98b5c8, transparent: true, opacity: 0.72 });
  for (let i = 0; i < 5; i++) {
    const h = 40 + ((seed + i * 17) % 50);
    const b = new THREE.Mesh(new THREE.BoxGeometry(24, h, 22), i % 2 ? mat : glass);
    b.position.set((i - 2) * 28, h / 2, (i % 2) * 18);
    b.castShadow = true;
    g.add(b);
  }
  return g;
}

// ── billboard (vertical signboard on a post) ─────────────────────────
function makeBillboard() {
  const g = new THREE.Group();
  const palette = [0xff5a2a, 0x2a90ff, 0xffce2a, 0x37c777, 0xe540a0, 0x9066ff];
  const c = palette[Math.floor(Math.random() * palette.length)];
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.1, 22, 8),
    new THREE.MeshLambertMaterial({ color: 0x444444 })
  );
  post.position.y = 11;
  g.add(post);
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(48, 16, 1.0),
    new THREE.MeshLambertMaterial({ color: c })
  );
  board.position.y = 23;
  board.castShadow = true;
  g.add(board);
  return g;
}

// ── pit garages (line of long boxes) ─────────────────────────────────
function makePitGarages() {
  const g = new THREE.Group();
  const matFrame = new THREE.MeshLambertMaterial({ color: 0xdadcdf });
  const matRoof  = new THREE.MeshLambertMaterial({ color: 0x88c0ff });
  for (let i = 0; i < 6; i++) {
    const u = new THREE.Mesh(new THREE.BoxGeometry(36, 11, 18), matFrame);
    u.position.set(i * 38, 5.5, 0);
    u.castShadow = true;
    u.receiveShadow = true;
    g.add(u);
    const r = new THREE.Mesh(new THREE.BoxGeometry(36, 1, 20), matRoof);
    r.position.set(i * 38, 11.5, 0);
    g.add(r);
  }
  return g;
}

// ── distant mountain (low-poly cone with snow cap) ───────────────────
function makeMountain(h, baseR) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(
    new THREE.ConeGeometry(baseR, h, 6),
    new THREE.MeshLambertMaterial({ color: 0x435562 })
  );
  m.position.y = h / 2;
  g.add(m);
  const snow = new THREE.Mesh(
    new THREE.ConeGeometry(baseR * 0.4, h * 0.35, 6),
    new THREE.MeshLambertMaterial({ color: 0xeeeeee })
  );
  snow.position.y = h * 0.55;
  g.add(snow);
  return g;
}

// ── flag pole ────────────────────────────────────────────────────────
function makeFlagPole() {
  const g = new THREE.Group();
  const colors = [0xff3c3c, 0x3cff64, 0x3c8eff, 0xffd23c, 0xe040ff];
  const flagCol = colors[Math.floor(Math.random()*colors.length)];
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 14, 6),
    new THREE.MeshLambertMaterial({ color: 0xeeeeee })
  );
  pole.position.y = 7;
  g.add(pole);
  const flag = new THREE.Mesh(
    new THREE.BoxGeometry(7, 4, 0.2),
    new THREE.MeshLambertMaterial({ color: flagCol })
  );
  flag.position.set(3.5, 12, 0);
  flag.name = 'flag';
  g.add(flag);
  return g;
}

// ── tire stack ───────────────────────────────────────────────────────
function makeTireStack() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  for (let i = 0; i < 5; i++) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 1.2, 12), mat);
    t.position.y = 0.6 + i * 1.3;
    g.add(t);
  }
  return g;
}

// ── marshal post (small wooden box) ──────────────────────────────────
function makeMarshalPost() {
  const g = new THREE.Group();
  const mat  = new THREE.MeshLambertMaterial({ color: 0xd4b06a });
  const matR = new THREE.MeshLambertMaterial({ color: 0xcc1818 });
  const box  = new THREE.Mesh(new THREE.BoxGeometry(4, 6, 4), mat);
  box.position.y = 3;
  box.castShadow = true;
  g.add(box);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(5, 0.6, 5), matR);
  roof.position.y = 6.5;
  g.add(roof);
  return g;
}

// ── scatter rules ────────────────────────────────────────────────────
export function scatterProps(scene, track) {
  const propsGroup = new THREE.Group();
  scene.add(propsGroup);

  // ── distant mountain ring ──
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.21;
    const r = 6500;
    const mh = 600 + Math.random() * 300;
    const mr = 600 + Math.random() * 200;
    const m  = makeMountain(mh, mr);
    m.position.set(Math.cos(a) * r, 0, -Math.sin(a) * r);
    propsGroup.add(m);
  }

  const cl = track.centerLine;
  const trackW = track.width || 100;
  if (!cl || cl.length === 0) return propsGroup;

  const isOnTrack = (x, y) =>
    pointInPolygon(x, y, track.outerBoundary) && !pointInPolygon(x, y, track.innerBoundary);

  const footprintHitsTrack = (x, y, radius = 24) => {
    if (isOnTrack(x, y)) return true;
    const samples = Math.max(8, Math.ceil(radius / 18));
    for (let i = 0; i < samples; i++) {
      const a = (i / samples) * Math.PI * 2;
      if (isOnTrack(x + Math.cos(a) * radius, y + Math.sin(a) * radius)) return true;
      if (isOnTrack(x + Math.cos(a) * radius * 0.55, y + Math.sin(a) * radius * 0.55)) return true;
    }
    return false;
  };

  const placeTrackside = (obj, x, y, rot = 0, clearance = 24) => {
    if (footprintHitsTrack(x, y, clearance)) return false;
    obj.position.set(x, 0, -y);
    obj.rotation.y = rot;
    propsGroup.add(obj);
    return true;
  };

  // ── dense F1-style corridor: tall fencing, boards and grandstands on both sides ──
  const propStride = Math.max(2, Math.ceil(cl.length / 120));
  for (let i = 0; i < cl.length; i += propStride) {
    const visualIndex = Math.floor(i / propStride);
    const [cx, cy] = cl[i];
    const [nx, ny] = cl[(i + propStride) % cl.length];
    const tx = nx - cx, ty = ny - cy;
    const tl = Math.hypot(tx, ty) || 1;
    const px =  ty / tl;            // outward perpendicular
    const py = -tx / tl;
    const segRot = Math.atan2(ty, tx);
    if (visualIndex % 4 === 0) {
      for (const side of [-1, 1]) {
        const off = trackW / 2 + 44;
        const sx = cx + side * px * off;
        const sy = cy + side * py * off;
        placeTrackside(makeCatchFence(82), sx, sy, segRot, 48);
      }
    }
    if (visualIndex % 10 === 0) {
      for (const side of [-1, 1]) {
        const off = trackW / 2 + 124;
        const sx = cx + side * px * off;
        const sy = cy + side * py * off;
        placeTrackside(makeBillboard(), sx, sy, segRot + (side > 0 ? Math.PI / 2 : -Math.PI / 2), 36);
      }
    }
    if (visualIndex % 18 === 0) {
      for (const side of [-1, 1]) {
        const off = trackW / 2 + 205;
        const sx = cx + side * px * off;
        const sy = cy + side * py * off;
        placeTrackside(makeCrowdWall(190), sx, sy, segRot + (side > 0 ? Math.PI : 0), 92);
      }
    }
    if (visualIndex % 38 === 0) {
      const side = visualIndex % 40 === 0 ? 1 : -1;
      const off = trackW / 2 + 315;
      const sx = cx + side * px * off;
      const sy = cy + side * py * off;
      const gs = makeGrandstand();
      gs.scale.setScalar(1.15);
      placeTrackside(gs, sx, sy, segRot + (side > 0 ? Math.PI : 0), 118);
    }
    // Trees set farther back so the scene no longer reads as pure grassland.
    if (visualIndex % 15 === 0 && Math.random() < 0.35) {
      const off = trackW / 2 + 170 + Math.random() * 90;
      const sx = cx + px * off;
      const sy = cy + py * off;
      placeTrackside(makeTree(0.9 + Math.random() * 0.8), sx, sy, Math.random() * Math.PI * 2);
    }
    if (visualIndex % 24 === 0 && Math.random() < 0.25) {
      const off = trackW / 2 + 190 + Math.random() * 90;
      const sx = cx - px * off;
      const sy = cy - py * off;
      placeTrackside(makeTree(0.9 + Math.random() * 0.8), sx, sy, Math.random() * Math.PI * 2);
    }
  }

  // ── tire stacks outside the barrier only, never on the racing surface ──
  for (let i = 0; i < cl.length; i += propStride * 16) {
    const [cx, cy] = cl[i];
    const [nx, ny] = cl[(i + propStride) % cl.length];
    const tx = nx - cx, ty = ny - cy;
    const tl = Math.hypot(tx, ty) || 1;
    const px =  ty / tl, py = -tx / tl;
    if (Math.random() > 0.55) continue;
    const off = trackW / 2 + 72;
    const side = Math.random() < 0.5 ? -1 : 1;
    const sx = cx + side * px * off;
    const sy = cy + side * py * off;
    placeTrackside(makeTireStack(), sx, sy, Math.atan2(ty, tx), 20);
  }

  // ── grandstands ONLY clustered around start/finish ──
  if (track.startPos) {
    const sp = track.startPos;
    const sa = sp.angle;
    const fwdX = Math.cos(sa), fwdY = Math.sin(sa);
    const perpX = -Math.sin(sa), perpY = Math.cos(sa);
    // Bigger main grandstand blocks around start/finish.
    for (const side of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const longOff = (k - 1.5) * 185;
        const sideOff = side * (trackW / 2 + 285);
        const wx = sp.x + fwdX * longOff + perpX * sideOff;
        const wy = sp.y + fwdY * longOff + perpY * sideOff;
        const gs = makeGrandstand();
        gs.scale.setScalar(1.28);
        placeTrackside(gs, wx, wy, sa + (side > 0 ? Math.PI : 0), 112);
      }
    }
    // Pit garages on the inner side of start
    const pits = makePitGarages();
    const pitsX = sp.x - fwdX * 100 + perpX * (trackW / 2 + 285) * -1;
    const pitsY = sp.y - fwdY * 100 + perpY * (trackW / 2 + 285) * -1;
    placeTrackside(pits, pitsX, pitsY, sa, 150);

    const pitWall = makePitWall(190);
    const pitWallX = sp.x + fwdX * 12 + perpX * (trackW / 2 + 88) * -1;
    const pitWallY = sp.y + fwdY * 12 + perpY * (trackW / 2 + 88) * -1;
    placeTrackside(pitWall, pitWallX, pitWallY, sa, 96);

    // Flag poles flanking the start line
    for (const side of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const lo = (k - 1.5) * 60;
        const so = side * (trackW / 2 + 108);
        const wx = sp.x + fwdX * lo + perpX * so;
        const wy = sp.y + fwdY * lo + perpY * so;
        placeTrackside(makeFlagPole(), wx, wy, sa + (side > 0 ? Math.PI : 0), 16);
      }
    }
  }

  // ── distant city/paddock skyline like modern street and grand prix venues ──
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.4;
    const r = 4300 + (i % 3) * 330;
    const block = makeCityBlock(i * 23);
    block.position.set(Math.cos(a) * r, 0, -Math.sin(a) * r);
    block.rotation.y = -a + Math.PI / 2;
    propsGroup.add(block);
  }

  // ── marshal posts every ~30 centerline points, on the outer side ──
  for (let i = 8; i < cl.length; i += propStride * 30) {
    const [cx, cy] = cl[i];
    const [nx, ny] = cl[(i + propStride) % cl.length];
    const tx = nx - cx, ty = ny - cy;
    const tl = Math.hypot(tx, ty) || 1;
    const px =  ty / tl, py = -tx / tl;
    const off = trackW / 2 + 118;
    const sx = cx + px * off, sy = cy + py * off;
    placeTrackside(makeMarshalPost(), sx, sy, Math.atan2(ty, tx), 18);
  }

  return propsGroup;
}

// gentle flag flutter
export function updateScenery(propsGroup, time) {
  if (!propsGroup) return;
  propsGroup.traverse(c => {
    if (c.name === 'flag') {
      c.rotation.y = Math.sin(time * 0.004 + c.position.x * 0.01) * 0.35;
    }
  });
}
