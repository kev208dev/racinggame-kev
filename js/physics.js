import { clamp } from '../utils/math.js';

export const TOP_SPEED_MULT = 1.95;
export const KMH_PER_UNIT = 1;
const ACCEL_MULT = 1.95;
const BRAKE_MULT = 1.55;
const DRAG_MULT = 1 / (TOP_SPEED_MULT * TOP_SPEED_MULT);
const DRS_MIN_SPEED = 85;
const WALL_RIDE_TURN_MIN = 0.105;
const WALL_RIDE_EXTRA = 7;
const WALL_RIDE_MIN_SPEED = 58;
const COLLISION_EDGE_GRACE = 24;
const OFF_ROAD_GRACE = 18;
const STRAIGHT_DRIFT_STEER_MAX = 0.24;
const STRAIGHT_DRIFT_SLIP_MAX = 0.16;
const TOP_GEAR_REDLINE_MIN = 0.56;
const TOP_GEAR_REDLINE_MAX = 0.65;

// Per-gear "top speed" — speed at which RPM hits maxRpm in that gear.
const GEAR_TOP = [0, 48, 82, 120, 162, 208, 258, 305, 355];
// Acceleration multiplier per gear (low gears = more torque).
const GEAR_ACCEL = [0, 1.12, 1.02, 0.92, 0.80, 0.68, 0.57, 0.48, 0.40];

const SHIFT_UP_RPM   = 0.92; // ratio of maxRpm to auto-upshift
const SHIFT_DOWN_RPM = 0.32; // ratio of maxRpm to auto-downshift
const REV_LIMIT_TIME = 0.08; // sec the throttle is starved on hitting limiter

export function updatePhysics(car, input, dt, track) {
  if (dt <= 0) return;
  if (dt > 0.05) dt = 0.05;

  // ── transmission mode toggle ──
  if (input.autoToggle) {
    car.transmission = (car.transmission === 'manual') ? 'auto' : 'manual';
  }

  // ── boost state machine ──
  _updateDrs(car, input, track, dt);
  _updateBoost(car, input, dt);

  // ── derived car limits (boost-modulated) ──
  const boostPower = clamp(car.boostPower || 0, 0, 1);
  const drsPower = clamp(car.drsPower || 0, 0, 1);
  const powerToWeight = (car.power || car.maxTorque || 520) / Math.max(650, car.mass || 1200);
  const powerFactor = clamp(0.84 + powerToWeight * 0.58, 0.92, 1.55);
  const handlingFactor = clamp(0.90 + (car.grip || 1.6) * 0.075, 0.98, 1.12);
  const maxSpeed  = car.maxSpeed * TOP_SPEED_MULT
    * (1 + ((car.boostSpeedMult || 1.23) - 1) * boostPower)
    * (1 + 0.28 * drsPower);
  const massFactor = Math.pow(1200 / Math.max(650, car.mass || 1200), 0.28);
  const baseAccel = (40 + car.maxTorque * 0.105) * massFactor * powerFactor * ACCEL_MULT
    * (1 + ((car.boostAccelMult || 1.35) - 1) * boostPower)
    * (1 + 0.38 * drsPower);
  const brakeRate = baseAccel * BRAKE_MULT * handlingFactor * Math.pow(1250 / Math.max(700, car.mass || 1250), 0.1);
  const reverseTop = maxSpeed * 0.30;
  const turnPower = input.handbrake ? 1.05 : 1.30;

  car.gear = clamp(car.gear || 1, 1, 8);
  const accelRate = baseAccel * GEAR_ACCEL[car.gear];

  // ── steering ── (negate so D = right turn)
  const speedRatio  = clamp(car.speed / maxSpeed, 0, 1);
  const maxWheel    = (0.72 - speedRatio * 0.28) * handlingFactor;
  const targetWheel = -input.steer * maxWheel;
  car.steerAngle += (targetWheel - car.steerAngle) * Math.min(dt * (input.handbrake ? 9.2 : 5.8), 1);

  const fwdX     = Math.cos(car.angle);
  const fwdY     = Math.sin(car.angle);
  const fwdSpeed = car.vx * fwdX + car.vy * fwdY;

  // ── shift inputs (Q up / E down; auto-switch to manual on use) ──
  if (input.gearUp) {
    car.transmission = 'manual';
    if (car.gear < 8) car.gear += 1;
  }
  if (input.gearDown) {
    car.transmission = 'manual';
    if (car.gear > 1) {
      const newTop = _gearTop(car.gear - 1, car);
      if ((car.speed / newTop) < 1.05) car.gear -= 1;
    }
  }

  // ── rev-limiter timer ──
  car.revLimitTimer = Math.max(0, (car.revLimitTimer || 0) - dt);
  const revLimited = car.revLimitTimer > 0;

  // ── throttle / brake / reverse ──
  if (input.throttle > 0 && !revLimited) {
    car.vx += fwdX * accelRate * input.throttle * dt;
    car.vy += fwdY * accelRate * input.throttle * dt;
  }
  if (input.brake > 0) {
    if (fwdSpeed > 1.0) {
      const sp  = Math.hypot(car.vx, car.vy);
      const dec = brakeRate * input.brake * dt;
      const k   = Math.min(dec / sp, 1);
      car.vx -= car.vx * k;
      car.vy -= car.vy * k;
    } else if (input.throttle === 0) {
      if (fwdSpeed > -reverseTop) {
        car.vx -= fwdX * baseAccel * 0.34 * input.brake * dt;
        car.vy -= fwdY * baseAccel * 0.34 * input.brake * dt;
      }
    }
  }

  // ── yaw ──
  car.speed = Math.hypot(car.vx, car.vy);
  if (car.speed > 0.5) {
    const dirSign  = fwdSpeed >= 0 ? 1 : -1;
    const turnGain = (0.36 + speedRatio * 0.50) * turnPower * handlingFactor;
    car.angle += car.steerAngle * turnGain * dirSign * dt;
    if (input.handbrake && Math.abs(input.steer) > 0.05) {
      car.angle += -input.steer * (0.10 + speedRatio * 0.18) * dt * dirSign;
    }
  }

  // ── KartRider-style drift impulse on space tap / double-tap ──
  _applyDriftImpulse(car, input, dt);

  // ── lateral grip + drift detection ──
  car.speed = Math.hypot(car.vx, car.vy);
  let sSpeed = 0;
  if (car.speed > 0.2) {
    const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
    const sx = -fy,                  sy =  fx;
    const fSpeed = car.vx * fx + car.vy * fy;
    sSpeed = car.vx * sx + car.vy * sy;
    // Looser grip while handbraking → bigger drift.
    const decay  = input.handbrake ? 0.004 : (4.6 + car.grip * 1.55);
    const sNew   = sSpeed * Math.exp(-decay * dt);
    car.vx = fx * fSpeed + sx * sNew;
    car.vy = fy * fSpeed + sy * sNew;
  }
  car.sideSpeed = sSpeed;
  _applyStraightDriftBrake(car, input, dt, sSpeed);
  car.drifting  = (input.handbrake && Math.abs(sSpeed) > 2.5 && car.speed > 16);
  if (car.drifting) {
    const driftIntensity = clamp(Math.abs(sSpeed) / 45, 0.25, 1.15);
    car.boostMeter = Math.min(100, (car.boostMeter || 0) + dt * (car.boostChargeRate || 14) * 0.48 * driftIntensity);
  }

  // ── drag + rolling ──
  car.speed = Math.hypot(car.vx, car.vy);
  if (car.speed > 0.05) {
    const dragDec = car.speed * car.speed * 0.00265 * DRAG_MULT + 1.05;
    const k       = Math.min((dragDec * dt) / car.speed, 1);
    car.vx -= car.vx * k;
    car.vy -= car.vy * k;
  } else {
    car.vx = 0; car.vy = 0;
  }

  // ── top-speed cap ──
  car.speed = Math.hypot(car.vx, car.vy);
  if (car.speed > maxSpeed) {
    const k = maxSpeed / car.speed;
    car.vx *= k; car.vy *= k;
    car.speed = maxSpeed;
  }

  // ── RPM from gear band ──
  const gearTop  = _gearTop(car.gear, car);
  const sNorm    = car.speed / gearTop;
  car.rpm = clamp(1000 + sNorm * (car.maxRpm - 1000), 800, car.maxRpm * 1.10);

  // ── auto-shift OR manual rev limiter ──
  const upRpm   = car.maxRpm * SHIFT_UP_RPM;
  const downRpm = car.maxRpm * SHIFT_DOWN_RPM;
  if (car.transmission !== 'manual') {
    if (car.rpm > upRpm   && car.gear < 8) car.gear += 1;
    if (car.rpm < downRpm && car.gear > 1) car.gear -= 1;
  } else {
    if (car.rpm >= car.maxRpm * 1.02) {
      car.revLimitTimer = REV_LIMIT_TIME;
      car.rpm = car.maxRpm;
    }
  }

  // ── move + 4-corner wall collision ──
  _moveWithCollisionSubsteps(car, dt, track);
  car.speed = Math.hypot(car.vx, car.vy);
}

// Car corners (mesh-local x, z) — match wheel positions in car.js so the
// hitbox actually covers what the player sees on screen.
const CAR_CORNERS = [
  [ 11,   8],  // FL
  [ 11,  -8],  // FR
  [-10,   8],  // RL
  [-10,  -8],  // RR
];

const _trackCollisionCaches = new WeakMap();

function _moveWithCollisionSubsteps(car, dt, track) {
  const dx = car.vx * dt;
  const dy = car.vy * dt;
  const steps = Math.max(1, Math.min(12, Math.ceil(Math.hypot(dx, dy) / 10)));
  for (let i = 0; i < steps; i++) {
    const prevX = car.x;
    const prevY = car.y;
    _resolveCollision(car, prevX + dx / steps, prevY + dy / steps, track);
    if (car.lastWallHit?.time && Math.hypot(car.x - (prevX + dx / steps), car.y - (prevY + dy / steps)) > 4) break;
  }
}

function _resolveCollision(car, nextX, nextY, track) {
  let fx = nextX, fy = nextY;
  const a  = car.angle;
  const ca = Math.cos(a), sa = Math.sin(a);
  const halfTrack = (track.width || 100) / 2;
  const maxDist = Math.max(18, halfTrack + COLLISION_EDGE_GRACE);
  const wallRideLimit = maxDist + WALL_RIDE_EXTRA;
  const offRoadLimit = halfTrack + OFF_ROAD_GRACE;

  let collided = false;
  let rideTouch = false;
  let rideCollisions = 0;
  let hardCollisions = 0;
  let rideSide = 0;
  let aggrNx  = 0, aggrNy = 0;

  for (let iter = 0; iter < 2; iter++) {
    let pushX = 0, pushY = 0, pushCount = 0;
    let anyOff = false;

    for (const [lx, lz] of CAR_CORNERS) {
      const cx = fx + lx * ca + lz * sa;
      const cy = fy + lx * sa - lz * ca;
      const hit = _closestCenterlineSegment(cx, cy, track.centerLine || [], car._collisionSegmentHint);
      if (!hit) continue;
      car._collisionSegmentHint = hit.index;

      const rideable = _isWallRideCorner(car, hit, maxDist);
      if (rideable && hit.dist > maxDist - 2 && hit.dist <= wallRideLimit + 2) {
        rideTouch = true;
        rideSide += _wallRideSide(car, hit);
      }

      const activeLimit = rideable ? wallRideLimit : maxDist;
      const invalidSurface = hit.dist > offRoadLimit && !_isPointOnRoad(cx, cy, track);
      if (hit.dist <= activeLimit && !invalidSurface) continue;

      anyOff = true;
      const softRideHit = rideable && hit.dist <= wallRideLimit + 8;
      const excess = Math.max(0, hit.dist - activeLimit) + (invalidSurface ? 2.4 : (softRideHit ? 0.25 : 0.8));
      const nx = hit.dx / (hit.dist || 1);
      const ny = hit.dy / (hit.dist || 1);
      pushX -= nx * excess;
      pushY -= ny * excess;
      aggrNx -= nx;
      aggrNy -= ny;
      if (softRideHit) rideCollisions++;
      else hardCollisions++;
      pushCount++;
    }

    if (!anyOff) break;
    fx += pushX / Math.max(1, pushCount);
    fy += pushY / Math.max(1, pushCount);
    collided = true;
  }

  if (collided) {
    const wallRiding = rideCollisions > 0 && hardCollisions === 0;
    car.x = fx;
    car.y = fy;
    car.offTrack = !wallRiding;
    car.wallRiding = wallRiding;
    car.wallRideSide = Math.sign(rideSide) || car.wallRideSide || 0;

    // Corner wall-ride banks preserve the tangent speed and only bleed the
    // outward shove, so the player can brush the structure instead of stopping.
    const nl = Math.hypot(aggrNx, aggrNy) || 1;
    const nx = aggrNx / nl;
    const ny = aggrNy / nl;
    if (Number.isFinite(nx) && Number.isFinite(ny)) {
      const vn = car.vx * nx + car.vy * ny;
      if (vn < 0) {
        const normalBleed = wallRiding ? 0.72 : 1.12;
        car.vx -= vn * nx * normalBleed;
        car.vy -= vn * ny * normalBleed;
      }
    }
    car.vx *= wallRiding ? 0.93 : 0.70;
    car.vy *= wallRiding ? 0.93 : 0.70;

    car.lastWallHit = wallRiding ? null : {
      x: fx, y: fy, nx, ny,
      impactSpeed: car.speed,
      totalSpeed: car.speed,
      time: performance.now(),
    };
  } else {
    car.offTrack = false;
    car.wallRiding = rideTouch;
    if (rideTouch) car.wallRideSide = Math.sign(rideSide) || car.wallRideSide || 0;
    car.x = fx;
    car.y = fy;
  }
}

function _applyDriftImpulse(car, input, dt) {
  // Enter key fires the burst impulse; intent is buffered so steering/speed
  // can ramp up after the press without losing the input.
  if (input.driftBurst) car.driftImpulsePending = 0.30;
  car.driftImpulsePending = Math.max(0, (car.driftImpulsePending || 0) - dt);

  if (car.driftImpulsePending > 0
    && Math.abs(input.steer) > 0.05
    && car.speed > 18
    && Math.abs(car.driftImpulse || 0) < 0.0005) {
    const magnitude = Math.PI * 0.50;
    const duration  = 0.32;
    const fwdX = Math.cos(car.angle);
    const fwdY = Math.sin(car.angle);
    const fwdSpeed = car.vx * fwdX + car.vy * fwdY;
    const dirSign = fwdSpeed >= 0 ? 1 : -1;
    car.driftImpulse = -Math.sign(input.steer) * magnitude * dirSign;
    car.driftImpulseRate = car.driftImpulse / duration;
    car.driftImpulsePending = 0;
  }
  if (Math.abs(car.driftImpulse || 0) > 0.0005) {
    const step = (car.driftImpulseRate || 0) * dt;
    if (Math.abs(step) >= Math.abs(car.driftImpulse)) {
      car.angle += car.driftImpulse;
      car.driftImpulse = 0;
      car.driftImpulseRate = 0;
    } else {
      car.angle += step;
      car.driftImpulse -= step;
    }
  }
}

function _applyStraightDriftBrake(car, input, dt, sideSpeed) {
  if (!input.handbrake || input.driftBurst || (car.driftImpulsePending || 0) > 0 || car.speed < 8) return;

  const steerAmount = Math.abs(input.steer || 0);
  const slipRatio = Math.abs(sideSpeed || 0) / Math.max(1, car.speed || 1);
  const noTurn = 1 - clamp(steerAmount / STRAIGHT_DRIFT_STEER_MAX, 0, 1);
  const noSlide = 1 - clamp(slipRatio / STRAIGHT_DRIFT_SLIP_MAX, 0, 1);
  const penalty = noTurn * noSlide;
  if (penalty <= 0.001) return;

  const decel = (72 + car.speed * 0.34) * penalty * dt;
  const k = Math.min(decel / Math.max(1, car.speed), 0.24);
  car.vx -= car.vx * k;
  car.vy -= car.vy * k;
}

function _updateBoost(car, input, dt) {
  car.boostMeter = clamp(car.boostMeter || 0, 0, 100);
  car.boostTimer = Math.max(0, (car.boostTimer || 0) - dt);

  const cost = car.boostCost || 38;
  if (input.boostJust && car.boostMeter >= cost && car.boostTimer <= 0) {
    car.boostTimer = car.boostDuration || 1.45;
    car._boostDrainPerSec = cost / Math.max(0.25, car.boostTimer);
  }
  if (car.boostTimer > 0) {
    car.boostMeter = Math.max(0, car.boostMeter - (car._boostDrainPerSec || cost) * dt);
    if (car.boostMeter <= 0) car.boostTimer = 0;
  }
  car.boosting = car.boostTimer > 0;
  const target = car.boosting ? 1 : 0;
  const response = car.boosting ? 5.5 : 3.2;
  car.boostPower = (car.boostPower || 0) + (target - (car.boostPower || 0)) * (1 - Math.exp(-response * dt));
}

function _updateDrs(car, input, track, dt) {
  car.superBoostMeter = clamp(car.superBoostMeter ?? 100, 0, 100);
  car.drsTimer = Math.max(0, (car.drsTimer || 0) - dt);
  car.drsTapTimer = Math.max(0, (car.drsTapTimer || 0) - dt);

  const hit = _closestCenterlineSegment(car.x, car.y, track.centerLine || []);
  let available = false;
  if (hit && car.speed > DRS_MIN_SPEED && !car.drifting && !car.offTrack) {
    const fwdX = Math.cos(car.angle);
    const fwdY = Math.sin(car.angle);
    const headingAlign = Math.abs(fwdX * hit.tx + fwdY * hit.ty);
    available = hit.straightness > 0.965 && headingAlign > 0.82 && hit.dist < (track.width || 100) * 0.40;
  }

  if (available && input.boostJust && car.superBoostMeter > 8) {
    if (input.boostDouble || car.drsTapTimer > 0) {
      car.drsTimer = 2.6;
      car.drsTapTimer = 0;
    } else {
      car.drsTapTimer = 0.48;
    }
  }

  if (!available) {
    car.drsTimer = 0;
    car.drsTapTimer = 0;
    car.superBoostMeter = Math.min(100, car.superBoostMeter + dt * 18);
  }

  let active = available && car.drsTimer > 0 && car.superBoostMeter > 0;
  if (active) {
    car.superBoostMeter = Math.max(0, car.superBoostMeter - 42 * dt);
    if (car.superBoostMeter <= 0) {
      car.drsTimer = 0;
      active = false;
    }
  }
  car.drsAvailable = available;
  car.drsActive = active;
  const target = active ? 1 : 0;
  car.drsPower = (car.drsPower || 0) + (target - (car.drsPower || 0)) * (1 - Math.exp(-(active ? 5.0 : 5.8) * dt));
}

function _gearTop(gear, car = null) {
  const baseTop = GEAR_TOP[8] || 355;
  const gearTop = GEAR_TOP[gear] || GEAR_TOP[1];
  if (!car?.maxSpeed) return gearTop * TOP_SPEED_MULT;
  const topGearRedline = car.maxSpeed * TOP_SPEED_MULT * _topGearRedlineRatio(car);
  return (gearTop / baseTop) * topGearRedline;
}

function _topGearRedlineRatio(car) {
  const powerToWeight = (car.power || car.maxTorque || 520) / Math.max(650, car.mass || 1200);
  const lowTopSpeedComp = Math.max(0, 320 - (car.maxSpeed || 320)) * 0.00135;
  const highPowerComp = Math.max(0, powerToWeight - 0.70) * 0.11;
  return clamp(0.56 + lowTopSpeedComp + highPowerComp, TOP_GEAR_REDLINE_MIN, TOP_GEAR_REDLINE_MAX);
}

function _closestCenterlineSegment(x, y, centerLine, hintIndex = null) {
  const cache = _getCollisionCache(centerLine);
  const segments = cache.segments;
  if (!segments.length) return null;

  let best = null;
  let bestD2 = Infinity;
  const scanSegment = (seg) => {
    const t  = clamp(((x - seg.x1) * seg.ex + (y - seg.y1) * seg.ey) / seg.len2, 0, 1);
    const px = seg.x1 + t * seg.ex, py = seg.y1 + t * seg.ey;
    const ddx = x - px, ddy = y - py;
    const d2 = ddx * ddx + ddy * ddy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = {
        px, py, dx: ddx, dy: ddy,
        dist: Math.sqrt(d2),
        tx: seg.tx, ty: seg.ty,
        straightness: seg.straightness,
        localTurn: seg.localTurn,
        index: seg.index,
      };
    }
  };

  const hinted = Number.isFinite(hintIndex);
  if (hinted) {
    const radius = 14;
    for (let off = -radius; off <= radius; off++) {
      const idx = (hintIndex + off + segments.length) % segments.length;
      scanSegment(segments[idx]);
    }
  } else {
    for (const seg of segments) scanSegment(seg);
  }

  if (hinted) {
    const maxExpected = 260;
    if (!best || bestD2 > maxExpected * maxExpected) {
      best = null;
      bestD2 = Infinity;
      for (const seg of segments) scanSegment(seg);
    }
  }

  return best;
}

function _getCollisionCache(centerLine) {
  if (!centerLine?.length) return { segments: [] };
  let cache = _trackCollisionCaches.get(centerLine);
  if (cache) return cache;

  const segments = [];
  for (let i = 0; i < centerLine.length; i++) {
    const [x1, y1] = centerLine[i];
    const [x2, y2] = centerLine[(i + 1) % centerLine.length];
    const ex = x2 - x1, ey = y2 - y1;
    const len2 = ex * ex + ey * ey;
    if (len2 < 1e-6) continue;
    const len = Math.sqrt(len2) || 1;
    const prev = centerLine[(i - 4 + centerLine.length) % centerLine.length];
    const next = centerLine[(i + 5) % centerLine.length];
    const vx = next[0] - prev[0];
    const vy = next[1] - prev[1];
    const vl = Math.hypot(vx, vy) || 1;
    segments.push({
      index: i,
      x1, y1, ex, ey, len2,
      tx: ex / len,
      ty: ey / len,
      straightness: Math.abs((ex / len) * (vx / vl) + (ey / len) * (vy / vl)),
      localTurn: _localTurnMax(centerLine, i, 4),
    });
  }
  cache = { segments };
  _trackCollisionCaches.set(centerLine, cache);
  return cache;
}

function _isPointOnRoad(x, y, track) {
  const outer = track?.outerBoundary;
  const inner = track?.innerBoundary;
  if (!outer?.length || !inner?.length) return true;
  return _pointInPoly(x, y, outer) && !_pointInPoly(x, y, inner);
}

function _pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function _isWallRideCorner(car, hit, maxDist) {
  if (!hit || hit.localTurn < WALL_RIDE_TURN_MIN || hit.dist < maxDist - 5) return false;
  const speed = Math.hypot(car.vx || 0, car.vy || 0);
  if (speed < WALL_RIDE_MIN_SPEED) return false;
  const tangentAlign = Math.abs(((car.vx || 0) * hit.tx + (car.vy || 0) * hit.ty) / speed);
  return tangentAlign > 0.42;
}

function _wallRideSide(car, hit) {
  const sideX = -Math.sin(car.angle || 0);
  const sideY = Math.cos(car.angle || 0);
  return Math.sign((hit.dx || 0) * sideX + (hit.dy || 0) * sideY) || 0;
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
