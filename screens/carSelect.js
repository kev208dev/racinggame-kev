import { CAR_DATA } from '../data/cars.js';
import { isCarUnlocked, unlockProgressText, unlockText } from '../utils/unlocks.js';
import { getProfile, onProfileChange, purchaseCar } from '../utils/profile.js';

let selectedIndex    = 0;
let selectedCategory = 'All';
let onSelect         = null;
let profileUnsub     = null;

const CATEGORIES = ['All', 'GT3', 'Lightweight', 'Prototype', 'Road Car', 'Heavyweight', 'Formula', 'Transcendent'];

export function initCarSelect(cb) {
  onSelect         = cb;
  selectedIndex    = 0;
  selectedCategory = 'All';
  if (!profileUnsub) profileUnsub = onProfileChange(() => _render());
  _render();
}

// ── helpers ─────────────────────────────────────────────────
function _filtered() {
  return CAR_DATA.filter(c =>
    selectedCategory === 'All' || c.category === selectedCategory
  );
}

function _render() {
  if (_isLocked(CAR_DATA[selectedIndex])) {
    const firstOpen = CAR_DATA.findIndex(car => !_isLocked(car));
    if (firstOpen >= 0) selectedIndex = firstOpen;
  }

  // ── category tabs ──
  const tabsEl = document.getElementById('cat-tabs');
  if (tabsEl) {
    tabsEl.innerHTML = '';
    CATEGORIES.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'cat-tab' + (cat === selectedCategory ? ' active' : '');
      btn.textContent = cat;
      btn.addEventListener('click', () => { selectedCategory = cat; _render(); });
      tabsEl.appendChild(btn);
    });
  }

  // ── car grid ──
  const grid = document.getElementById('car-grid');
  if (!grid) return;
  grid.innerHTML = '';

  _filtered().forEach(car => {
    const idx  = CAR_DATA.indexOf(car);
    const card = document.createElement('div');
    const locked = _isLocked(car);
    card.className = 'car-card' + (idx === selectedIndex ? ' selected' : '') + (locked ? ' locked' : '');

    // mini preview canvas
    const previewDiv = document.createElement('div');
    previewDiv.className = 'car-preview';
    previewDiv.style.background = car.color + '22';
    const cv = document.createElement('canvas');
    cv.width = 160; cv.height = 70;
    _drawCarPreview(cv, car);
    previewDiv.appendChild(cv);

    card.appendChild(previewDiv);
    card.insertAdjacentHTML('beforeend', `
      <div class="car-name">${car.name}</div>
      <span class="car-badge">${locked ? (Number(car.price || 0) <= 0 ? 'FREE' : 'SHOP') : car.rarity || car.category}</span>
      <div class="car-tags">
        <span>${car.driveType}</span>
        <span>${car.power} hp</span>
        <span>${locked ? `${Number(car.price || 0).toLocaleString()} C` : 'OWNED'}</span>
      </div>
      <div class="car-spec">
        ${_statRow('속도', car.maxSpeed / 340)}
        ${_statRow('가속', (5.0 - parseFloat(car.acceleration)) / 2.2)}
        ${_statRow('그립', car.grip / 2.2)}
        ${_statRow('부스트', ((car.boostChargeRate || 12) / Math.max(1, car.boostCost || 40)) * 1.35)}
      </div>
    `);

    if (locked) {
      const lock = document.createElement('div');
      lock.className = 'car-lock';
      const profile = getProfile();
      const price = Number(car.price || 0);
      const canBuy = !!profile && (profile.coins || 0) >= price;
      lock.innerHTML = `
        <b>${unlockText(car)}</b>
        <span>${unlockProgressText(car)}</span>
        <button class="btn-secondary btn-small car-buy" type="button">${canBuy ? '구매' : '잠김'}</button>
      `;
      const buy = lock.querySelector('.car-buy');
      buy.disabled = !canBuy;
      buy.addEventListener('click', async event => {
        event.stopPropagation();
        try {
          buy.textContent = '구매 중...';
          await purchaseCar(car);
          selectedIndex = idx;
          _render();
        } catch (error) {
          buy.textContent = error?.message === 'login-required' ? '로그인 필요' : '코인 부족';
          setTimeout(() => _render(), 900);
        }
      });
      card.appendChild(lock);
    }

    card.addEventListener('click', () => {
      if (locked) {
        const descEl = document.getElementById('car-desc');
        if (descEl) descEl.textContent = `${car.name} 잠금해제 조건: ${unlockText(car)}. ${unlockProgressText(car)}.`;
        return;
      }
      selectedIndex = idx;
      _render();
    });
    grid.appendChild(card);
  });

  // ── description ──
  const descEl = document.getElementById('car-desc');
  const selCar = CAR_DATA[selectedIndex];
  if (descEl && selCar) descEl.textContent = selCar.description;

  // ── confirm button ──
  const btn = document.getElementById('btn-to-track');
  if (btn) btn.onclick = () => {
    const car = CAR_DATA[selectedIndex];
    if (_isLocked(car)) return;
    if (onSelect) onSelect(car);
  };
}

function _isLocked(car) {
  return !car || !isCarUnlocked(car);
}

function _statRow(label, value) {
  const over = value > 1.05;
  const pct = Math.max(8, Math.min(100, Math.round(value * 100)));
  return `
    <div class="stat-row${over ? ' over' : ''}">
      <span>${label}</span>
      <b><i style="width:${pct}%"></i></b>
    </div>
  `;
}

// ── mini car drawing ─────────────────────────────────────────
const PREVIEW_DESIGNS = {
  apex_gt3: { kind: 'gt', body: '#cfd8dc', accent: '#e11218', wheel: '#e11218', stripe: 'side', wing: true, length: 122, height: 30 },
  feather_sprint: { kind: 'classic', body: '#1b7f3a', accent: '#f2f5f6', wheel: '#cfd8dc', stripe: 'center', fin: true, length: 112, height: 27 },
  nitro_street: { kind: 'muscle', body: '#f57c00', accent: '#050505', wheel: '#050505', stripe: 'dual', scoop: true, length: 120, height: 32 },
  lmp: { kind: 'cyber', body: '#111111', accent: '#00d9ff', wheel: '#00d9ff', stripe: 'center', wing: true, length: 124, height: 25 },
  titan_v12: { kind: 'buggy', body: '#ffc400', accent: '#050505', wheel: '#ffc400', cage: true, length: 104, height: 31 },
  shadow_rs: { kind: 'rally', body: '#1565c0', accent: '#f2f5f6', wheel: '#f2f5f6', stripe: 'center', wing: true, length: 108, height: 33 },
  neon_wraith: { kind: 'hyper', body: '#7b1fa2', accent: '#00d9ff', wheel: '#00d9ff', stripe: 'channel', wing: true, length: 126, height: 25 },
  zero_f1: { kind: 'formula', body: '#e11218', accent: '#f2f5f6', wheel: '#050505', stripe: 'center', length: 126, height: 23 },
  singularity_vmax: { kind: 'hyper', body: '#35f5ff', accent: '#ffd166', wheel: '#35f5ff', stripe: 'channel', wing: true, length: 130, height: 23 },
  grip_oracle: { kind: 'formula', body: '#4ade80', accent: '#f2f5f6', wheel: '#050505', stripe: 'center', length: 118, height: 22 },
  boost_phoenix: { kind: 'muscle', body: '#ff4a08', accent: '#ffd166', wheel: '#ff4a08', stripe: 'dual', scoop: true, length: 122, height: 31 },
};

function _drawCarPreview(canvas, car) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const spec = PREVIEW_DESIGNS[car.id] || { kind: 'gt', body: car.color, accent: '#ffd84a', wheel: car.color, length: 114, height: 30 };
  ctx.clearRect(0, 0, w, h);

  const bg = ctx.createLinearGradient(12, 6, w - 10, h - 8);
  bg.addColorStop(0, 'rgba(255,255,255,0.16)');
  bg.addColorStop(1, 'rgba(0,0,0,0.38)');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(8, 8, w - 16, h - 16, 10);
  ctx.fill();

  ctx.save();
  ctx.translate(w / 2, h / 2 + 8);
  ctx.rotate(-0.05);

  ctx.fillStyle = 'rgba(0,0,0,0.36)';
  ctx.beginPath();
  ctx.ellipse(0, 19, spec.length * 0.45, 7.5, 0, 0, Math.PI * 2);
  ctx.fill();

  if (spec.kind === 'formula') {
    _drawFormulaPreview(ctx, spec);
  } else if (spec.kind === 'buggy') {
    _drawBuggyPreview(ctx, spec);
  } else {
    _drawClosedWheelPreview(ctx, spec);
  }

  ctx.restore();
}

function _drawClosedWheelPreview(ctx, spec) {
  const L = spec.length;
  const H = spec.height;
  const bodyGrad = ctx.createLinearGradient(-L / 2, -H, L / 2, H);
  bodyGrad.addColorStop(0, '#ffffff');
  bodyGrad.addColorStop(0.20, spec.body);
  bodyGrad.addColorStop(1, '#10151c');

  _drawWheel(ctx, -L * 0.34, 12, spec.kind === 'rally' ? 11 : 10.5, spec.wheel);
  _drawWheel(ctx, L * 0.34, 12, spec.kind === 'rally' ? 11 : 10.5, spec.wheel);

  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.moveTo(-L * 0.50, 7);
  ctx.bezierCurveTo(-L * 0.43, -H * 0.20, -L * 0.24, -H * 0.62, -L * 0.02, -H * 0.70);
  ctx.bezierCurveTo(L * 0.18, -H * 0.78, L * 0.36, -H * 0.26, L * 0.50, 5);
  ctx.bezierCurveTo(L * 0.38, 15, -L * 0.38, 15, -L * 0.50, 7);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(6,16,24,0.84)';
  ctx.beginPath();
  ctx.ellipse(L * 0.08, -H * 0.36, spec.kind === 'classic' ? 18 : 24, spec.kind === 'muscle' ? 9 : 10.5, -0.02, 0, Math.PI * 2);
  ctx.fill();

  if (spec.stripe === 'center') _stripe(ctx, spec.accent, -L * 0.38, -5, L * 0.76, 3);
  if (spec.stripe === 'dual') {
    _stripe(ctx, spec.accent, -L * 0.38, -8, L * 0.78, 3);
    _stripe(ctx, spec.accent, -L * 0.38, -2, L * 0.78, 3);
  }
  if (spec.stripe === 'side') {
    _stripe(ctx, spec.accent, -L * 0.42, 3, L * 0.58, 4);
  }
  if (spec.stripe === 'channel') {
    _stripe(ctx, '#050505', -L * 0.34, -7, L * 0.58, 6);
    _headlight(ctx, spec.accent, L * 0.34, -8);
  }

  if (spec.scoop) {
    ctx.fillStyle = spec.accent;
    ctx.beginPath();
    ctx.roundRect(L * 0.06, -H * 0.66, 22, 8, 2);
    ctx.fill();
  }
  if (spec.fin) {
    ctx.fillStyle = spec.body;
    ctx.fillRect(-L * 0.32, -H * 0.80, 18, 16);
  }
  if (spec.wing) {
    ctx.fillStyle = spec.kind === 'rally' ? spec.body : '#050505';
    ctx.fillRect(-L * 0.45, -H * 0.86, 40, 5);
    ctx.fillRect(-L * 0.36, -H * 0.73, 4, 14);
  }

  ctx.fillStyle = '#050505';
  ctx.fillRect(L * 0.35, 2, 20, 5);
  if (spec.kind === 'gt') _headlight(ctx, '#f2f5f6', L * 0.34, -3);
}

function _drawBuggyPreview(ctx, spec) {
  const L = spec.length;
  const H = spec.height;
  _drawWheel(ctx, -L * 0.35, 12, 14, spec.wheel);
  _drawWheel(ctx, L * 0.35, 12, 14, spec.wheel);

  ctx.fillStyle = spec.body;
  ctx.beginPath();
  ctx.moveTo(-L * 0.40, 9);
  ctx.lineTo(-L * 0.25, -H * 0.38);
  ctx.lineTo(L * 0.22, -H * 0.44);
  ctx.lineTo(L * 0.42, 7);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = spec.accent;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-L * 0.22, -H * 0.36);
  ctx.lineTo(-L * 0.08, -H * 0.92);
  ctx.lineTo(L * 0.22, -H * 0.84);
  ctx.lineTo(L * 0.30, -H * 0.34);
  ctx.moveTo(-L * 0.08, -H * 0.92);
  ctx.lineTo(-L * 0.16, -H * 0.34);
  ctx.stroke();

  ctx.fillStyle = 'rgba(6,16,24,0.82)';
  ctx.beginPath();
  ctx.ellipse(0, -H * 0.34, 18, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = spec.accent;
  ctx.fillRect(L * 0.34, 1, 24, 5);
  ctx.fillRect(-L * 0.53, 2, 22, 5);
}

function _drawFormulaPreview(ctx, spec) {
  const L = spec.length;
  const H = spec.height;
  _drawWheel(ctx, -L * 0.37, 12, 10.5, spec.wheel);
  _drawWheel(ctx, L * 0.33, 12, 10.5, spec.wheel);
  _drawWheel(ctx, -L * 0.37, -15, 9.5, spec.wheel);
  _drawWheel(ctx, L * 0.33, -15, 9.5, spec.wheel);

  ctx.fillStyle = spec.body;
  ctx.beginPath();
  ctx.moveTo(-L * 0.44, 2);
  ctx.lineTo(-L * 0.26, -H * 0.48);
  ctx.lineTo(L * 0.46, -H * 0.22);
  ctx.lineTo(L * 0.50, 1);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(-L * 0.10, -H * 0.55, 40, 13);
  ctx.fillStyle = 'rgba(6,16,24,0.84)';
  ctx.beginPath();
  ctx.ellipse(-L * 0.02, -H * 0.66, 14, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  _stripe(ctx, spec.accent, -L * 0.36, -7, L * 0.74, 3);

  ctx.fillStyle = '#050505';
  ctx.fillRect(L * 0.35, -25, 30, 5);
  ctx.fillRect(-L * 0.58, -3, 34, 5);
  ctx.strokeStyle = '#050505';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-L * 0.20, -2);
  ctx.lineTo(-L * 0.37, -15);
  ctx.moveTo(L * 0.12, -3);
  ctx.lineTo(L * 0.33, -15);
  ctx.stroke();
}

function _drawWheel(ctx, x, y, r, rim) {
  ctx.fillStyle = '#050505';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#b8c0c8';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.36, 0, Math.PI * 2);
  ctx.fill();
}

function _stripe(ctx, color, x, y, w, h) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
}

function _headlight(ctx, color, x, y) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, 8, 3, -0.18, 0, Math.PI * 2);
  ctx.fill();
}
