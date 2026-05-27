import { SKIN_DATA } from '../data/skins.js';
import { getSkinProgressText, getSkinUnlockText, isSkinOwned } from '../utils/profile.js';

let selectedIndex = 0;
let onSelect = null;
let onBack = null;

export function initSkinSelect(cb, backCb) {
  onSelect = cb;
  onBack = backCb;
  selectedIndex = 0;
  _render();
}

function _render() {
  const grid = document.getElementById('skin-grid');
  if (!grid) return;
  grid.innerHTML = '';

  if (!isSkinOwned(SKIN_DATA[selectedIndex]?.id)) {
    selectedIndex = Math.max(0, SKIN_DATA.findIndex(skin => isSkinOwned(skin.id)));
  }

  SKIN_DATA.forEach((skin, index) => {
    const owned = isSkinOwned(skin.id);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'skin-card' + (index === selectedIndex ? ' selected' : '') + (owned ? '' : ' locked');
    card.style.setProperty('--skin-color', skin.color);
    card.style.setProperty('--skin-accent', skin.accent);
    card.innerHTML = `
      <span class="skin-swatch"></span>
      <b>${skin.name}</b>
      <small>${skin.rarity}</small>
      <em>${owned ? '보유 중' : getSkinUnlockText(skin)}</em>
      <span>${owned ? skin.description : getSkinProgressText(skin)}</span>
    `;
    card.addEventListener('click', () => {
      if (!owned) return;
      selectedIndex = index;
      _render();
    });
    grid.appendChild(card);
  });

  const desc = document.getElementById('skin-desc');
  const selected = SKIN_DATA[selectedIndex];
  if (desc && selected) desc.textContent = selected.description;

  const backBtn = document.getElementById('btn-back-skin-car');
  const nextBtn = document.getElementById('btn-to-mode');
  if (backBtn) backBtn.onclick = () => { if (onBack) onBack(); };
  if (nextBtn) nextBtn.onclick = () => {
    const skin = SKIN_DATA[selectedIndex];
    if (!skin || !isSkinOwned(skin.id)) return;
    if (onSelect) onSelect(skin);
  };
}
