// ─────────────────────────────────────────────────────────────────────
//  Visual juice: tire smoke, skid marks, sparks, speed lines, screen
//  shake, FOV pump. All effects are cheap (small geometry pools, no
//  per-frame allocation).
// ─────────────────────────────────────────────────────────────────────

import * as THREE from 'three';

// ── tire smoke (3D billboards) ────────────────────────────────────────
export function createSmokePool(scene, count = 80) {
  const geo = new THREE.PlaneGeometry(8, 8);
  geo.rotateX(-Math.PI / 2);
  const smokeTex = _makeSmokeTexture();
  const mat = new THREE.MeshBasicMaterial({
    color: 0xeeeeee,
    map: smokeTex,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    alphaTest: 0.02,
  });
  const pool = [];
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(geo, mat.clone());
    m.visible = false;
    scene.add(m);
    pool.push({
      mesh: m,
      age:  0,
      life: 0,
      vx: 0, vy: 0, vz: 0,
      scale: 1,
    });
  }
  return pool;
}

function _makeSmokeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.42, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.76, 'rgba(255,255,255,0.14)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function spawnSmoke(pool, x, y, z, color = 0xeeeeee) {
  for (const p of pool) {
    if (p.life <= 0) {
      p.mesh.material.color.setHex(color);
      p.mesh.position.set(x, y, z);
      p.scale = 1.0;
      p.mesh.scale.set(p.scale, p.scale, p.scale);
      p.mesh.material.opacity = 0.55;
      p.mesh.visible = true;
      p.age = 0;
      p.life = 0.7 + Math.random() * 0.3;       // sec
      p.vx = (Math.random() - 0.5) * 6;
      p.vy = 4 + Math.random() * 4;
      p.vz = (Math.random() - 0.5) * 6;
      return;
    }
  }
}

export function updateSmoke(pool, dt) {
  for (const p of pool) {
    if (p.life <= 0) continue;
    p.age += dt;
    p.life -= dt;
    if (p.life <= 0) { p.mesh.visible = false; continue; }
    const t = p.age / (p.age + p.life);     // 0..1
    p.scale = 1.0 + t * 4.0;
    p.mesh.scale.set(p.scale, p.scale, p.scale);
    p.mesh.material.opacity = Math.max(0, 0.55 * (1 - t));
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.vy *= Math.pow(0.4, dt);
  }
}

// ── drift light trails (single buffered geometry that grows) ─────────
export function createSkidBuffer(scene, capSegments = 400) {
  const positions = new Float32Array(capSegments * 4 * 3);
  const colors = new Float32Array(capSegments * 4 * 3);
  const indices = new Uint16Array(capSegments * 6);
  for (let i = 0; i < capSegments; i++) {
    const v = i * 4;
    const n = i * 6;
    indices[n + 0] = v;
    indices[n + 1] = v + 1;
    indices[n + 2] = v + 2;
    indices[n + 3] = v + 2;
    indices[n + 4] = v + 1;
    indices[n + 5] = v + 3;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.setDrawRange(0, 0);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 20000);
  geo.boundingBox = new THREE.Box3(
    new THREE.Vector3(-20000, -20, -20000),
    new THREE.Vector3(20000, 20, 20000)
  );
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.96,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  scene.add(mesh);

  return {
    mesh,
    positions,
    colors,
    capSegments,
    segments: [],
    reset() {
      this.segments.length = 0;
      geo.setDrawRange(0, 0);
    },
    appendTrail(ax, az, bx, bz, headHalfWidth = 2.2, color = 0x6ee7ff) {
      this.segments.push({ ax, az, bx, bz, headHalfWidth, color });
      while (this.segments.length > this.capSegments) this.segments.shift();
      this._rebuild();
    },
    _rebuild() {
      const count = this.segments.length;
      if (!count) {
        geo.setDrawRange(0, 0);
        return;
      }
      for (let s = 0; s < count; s++) {
        const seg = this.segments[s];
        const dx = seg.bx - seg.ax;
        const dz = seg.bz - seg.az;
        const dl = Math.hypot(dx, dz) || 1;
        const nx = dz / dl;
        const nz = -dx / dl;
        const denom = Math.max(1, count - 1);
        const t0 = s / denom;
        const t1 = Math.min(1, (s + 1) / denom);
        const tailWidth = Math.max(0.14, seg.headHalfWidth * 0.055);
        const w0 = tailWidth + (seg.headHalfWidth - tailWidth) * Math.pow(t0, 9.5);
        const w1 = tailWidth + (seg.headHalfWidth - tailWidth) * Math.pow(t1, 9.5);
        const i = s * 12;
        const c = new THREE.Color(seg.color);
        const startGlow = 0.16 + 0.84 * Math.pow(t0, 3.2);
        const endGlow = 0.16 + 0.84 * Math.pow(t1, 3.2);

        positions[i+0] = seg.ax + nx * w0; positions[i+1] = 0.86; positions[i+2] = seg.az + nz * w0;
        positions[i+3] = seg.ax - nx * w0; positions[i+4] = 0.86; positions[i+5] = seg.az - nz * w0;
        positions[i+6] = seg.bx + nx * w1; positions[i+7] = 0.86; positions[i+8] = seg.bz + nz * w1;
        positions[i+9] = seg.bx - nx * w1; positions[i+10] = 0.86; positions[i+11] = seg.bz - nz * w1;

        colors[i+0] = c.r * startGlow; colors[i+1] = c.g * startGlow; colors[i+2] = c.b * startGlow;
        colors[i+3] = c.r * startGlow; colors[i+4] = c.g * startGlow; colors[i+5] = c.b * startGlow;
        colors[i+6] = c.r * endGlow; colors[i+7] = c.g * endGlow; colors[i+8] = c.b * endGlow;
        colors[i+9] = c.r * endGlow; colors[i+10] = c.g * endGlow; colors[i+11] = c.b * endGlow;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      geo.setDrawRange(0, count * 6);
    },
    appendQuad(ax, az, bx, bz, halfWidth = 1.4, color = 0x6ee7ff) {
      this.appendTrail(ax, az, bx, bz, halfWidth, color);
    },
  };
}

// ── sparks (small short-lived emissive boxes) ────────────────────────
export function createSparkPool(scene, count = 40) {
  const geo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffaa22 });
  const pool = [];
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(geo, mat.clone());
    m.visible = false;
    scene.add(m);
    pool.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0 });
  }
  return pool;
}

export function spawnSparks(pool, x, y, z, count = 14) {
  let emitted = 0;
  for (const p of pool) {
    if (emitted >= count) break;
    if (p.life > 0) continue;
    p.mesh.position.set(x, y, z);
    p.mesh.visible = true;
    p.mesh.material.color.setHSL(
      0.10 + Math.random() * 0.05, 1.0, 0.55 + Math.random() * 0.2
    );
    p.life = 0.30 + Math.random() * 0.25;
    const sp = 30 + Math.random() * 60;
    const a  = Math.random() * Math.PI * 2;
    p.vx = Math.cos(a) * sp;
    p.vz = Math.sin(a) * sp;
    p.vy = 25 + Math.random() * 25;
    emitted++;
  }
}

export function updateSparks(pool, dt) {
  for (const p of pool) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.mesh.visible = false; continue; }
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.vy -= 200 * dt;             // gravity
    const s = Math.max(0.2, p.life * 2);
    p.mesh.scale.set(s, s, s);
  }
}

// ── screen shake (camera offset) ─────────────────────────────────────
export function makeShake() {
  return { amount: 0, decay: 6.0 };
}
export function triggerShake(state, amount) {
  state.amount = Math.max(state.amount, amount);
}
export function tickShake(state, dt) {
  state.amount *= Math.exp(-state.decay * dt);
  if (state.amount < 0.05) { state.amount = 0; return { x: 0, y: 0 }; }
  return {
    x: (Math.random() - 0.5) * state.amount * 2,
    y: (Math.random() - 0.5) * state.amount * 2,
  };
}

// ── speed lines (Canvas-2D overlay, drawn on the HUD canvas) ─────────
export function makeSpeedLines(count = 60) {
  const arr = new Array(count);
  for (let i = 0; i < count; i++) {
    arr[i] = { x: 0, y: 0, vx: 0, vy: 0, len: 0, alpha: 0, life: 0 };
  }
  return arr;
}

export function drawSpeedLines(ctx, lines, kmh, w, h, dt, cameraMode = 'chase') {
  if (cameraMode === 'high') {
    for (const p of lines) p.life = 0;
    return;
  }
  // Activate earlier so the player feels speed sooner.
  if (kmh < 45) {
    for (const p of lines) p.life = 0;
    return;
  }
  const intensity = Math.min(1, (kmh - 45) / 190);
  const cx = w * 0.5, cy = h * 0.62;
  const speedScale = 1500 + intensity * 3200;
  const spawnRate  = 110 + intensity * 260;

  // Spawn fresh particles
  let toSpawn = spawnRate * dt;
  for (const p of lines) {
    if (p.life > 0) continue;
    if (toSpawn <= 0) break;
    const a   = Math.random() * Math.PI * 2;
    const r0  = 60 + Math.random() * 220;
    p.x = cx + Math.cos(a) * r0;
    p.y = cy + Math.sin(a) * r0;
    p.vx = Math.cos(a) * speedScale;
    p.vy = Math.sin(a) * speedScale;
    p.len = 32 + Math.random() * 50;
    p.alpha = 0.16 + Math.random() * 0.24;
    p.life  = 0.34;
    toSpawn -= 1;
  }

  // Update + draw
  ctx.save();
  ctx.lineCap = 'round';
  for (const p of lines) {
    if (p.life <= 0) continue;
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.x < -100 || p.x > w + 100 || p.y < -100 || p.y > h + 100) {
      p.life = 0; continue;
    }
    const dx = p.vx, dy = p.vy;
    const dl = Math.hypot(dx, dy) || 1;
    const tx = -dx / dl * p.len;
    const ty = -dy / dl * p.len;
    ctx.strokeStyle = `rgba(190,220,255,${p.alpha * intensity})`;
    ctx.lineWidth = 1.0 + intensity * 1.2;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + tx, p.y + ty);
    ctx.stroke();
  }
  ctx.restore();
}

// ── FOV pump (camera lerps from base FOV up to base+boost) ───────────
export function updateFovPump(camera, kmh, maxKmh, boostActive, dt) {
  const baseFov  = 66;
  const speedFovBoost = 38;
  const boostFov = 102;
  const t = Math.min(1, kmh / maxKmh);
  // Quadratic so the pump kicks in harder at high speed.
  let target = baseFov + (t * t) * speedFovBoost;
  if (boostActive) target = Math.max(target, boostFov);
  const k = 1 - Math.exp(-5.4 * dt);
  camera.fov += (target - camera.fov) * k;
  camera.updateProjectionMatrix();
}
