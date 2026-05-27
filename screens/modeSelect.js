let onSelect = null;
let onBack = null;

export function initModeSelect(cb, backCb) {
  onSelect = cb;
  onBack = backCb;
  _wire();
}

function _wire() {
  const online = document.getElementById('btn-mode-online');
  const offline = document.getElementById('btn-mode-offline');
  const back = document.getElementById('btn-back-mode-skin');
  if (online) online.onclick = () => onSelect?.('online');
  if (offline) offline.onclick = () => onSelect?.('offline');
  if (back) back.onclick = () => onBack?.();
}
