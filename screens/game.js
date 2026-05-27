import * as THREE from 'three';
import { createCar, createCar3D, updateCar3D } from '../js/car.js';
import { updatePhysics, KMH_PER_UNIT, TOP_SPEED_MULT }  from '../js/physics.js';
import { getTrackGroup }  from '../js/track3d.js';
import { drawHUD }        from '../js/hud.js';
import { createTiming, startTiming, updateTiming } from '../js/timing.js';
import { getInput }       from '../utils/input.js';
import { startEngine, stopEngine, updateEngineSound, resumeContext, playLapDing, playWallThud } from '../js/audio.js';
import { formatTime } from '../utils/math.js';
import { saveBestLap, addLapHistory, getBestSectors, saveBestSectors, getBestGhost, saveBestGhost } from '../utils/storage.js';
import {
  createSmokePool, spawnSmoke, updateSmoke,
  createSkidBuffer,
  createSparkPool, spawnSparks, updateSparks,
  makeShake, triggerShake, tickShake,
  makeSpeedLines, drawSpeedLines,
  updateFovPump,
} from '../js/effects.js';
import { scatterProps, updateScenery } from '../js/scenery.js';
import { awardMissions, recordTrackPlay } from '../utils/profile.js';
import { CAR_DATA } from '../data/cars.js';

// ── Three.js renderer (persists across retries) ──────────────
let renderer = null;

// ── per-session state ────────────────────────────────────────
let scene     = null;
let camera3d  = null;
let car       = null;
let carMesh   = null;
let ghostMesh = null;
let track     = null;
let carData   = null;
let timing    = null;
let onResults = null;
let onMenu    = null;
let running   = false;
let hudCanvas = null;
let hudCtx    = null;
let cameraMode = 'chase'; // 'chase' | 'hood' | 'high'
const CAMERA_MODES = ['chase', 'hood', 'high'];

// fx
let smokePool = null;
let skidBuf   = null;
let sparkPool = null;
let shake     = null;
let speedLines = null;
let propsGroup = null;
let lastWallHitId = 0;

// lap-complete banner state
let lapBannerTimer = 0;
let lapBannerText  = '';
let lapBannerSub   = '';
let lapBannerNew   = false;
let pendingResults = null;
let startCountdown = 0;
let startReadyAt = 0;
let raceReleased = false;
let lapPath = [];
let bestGhost = null;
let resultsTimeout = null;
let raceOptions = {};
let lapStats = null;

// fixed-step physics
const FIXED_DT  = 1 / 60;
let accumulator = 0;

// camera state (lerped)
const _camPos    = new THREE.Vector3();
const _camLook   = new THREE.Vector3();
let   _camAngle  = 0;     // smoothed heading (rad)

// ── public API ───────────────────────────────────────────────
export function initGame(cd, tr, resultsCb, menuCb, options = {}) {
  carData     = cd;
  track       = tr;
  raceOptions = options || {};
  onResults   = resultsCb;
  onMenu      = menuCb;
  running     = true;
  accumulator = 0;
  cameraMode  = 'chase';
  lastWallHitId = 0;
  startCountdown = 3.2;
  startReadyAt = performance.now() + 3200;
  raceReleased = false;
  lapPath = [];
  bestGhost = raceOptions.ghostEnabled ? getBestGhost(tr.id) : null;
  lapStats = _makeLapStats();
  try {
    recordTrackPlay(tr.id);
  } catch (error) {
    console.warn('Track play progress failed:', error);
  }
  if (resultsTimeout) {
    clearTimeout(resultsTimeout);
    resultsTimeout = null;
  }

  // ── HUD canvas ──
  hudCanvas = document.getElementById('hud-canvas');
  hudCtx    = hudCanvas ? hudCanvas.getContext('2d') : null;
  if (hudCanvas) hudCanvas.style.display = 'block';

  // ── renderer ──
  const threeCanvas = document.getElementById('three-canvas');
  if (threeCanvas) threeCanvas.style.display = 'block';

  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ canvas: threeCanvas, antialias: false, powerPreference: 'high-performance' });
    renderer.shadowMap.enabled = false;
    renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
  }
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));

  // ── scene ──
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog        = new THREE.Fog(0x87ceeb, 9000, 22000);

  // ── camera ──
  camera3d = new THREE.PerspectiveCamera(
    64, window.innerWidth / window.innerHeight, 1, 26000
  );
  const sa = tr.startPos.angle;
  _camPos.set(
    tr.startPos.x - Math.cos(sa) * 78,
    36,
    -(tr.startPos.y - Math.sin(sa) * 78)
  );
  _camLook.set(
    tr.startPos.x + Math.cos(sa) * 45,
    12,
    -(tr.startPos.y + Math.sin(sa) * 45)
  );
  _camAngle = sa;
  camera3d.position.copy(_camPos);
  camera3d.lookAt(_camLook);

  // ── lights ──
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const sun = new THREE.DirectionalLight(0xfff5dc, 1.1);
  sun.position.set(400, 700, -300);
  sun.castShadow = false;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near   = 10;
  sun.shadow.camera.far    = 1500;
  sun.shadow.camera.left   = -400;
  sun.shadow.camera.right  =  400;
  sun.shadow.camera.top    =  400;
  sun.shadow.camera.bottom = -400;
  scene.add(sun);
  scene.add(sun.target);
  scene.sunLight = sun;

  const fill = new THREE.DirectionalLight(0xadd8e6, 0.35);
  fill.position.set(-200, 200, 300);
  scene.add(fill);

  // ── track ──
  getTrackGroup(track, scene);

  // ── scenery (mountains, trees, billboards, pit garages, etc) ──
  propsGroup = scatterProps(scene, track);

  // ── car ──
  car     = createCar(cd, tr.startPos);
  carMesh = createCar3D(cd);
  scene.add(carMesh);
  updateCar3D(carMesh, car, { brake: 0 });
  ghostMesh = _createGhostMesh(bestGhost);

  // ── effects ──
  smokePool  = createSmokePool(scene, 48);
  skidBuf    = createSkidBuffer(scene, 360);
  sparkPool  = createSparkPool(scene, 28);
  shake      = makeShake();
  speedLines = makeSpeedLines(36);

  // ── timing ──
  timing = createTiming(getBestSectors(track.id));

  window.addEventListener('resize', _onResize);

  const hint = document.getElementById('controls-hint');
  if (hint) {
    hint.style.display    = 'flex';
    hint.style.opacity    = '1';
    hint.style.animation  = 'none';
    void hint.offsetHeight;
    hint.style.animation       = 'fadeout 4s forwards';
    hint.style.animationDelay  = '5s';
  }

  startEngine();
}

export function stopGame() {
  running = false;
  if (resultsTimeout) {
    clearTimeout(resultsTimeout);
    resultsTimeout = null;
  }
  stopEngine();
  window.removeEventListener('resize', _onResize);

  const tc = document.getElementById('three-canvas');
  if (tc) tc.style.display = 'none';
  const hc = document.getElementById('hud-canvas');
  if (hc) { hc.style.display = 'none'; if (hudCtx) hudCtx.clearRect(0, 0, hc.width, hc.height); }
  const hint = document.getElementById('controls-hint');
  if (hint) hint.style.display = 'none';
}

export function updateGame(dt, now) {
  if (!running || !car) return;

  const input = getInput();
  resumeContext();

  if (input.cameraToggle) {
    cameraMode = CAMERA_MODES[(CAMERA_MODES.indexOf(cameraMode) + 1) % CAMERA_MODES.length];
  }
  if (input.reset && raceReleased) _resetCar();
  if (input.escape) { stopGame(); if (onMenu) onMenu(); return; }

  startCountdown = Math.max(0, (startReadyAt - now) / 1000);
  const wasReleased = raceReleased;
  raceReleased = startCountdown <= 0;
  if (!wasReleased && raceReleased && timing && !timing.started) {
    startTiming(timing, now);
    lapStats = _makeLapStats();
  }
  const driveInput = raceReleased ? input : {
    ...input,
    throttle: 0, brake: 0, steer: 0, handbrake: false,
    boost: false, boostJust: false, gearUp: false, gearDown: false,
  };

  // ── fixed-step physics ──
  accumulator += dt;
  let steps = 0;
  while (accumulator >= FIXED_DT && steps < 5) {
    updatePhysics(car, driveInput, FIXED_DT, track);
    if (raceReleased && lapStats) {
      if (driveInput.throttle > 0) lapStats.throttleUsed = true;
      lapStats.maxSpeed = Math.max(lapStats.maxSpeed, car.speed * KMH_PER_UNIT);
      lapStats.offTrack = lapStats.offTrack || !!car.offTrack;
    }
    accumulator -= FIXED_DT;
    steps++;
  }
  if (steps >= 5) accumulator = 0;

  // ── audio ──
  updateEngineSound(car.rpm, car.maxRpm);

  // ── timing ──
  const event = updateTiming(timing, car, track, now);
  if (timing.started && raceReleased) _sampleLapPath(now);
  if (event?.type === 'lapComplete') {
    const isNew = !!event.isNew;
    const completedPath = lapPath.slice(0, 900);
    _saveLapCompletion(event, isNew, completedPath);
    lapPath = [];
    // Show in-game banner first; results screen follows after a beat.
    lapBannerText  = formatTime(event.lapMs);
    lapBannerSub   = isNew ? '🏆 NEW BEST LAP' : 'LAP COMPLETE';
    lapBannerNew   = isNew;
    lapBannerTimer = 2.4;
    pendingResults = { ...event };
    _awardCompletionRewards(event, _completionContext());
    _scheduleResults({ ...event });
    playLapDing(isNew);
  }
  if (lapBannerTimer > 0) {
    lapBannerTimer -= dt;
    if (lapBannerTimer <= 0 && pendingResults) {
      const ev = pendingResults;
      pendingResults = null;
      _showResults(ev);
      return;
    }
  }

  // ── effects: drift smoke + skid marks ──
  _emitDriftFx(dt, driveInput);

  // ── effects: wall hit sparks + screen shake + thud ──
  if (car.lastWallHit && car.lastWallHit.time !== lastWallHitId) {
    lastWallHitId = car.lastWallHit.time;
    const w = car.lastWallHit;
    if (car.speed > 60) {
      spawnSparks(sparkPool, w.x, 5, -w.y, 12);
      playWallThud(Math.min(2, car.speed / 120));
    }
    if (car.speed > 160) {
      triggerShake(shake, Math.min(12, car.speed * 0.04));
    }
  }
  updateSmoke(smokePool, dt);
  updateSparks(sparkPool, dt);

  // ── 3D update ──
  updateCar3D(carMesh, car, driveInput, track);
  _updateGhostMesh(now);
  updateScenery(propsGroup, now);
  _updateCamera(dt);

  // ── FOV pump (visual speed sensation) ──
  const kmh = car.speed * KMH_PER_UNIT;
  updateFovPump(camera3d, kmh, car.maxSpeed * TOP_SPEED_MULT, !!car.boosting || !!car.drsActive, dt);

  // ── render ──
  renderer.render(scene, camera3d);
  _renderHUD(dt, kmh);
}

function _saveLapCompletion(event, isNew, completedPath) {
  try {
    saveBestLap(carData.id, track.id, event.lapMs);
    addLapHistory(carData.id, track.id, {
      lapMs: event.lapMs, sectors: event.sectors, date: Date.now(), path: completedPath
    });
    saveBestSectors(track.id, event.sectors, { carName: carData.name });
    if (isNew) {
      saveBestGhost(track.id, {
        lapMs: event.lapMs,
        carId: carData.id,
        carName: carData.name,
        skin: carData.skin || null,
        path: completedPath,
      });
      bestGhost = getBestGhost(track.id);
    }
  } catch (error) {
    console.warn('Lap persistence failed, continuing to results:', error);
  }
}

async function _awardCompletionRewards(event, context) {
  try {
    const rewards = await awardMissions(track.id, event.lapMs, context);
    if (pendingResults?.lapMs === event.lapMs) pendingResults.rewards = rewards;
  } catch (error) {
    console.warn('Reward persistence failed:', error);
  }
}

function _makeLapStats() {
  return {
    throttleUsed: false,
    offTrack: false,
    maxSpeed: 0,
  };
}

function _completionContext() {
  return {
    mode: raceOptions.mode || 'online',
    noThrottle: !lapStats?.throttleUsed,
    offTrack: !!lapStats?.offTrack,
    maxSpeed: lapStats?.maxSpeed || 0,
  };
}

function _createGhostMesh(ghost) {
  if (!ghost?.path?.length || !scene) return null;
  const ghostCar = CAR_DATA.find(item => item.id === ghost.carId) || carData;
  const mesh = createCar3D({ ...ghostCar, skin: ghost.skin });
  mesh.name = 'best-lap-ghost';
  mesh.traverse(child => {
    if (!child.isMesh || !child.material) return;
    const mat = child.material.clone();
    mat.transparent = true;
    mat.opacity = child.name.toLowerCase().includes('tire') ? 0.22 : 0.36;
    mat.depthWrite = false;
    if (mat.emissive) mat.emissiveIntensity = Math.max(mat.emissiveIntensity || 0, 0.22);
    child.material = mat;
  });
  scene.add(mesh);
  return mesh;
}

function _updateGhostMesh(now) {
  if (!ghostMesh || !bestGhost?.path?.length || !timing?.started || timing.lapStart === null) return;
  const elapsed = now - timing.lapStart;
  const path = bestGhost.path;
  let index = path.findIndex(point => point.t >= elapsed);
  if (index <= 0) index = Math.min(1, path.length - 1);
  const prev = path[index - 1] || path[0];
  const next = path[index] || path[path.length - 1];
  const span = Math.max(1, (next.t || 0) - (prev.t || 0));
  const k = Math.max(0, Math.min(1, (elapsed - (prev.t || 0)) / span));
  const x = prev.x + (next.x - prev.x) * k;
  const y = prev.y + (next.y - prev.y) * k;
  const angle = Math.atan2(next.y - prev.y, next.x - prev.x);
  ghostMesh.position.set(x, 1.4, -y);
  ghostMesh.rotation.y = Number.isFinite(angle) ? angle : ghostMesh.rotation.y;
  ghostMesh.visible = elapsed <= (path[path.length - 1]?.t || 0) + 800;
}

// ── drift smoke + skid mark emission ─────────────────────────
function _emitDriftFx(dt, driveInput) {
  const visualDrift = car.drifting || (
    driveInput?.handbrake
    && car.speed > 18
    && (Math.abs(car.steerAngle || 0) > 0.025 || Math.abs(car.sideSpeed || 0) > 2.5)
  );
  if (!visualDrift) {
    delete car._lastSkidL;
    delete car._lastSkidR;
    return;
  }
  // World positions of rear wheels (from car frame, mesh local coords).
  const a = car.angle;
  const cs = Math.cos(a), sn = Math.sin(a);
  // rear wheels: x=-10 (back), z=±9 (sides) in mesh-local; in physics 2D the
  // sides correspond to perpendicular ±9 from car heading.
  const rearOffset = -7.6;
  const sideOffset = 7.2;
  for (const sideSign of [-1, 1]) {
    // mesh-local (-10, 0, sideSign*9). Convert to world-physics 2D:
    //   world x = car.x + rearOffset*cos(a) - sideSign*sideOffset*sin(a)
    //   world y = car.y + rearOffset*sin(a) + sideSign*sideOffset*cos(a)
    const wx = car.x + rearOffset * cs - sideSign * sideOffset * sn;
    const wy = car.y + rearOffset * sn + sideSign * sideOffset * cs;
    const w3z = -wy;
    const key = sideSign < 0 ? '_lastSkidL' : '_lastSkidR';
    const prev = car[key];
    if (prev) {
      const dx = wx - prev.x, dz = w3z - prev.z;
      if (dx*dx + dz*dz > 4.0) {
        skidBuf.appendTrail(prev.x, prev.z, wx, w3z, 1.15, _driftTrailColor());
        car[key] = { x: wx, z: w3z };
      }
    } else {
      car[key] = { x: wx, z: w3z };
    }
  }
}

function _driftTrailColor() {
  const palettes = [
    [0x35f5ff, 0x00c7ff, 0x9ffcff],
    [0xff3b18, 0xff8a00, 0xffd166],
    [0xb85cff, 0x7c3cff, 0xff4dff],
  ];
  const palette = palettes[Math.abs((carData?.id || '').split('').reduce((a, ch) => a + ch.charCodeAt(0), 0)) % palettes.length];
  return palette[Math.floor(Math.random() * palette.length)];
}

function _scheduleResults(ev) {
  if (resultsTimeout) clearTimeout(resultsTimeout);
  resultsTimeout = setTimeout(() => {
    if (!pendingResults) return;
    const next = pendingResults;
    pendingResults = null;
    _showResults(next || ev);
  }, 2200);
}

function _showResults(ev) {
  if (resultsTimeout) {
    clearTimeout(resultsTimeout);
    resultsTimeout = null;
  }
  running = false;
  if (onResults) onResults(ev);
}

// ── chase camera (framerate-independent smoothing) ──────────
function _updateCamera(dt) {
  const isHigh = cameraMode === 'high';
  const isHood = cameraMode === 'hood';
  const DIST       = isHigh ? 0 : isHood ? -8 : 104;
  const HEIGHT     = isHigh ? 380 : isHood ? 13.5 : 46;
  const LOOK_AHEAD = isHigh ? 20 : isHood ? 155 : 64;

  let dA = car.angle - _camAngle;
  while (dA >  Math.PI) dA -= Math.PI * 2;
  while (dA < -Math.PI) dA += Math.PI * 2;
  const angK = 1 - Math.exp(-9.0 * dt);
  _camAngle += dA * angK;

  const a  = _camAngle;
  const cs = Math.cos(a), sn = Math.sin(a);
  const roadY = car.roadHeight || 0;

  const tx = car.x - cs * DIST;
  const ty = HEIGHT + roadY;
  const tz = -(car.y - sn * DIST);

  const lx = car.x + cs * LOOK_AHEAD;
  const ly = (isHigh ? 0 : isHood ? 10.5 : 14) + roadY;
  const lz = -(car.y + sn * LOOK_AHEAD);

  const posK  = 1 - Math.exp(-12.0 * dt);
  const lookK = 1 - Math.exp(-15.0 * dt);

  _camPos.x += (tx - _camPos.x) * posK;
  _camPos.y += (ty - _camPos.y) * posK;
  _camPos.z += (tz - _camPos.z) * posK;

  _camLook.x += (lx - _camLook.x) * lookK;
  _camLook.y += (ly - _camLook.y) * lookK;
  _camLook.z += (lz - _camLook.z) * lookK;

  // Apply screen-shake offset on top of the smoothed position.
  const shk = tickShake(shake, dt);
  camera3d.position.set(_camPos.x + shk.x, _camPos.y + shk.y, _camPos.z);
  camera3d.lookAt(_camLook);

  if (scene && scene.sunLight) {
    const carZ = -car.y;
    scene.sunLight.position.set(car.x + 400, 700, carZ - 300);
    scene.sunLight.target.position.set(car.x, 0, carZ);
    scene.sunLight.target.updateMatrixWorld();
  }
}

// ── HUD overlay ──────────────────────────────────────────────
function _renderHUD(dt, kmh) {
  if (!hudCtx || !hudCanvas) return;
  if (hudCanvas.width !== window.innerWidth) hudCanvas.width = window.innerWidth;
  if (hudCanvas.height !== window.innerHeight) hudCanvas.height = window.innerHeight;
  hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
  // speed-line streaks below normal HUD
  drawSpeedLines(hudCtx, speedLines, kmh, hudCanvas.width, hudCanvas.height, dt, cameraMode);
  drawHUD(hudCtx, car, timing, hudCanvas.width, hudCanvas.height, track, bestGhost);
  if (lapBannerTimer > 0) _drawLapBanner(hudCtx, hudCanvas.width, hudCanvas.height);
  if (!raceReleased) _drawStartSignal(hudCtx, hudCanvas.width, hudCanvas.height);
}

function _sampleLapPath(now) {
  const last = lapPath[lapPath.length - 1];
  if (last) {
    const dx = car.x - last.x;
    const dy = car.y - last.y;
    if (dx * dx + dy * dy < 2600 && now - last.t < 220) return;
  }
  lapPath.push({ x: car.x, y: car.y, t: now - timing.lapStart });
  if (lapPath.length > 900) lapPath.shift();
}

function _drawStartSignal(ctx, w, h) {
  const left = startCountdown;
  const lit = left > 2.2 ? 1 : left > 1.2 ? 2 : left > 0.25 ? 3 : 4;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2;
  const y = h * 0.23;
  ctx.fillStyle = 'rgba(8,12,18,0.92)';
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 3;
  _roundRect(ctx, cx - 170, y - 42, 340, 84, 18);
  ctx.fill();
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const x = cx - 112 + i * 74;
    const go = lit >= 4;
    const active = go ? i === 3 : i < lit;
    const color = go ? '#2ec4b6' : '#e63946';
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, Math.PI * 2);
    ctx.fillStyle = active ? color : '#272d36';
    ctx.shadowColor = active ? color : 'transparent';
    ctx.shadowBlur = active ? 18 : 0;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.stroke();
  }
  ctx.textAlign = 'center';
  ctx.font = '800 20px system-ui';
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.fillText(lit >= 4 ? 'GO!' : '출발 신호 대기', cx, y + 62);
  _drawFlagMarshal(ctx, 90, h * 0.38, performance.now());
  _drawFlagMarshal(ctx, w - 90, h * 0.38, performance.now() + 800, true);
  ctx.restore();
}

function _drawFlagMarshal(ctx, x, y, t, flip = false) {
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  const wave = Math.sin(t * 0.012) * 0.45;
  ctx.strokeStyle = '#f5f5f5';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, 12);
  ctx.lineTo(24, -24);
  ctx.stroke();
  ctx.save();
  ctx.translate(24, -24);
  ctx.rotate(wave);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 3; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#111' : '#fff';
      ctx.fillRect(i * 10, j * 8, 10, 8);
    }
  }
  ctx.restore();
  ctx.fillStyle = '#101820';
  ctx.beginPath();
  ctx.arc(0, -8, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-9, 2, 18, 36);
  ctx.restore();
}

function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function _drawLapBanner(ctx, w, h) {
  const cx = w / 2;
  const cy = h * 0.35;
  ctx.save();
  // backdrop
  ctx.fillStyle = lapBannerNew ? 'rgba(80, 40, 100, 0.78)' : 'rgba(0, 0, 0, 0.78)';
  ctx.fillRect(0, cy - 70, w, 150);
  ctx.strokeStyle = lapBannerNew ? '#ff66ff' : '#ffd23c';
  ctx.lineWidth = 4;
  ctx.strokeRect(0, cy - 70, w, 150);
  // sub label
  ctx.font = 'bold 20px monospace';
  ctx.fillStyle = lapBannerNew ? '#ff66ff' : '#ffd23c';
  ctx.textAlign = 'center';
  ctx.fillText(lapBannerSub, cx, cy - 30);
  // big time
  ctx.font = 'bold 84px monospace';
  ctx.fillStyle = '#fff';
  ctx.fillText(lapBannerText, cx, cy + 40);
  ctx.restore();
}

// ── reset ────────────────────────────────────────────────────
function _resetCar() {
  car.x  = track.startPos.x;
  car.y  = track.startPos.y;
  car.angle = track.startPos.angle;
  car.vx = car.vy = car.speed = 0;
  car.gear = 1;
  car.rpm  = 1000;
  car.steerAngle = 0;
  car.offTrack = false;
  car.boostMeter = 0;
  car.boostTimer = 0;
  car.boostPower = 0;
  car.boosting = false;
  car.superBoostMeter = 100;
  car.drsAvailable = false;
  car.drsActive = false;
  car.drsTimer = 0;
  car.drsTapTimer = 0;
  car.drsPower = 0;
  car.wallRiding = false;
  car.wallRideSide = 0;
  car.lastWallHit = null;
  if (skidBuf) skidBuf.reset();
  // Re-create timing so the new lap starts cleanly when the line is crossed.
  timing = createTiming(getBestSectors(track.id));
  lapPath = [];
  startCountdown = 0;
  startReadyAt = performance.now();
  raceReleased = true;
  startTiming(timing, performance.now());
  lapStats = _makeLapStats();
  lapBannerTimer = 0;
  pendingResults = null;
  if (resultsTimeout) {
    clearTimeout(resultsTimeout);
    resultsTimeout = null;
  }
}

function _onResize() {
  if (!renderer || !camera3d) return;
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera3d.aspect = window.innerWidth / window.innerHeight;
  camera3d.updateProjectionMatrix();
}
