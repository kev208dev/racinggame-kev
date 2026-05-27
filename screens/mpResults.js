import { formatTime } from '../utils/math.js';

let onRematch = null;
let onMenu = null;

export function initMpResults(payload, rematchCb, menuCb) {
  onRematch = rematchCb;
  onMenu = menuCb;

  const list = document.getElementById('mpresults-list');
  if (list) {
    list.innerHTML = '';
    const results = payload?.results || [];
    results.forEach((row, idx) => {
      const li = document.createElement('li');
      const isMe = row.id === payload.myClientId;
      const isFirst = row.finishRank === 1;
      li.className = 'mpresults-row'
        + (isMe ? ' mine' : '')
        + (isFirst ? ' first' : '')
        + (row.dnf ? ' dnf' : '');

      const rank = document.createElement('span');
      rank.className = 'mpresults-rank';
      rank.textContent = row.dnf ? 'DNF' : (row.finishRank ?? '-');

      const name = document.createElement('div');
      name.innerHTML = `<div class="mpresults-name">${escapeHtml(row.playerName || 'Driver')}</div>
                       <div class="mpresults-car">${escapeHtml(row.carName || row.carId || 'Car')}</div>`;

      const total = document.createElement('span');
      total.className = 'mpresults-time';
      total.textContent = row.totalMs != null ? formatTime(row.totalMs) : '--:--.---';

      const best = document.createElement('span');
      best.className = 'mpresults-best';
      best.textContent = row.bestLapMs != null ? `B ${formatTime(row.bestLapMs)}` : '';

      li.append(rank, name, total, best);
      list.appendChild(li);
    });
    if (results.length === 0) {
      list.innerHTML = '<li class="mpresults-row dnf"><span>-</span><div class="mpresults-name">결과 없음</div></li>';
    }
  }

  const title = document.getElementById('mpresults-title');
  if (title) {
    if (payload?.reason === 'time-limit') title.textContent = '시간 초과 — 레이스 종료';
    else if (payload?.reason === 'trailer-timeout') title.textContent = '리더 완주 — 잔여 시간 종료';
    else title.textContent = '레이스 종료';
  }

  const rematchBtn = document.getElementById('btn-mp-rematch');
  const menuBtn = document.getElementById('btn-mp-to-menu');
  if (rematchBtn) rematchBtn.onclick = () => { if (onRematch) onRematch(); };
  if (menuBtn) menuBtn.onclick = () => { if (onMenu) onMenu(); };
}

function escapeHtml(text) {
  return String(text || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
