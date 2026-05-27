import * as THREE from 'three';
import { createCarDesign } from './carDesigns.js';
import { getSkinById } from '../data/skins.js';

const CAR_DESIGN_BY_ID = {
  apex_gt3: 'gt_silver',
  feather_sprint: 'classic_green',
  nitro_street: 'muscle_orange',
  lmp: 'cyber_black',
  titan_v12: 'buggy_yellow',
  shadow_rs: 'rally_blue',
  neon_wraith: 'hyper_purple',
  zero_f1: 'formula_red',
  singularity_vmax: 'cyber_black',
  grip_oracle: 'classic_green',
  boost_phoenix: 'muscle_orange',
};

// ── physics state ────────────────────────────────────────────
export function createCar(carData, startPos) {
  return {
    id:          carData.id,
    name:        carData.name,
    mass:        carData.mass,
    power:       carData.power,
    price:       carData.price || 0,
    maxSpeed:    carData.maxSpeed,
    grip:        carData.grip,
    wheelbase:   carData.wheelbase,
    dragCoef:    carData.dragCoef,
    maxRpm:      carData.maxRpm,
    maxTorque:   carData.maxTorque,
    boostChargeRate: carData.boostChargeRate || 14,
    boostCost:   carData.boostCost || 38,
    boostDuration: carData.boostDuration || 1.45,
    boostSpeedMult: carData.boostSpeedMult || 1.23,
    boostAccelMult: carData.boostAccelMult || 1.35,
    flameScale:  carData.flameScale || 1,
    skin:        carData.skin || null,
    color:       carData.color,
    bodyColor:   carData.color,
    x: startPos.x, y: startPos.y, angle: startPos.angle,
    vx: 0, vy: 0, speed: 0,
    engineOn: true,
    parkingBrake: false,
    rpm: 1000, gear: 1, steerAngle: 0,
    offTrack: false,
    transmission: 'auto',     // 'auto' | 'manual'
    revLimitTimer: 0,
    sideSpeed: 0,
    drifting: false,
    boostMeter: 0,            // 0..100
    boostTimer: 0,
    boostPower: 0,
    boosting: false,
    superBoostMeter: 100,
    drsAvailable: false,
    drsActive: false,
    drsTimer: 0,
    drsTapTimer: 0,
    drsPower: 0,
    wallRiding: false,
    wallRideSide: 0,
    lastWallHit: null,
    _acc: 0, _shiftTimer: 0,
    _prevFwdSpeed: 0,
  };
}

// ── 3D mesh ──────────────────────────────────────────────────
// Hierarchy:
//   root (rotation.y = car.angle, position = world)
//     └── createCarDesign(type) child
export function createCar3D(carData = {}) {
  const root = new THREE.Group();
  const designType = carData.designType || CAR_DESIGN_BY_ID[carData.id] || 'formula_red';
  const model = createCarDesign(designType);
  _applySkin(model, carData.skin);
  model.rotation.y = Math.PI / 2;
  model.scale.set(5.2, 5.2, 5.2);
  root.add(model);

  const wheelGroups = [];
  model.traverse(child => {
    const childName = child.name.toLowerCase();
    const isWheelGroup = child.isGroup && childName.includes('wheel') && !childName.includes('_pivot');
    if (isWheelGroup) {
      child.spinPivot = child.userData.spinPivot || child.children.find(c => c.isGroup && c.name.toLowerCase().includes('_pivot'));
      child.baseY = child.userData.baseY ?? child.position.y;
      child.sideSign = child.position.x < 0 ? 1 : -1;
      child.axleSign = child.position.z > 0 ? 1 : -1;
      wheelGroups.push(child);
    }
  });

  root.wheelGroups = wheelGroups;
  root.body        = model;
  root.castShadow  = true;
  root._lastWheelTime = performance.now();

  return root;
}

function _applySkin(model, skinData) {
  const skin = getSkinById(skinData?.id || skinData);
  if (!skin || skin.id === 'factory') return;
  const paint = new THREE.Color(skin.color || '#ffffff');
  const accent = new THREE.Color(skin.accent || skin.color || '#ffffff');
  const emissive = skin.emissive ? new THREE.Color(skin.emissive) : accent.clone().multiplyScalar(0.22);

  model.traverse(child => {
    if (!child.isMesh || !child.material) return;
    const name = child.name.toLowerCase();
    if (name.includes('tire') || name.includes('glass') || name.includes('brakelight') || name.includes('flame')) return;
    const isAccent = name.includes('rim') || name.includes('wing') || name.includes('stripe') || name.includes('spoiler');
    const mat = child.material.clone();
    mat.color.copy(isAccent ? accent : paint);
    if (skin.emissive || skin.id === 'ori' || skin.id === 'flame') {
      mat.emissive = (isAccent ? accent : emissive).clone();
      mat.emissiveIntensity = isAccent ? 0.45 : 0.18;
    }
    child.material = mat;
  });
}

// ── per-frame mesh sync ──────────────────────────────────────
export function updateCar3D(mesh3d, car, input, track = null) {
  // 2D y → 3D -z mapping
  const wallRideLift = car.wallRiding ? Math.min(2.2, 0.35 + (car.speed || 0) * 0.006) : 0;
  const surfaceY = _trackSurfaceHeight(track, car.x, car.y) + wallRideLift;
  car.roadHeight = surfaceY;
  mesh3d.position.set(car.x, surfaceY, -car.y);
  mesh3d.rotation.y = car.angle;

  const speedSign = Math.sign(car.vx * Math.cos(car.angle) + car.vy * Math.sin(car.angle)) || 1;
  const speed = car.speed;
  const speedN = Math.min(1, speed / 210);

  const now = performance.now();
  const wheelDt = Math.min(0.05, Math.max(0, (now - (mesh3d._lastWheelTime || now)) / 1000));
  mesh3d._lastWheelTime = now;
  const spinRate = speed * 2.2 * wheelDt * speedSign;
  for (const wg of (mesh3d.wheelGroups || [])) {
    if (wg.spinPivot) wg.spinPivot.rotation.y += spinRate;
  }


  const throttle = input ? (input.throttle || 0) : 0;
  const brake    = input ? (input.brake    || 0) : 0;

  const a = car.angle;
  const ca = Math.cos(a), sa = Math.sin(a);

  if (!mesh3d._susState) {
    const initY = (mesh3d.wheelGroups?.[0]?.position?.y) ?? 0.48;
    mesh3d._susState = {
      wheels: {
        fl: { y: initY }, fr: { y: initY },
        rl: { y: initY }, rr: { y: initY },
      },
      pitch: 0, roll: 0,
    };
  }

  const sus = mesh3d._susState;
  const baseRef = mesh3d.wheelGroups?.[0]?.baseY ?? mesh3d.wheelGroups?.[0]?.position?.y ?? 0.48;

  const corners = [
    { key: 'fl', lx: 12, lz: 9 },
    { key: 'fr', lx: 12, lz: -9 },
    { key: 'rl', lx: -10, lz: 9 },
    { key: 'rr', lx: -10, lz: -9 },
  ];

  for (const c of corners) {
    const w = sus.wheels[c.key];
    if (!w) continue;
    const wx = car.x + c.lx * ca + c.lz * sa;
    const wy = car.y + c.lx * sa - c.lz * ca;
    const profile = track?.roadProfile;
    const rough = profile?.type === 'rumble' ? 0.20 * (profile.roughness || 1) : 0.04;
    const roadH = Math.sin(wx * 0.003 + wy * 0.005) * rough
                + Math.sin(wx * 0.009 - wy * 0.007) * rough * 0.5;
    const brakeDive = brake * (c.lx > 0 ? -0.42 : 0.16);
    const accelSquat = throttle * (c.lx > 0 ? 0.10 : -0.30);
    const turnSide = Math.sign(car.steerAngle || 0);
    const outsideSide = -turnSide;
    const wheelSide = c.lz > 0 ? 1 : -1;
    const turnLoad = Math.abs(car.steerAngle || 0) * speedN * 0.34;
    const cornerLoad = wheelSide === outsideSide ? -turnLoad : 0;
    const driftPress = car.drifting && wheelSide === outsideSide ? (c.lx < 0 ? -0.34 : -0.18) : 0;
    const targetY = baseRef + roadH + brakeDive + accelSquat + cornerLoad + driftPress;
    w.y += (targetY - w.y) * 0.22;
  }

  const fAvg = (sus.wheels.fl.y + sus.wheels.fr.y) / 2;
  const rAvg = (sus.wheels.rl.y + sus.wheels.rr.y) / 2;
  const lAvg = (sus.wheels.fl.y + sus.wheels.rl.y) / 2;
  const rAvg2 = (sus.wheels.fr.y + sus.wheels.rr.y) / 2;

  if (mesh3d.body) {
    const avgY = (fAvg + rAvg) / 2;
    const driftDrop = car.drifting ? 0.22 : 0;
    mesh3d.body.position.y = avgY - baseRef - driftDrop;
    const targetPitch = (rAvg - fAvg) * 0.02 + throttle * 0.018 - brake * 0.048;
    const driftLean = car.drifting ? -Math.sign(car.sideSpeed || car.steerAngle || 1) * 0.045 : 0;
    const wallRideLean = car.wallRiding ? -(car.wallRideSide || Math.sign(car.sideSpeed || 1)) * 0.075 : 0;
    const targetRoll = (rAvg2 - lAvg) * 0.02 - car.steerAngle * speed * 0.00062 + driftLean + wallRideLean;
    mesh3d.body.rotation.z += (targetPitch - mesh3d.body.rotation.z) * 0.20;
    mesh3d.body.rotation.x += (targetRoll - mesh3d.body.rotation.x) * 0.20;
  }

  for (const wg of (mesh3d.wheelGroups || [])) {
    // Keep tires planted. Suspension now moves only the body so the wheels do
    // not visibly bounce into/out of the road surface.
    wg.position.y = wg.baseY ?? baseRef;
  }

  // front-wheel steer
  if (mesh3d.wheelGroups) {
    const frontWheels = mesh3d.wheelGroups.filter(w => w.position.z > 0);
    for (const wg of frontWheels) wg.rotation.y = car.steerAngle * 0.9;
  }

  // brake lights
  const braking = input && (input.brake > 0);
  mesh3d.traverse(c => {
    if (c.name === 'brakelight' && c.material) {
      c.material.emissive.setHex(braking ? 0xff2222 : 0x441111);
    }
    if (c.name === 'boostflame') {
      const on = !!car.boosting || !!car.drsActive;
      c.visible = on;
      const power = Math.max(car.boostPower || 0, car.drsPower || 0);
      const base = 2.45 * (car.flameScale || 1) * (0.50 + power * 0.95);
      const flicker = 0.88 + Math.random() * 0.22;
      c.scale.set(base * flicker, base * (0.92 + Math.random() * 0.12), base * (0.88 + Math.random() * 0.18));
      c.children.forEach(part => {
        if (!part.material) return;
        const inner = part.name === 'flameinner';
        const glow = part.name === 'flameglow';
        part.material.opacity = on
          ? (inner ? 0.82 : glow ? 0.22 : 0.48) * (0.55 + power * 0.45)
          : 0;
      });
    }
  });
}

function _trackSurfaceHeight(track, x, y) {
  const profile = track?.roadProfile;
  const cl = track?.centerLine || [];
  if (!profile || cl.length < 2) return 0;
  let best = { d2: Infinity, i: 0 };
  for (let i = 0; i < cl.length; i++) {
    const [x1, y1] = cl[i];
    const [x2, y2] = cl[(i + 1) % cl.length];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lenSq));
    const px = x1 + dx * t;
    const py = y1 + dy * t;
    const d2 = (x - px) ** 2 + (y - py) ** 2;
    if (d2 < best.d2) best = { d2, i: i + t };
  }
  const p = best.i / cl.length;
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
