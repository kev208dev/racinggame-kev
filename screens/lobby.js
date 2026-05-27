import { TRACKS } from '../data/tracks.js';
import { CAR_DATA } from '../data/cars.js';
import { MpClient } from '../js/net/mpClient.js';
import { getDisplayProfile } from '../utils/profile.js';

const QUICK_TAB = 'quick';
const PRIVATE_TAB = 'private';

let net = null;
let currentTab = QUICK_TAB;
let currentRoom = null;
let myClientId = null;
let onStartRace = null;   // (carData, trackData, room, net) => void
let onBack = null;
let selectedCar = null;
let queueTrackId = null;
let toastTimer = null;
let unsubscribers = [];
let initialized = false;

export function initLobby(car, startCb, backCb) {
  selectedCar = car;
  onStartRace = startCb;
  onBack = backCb;
  currentRoom = null;
  myClientId = null;
  queueTrackId = null;
  currentTab = QUICK_TAB;

  _populateTrackSelectors();
  _wireOnce();
  _renderTabs();
  _renderRoom(null);
  _renderQueueStatus(null);

  _ensureSocket();
  _updateConnState(net?.connected);
}

export function teardownLobby() {
  for (const fn of unsubscribers) {
    try { fn(); } catch {}
  }
  unsubscribers = [];
  if (net) {
    if (currentRoom) {
      try { net.send({ t: 'leaveRoom' }); } catch {}
    } else if (queueTrackId) {
      try { net.send({ t: 'cancelQueue' }); } catch {}
    }
    net.disconnect();
    net = null;
  }
  currentRoom = null;
  queueTrackId = null;
  myClientId = null;
}

function _wireOnce() {
  if (initialized) return;
  initialized = true;

  document.getElementById('lobby-tab-quick')?.addEventListener('click', () => _switchTab(QUICK_TAB));
  document.getElementById('lobby-tab-private')?.addEventListener('click', () => _switchTab(PRIVATE_TAB));
  document.getElementById('btn-lobby-back')?.addEventListener('click', () => {
    teardownLobby();
    if (onBack) onBack();
  });
  document.getElementById('btn-lobby-quick')?.addEventListener('click', () => _startQuickMatch());
  document.getElementById('btn-lobby-quick-cancel')?.addEventListener('click', () => _cancelQuickMatch());
  document.getElementById('btn-lobby-create')?.addEventListener('click', () => _createRoom());
  document.getElementById('btn-lobby-join')?.addEventListener('click', () => _joinRoom());
  document.getElementById('btn-lobby-ready')?.addEventListener('click', () => _toggleReady());
  document.getElementById('btn-lobby-start')?.addEventListener('click', () => _startRace());
  document.getElementById('btn-lobby-leave')?.addEventListener('click', () => _leaveRoom());

  document.getElementById('lobby-room-track-select')?.addEventListener('change', (e) => {
    if (!currentRoom || currentRoom.hostId !== myClientId) return;
    net?.send({ t: 'setTrack', trackId: e.target.value });
  });
  document.getElementById('lobby-room-laps-select')?.addEventListener('change', (e) => {
    if (!currentRoom || currentRoom.hostId !== myClientId) return;
    net?.send({ t: 'setLaps', laps: Number(e.target.value) });
  });
}

function _populateTrackSelectors() {
  const opts = TRACKS.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  for (const id of ['lobby-quick-track', 'lobby-private-track', 'lobby-room-track-select']) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = opts;
  }
}

function _switchTab(tab) {
  currentTab = tab;
  document.getElementById('lobby-tab-quick')?.classList.toggle('active', tab === QUICK_TAB);
  document.getElementById('lobby-tab-private')?.classList.toggle('active', tab === PRIVATE_TAB);
  document.getElementById('lobby-pane-quick')?.classList.toggle('hidden', tab !== QUICK_TAB);
  document.getElementById('lobby-pane-private')?.classList.toggle('hidden', tab !== PRIVATE_TAB);
}

function _ensureSocket() {
  if (net) return;
  const identity = getDisplayProfile();
  net = new MpClient();
  unsubscribers.push(net.on('open', () => _updateConnState(true)));
  unsubscribers.push(net.on('close', () => _updateConnState(false)));
  unsubscribers.push(net.on('welcome', (msg) => { myClientId = msg.clientId; }));
  unsubscribers.push(net.on('joined', (msg) => {
    myClientId = msg.you;
    queueTrackId = null;
    _renderQueueStatus(null);
  }));
  unsubscribers.push(net.on('roomState', (msg) => {
    currentRoom = msg.room;
    _renderRoom(currentRoom);
  }));
  unsubscribers.push(net.on('queueState', (msg) => {
    queueTrackId = msg.trackId;
    _renderQueueStatus(msg);
  }));
  unsubscribers.push(net.on('queueCancelled', () => {
    queueTrackId = null;
    _renderQueueStatus(null);
  }));
  unsubscribers.push(net.on('queueExpired', () => {
    queueTrackId = null;
    _renderQueueStatus(null);
    _toast('대기 시간이 만료되었습니다. 다시 시도하세요.');
  }));
  unsubscribers.push(net.on('error', (msg) => {
    _toast(msg.message || '서버 오류');
  }));
  unsubscribers.push(net.on('countdown', (msg) => {
    if (!currentRoom) return;
    const track = TRACKS.find(t => t.id === currentRoom.trackId);
    if (!track) return;
    const car = selectedCar || CAR_DATA[0];
    if (onStartRace) onStartRace(car, track, currentRoom, net, msg.startAt, myClientId);
  }));
  net.connect(identity);
}

function _updateConnState(online) {
  const el = document.getElementById('lobby-conn-state');
  if (!el) return;
  el.classList.toggle('online', !!online);
  el.classList.toggle('offline', !online);
  el.textContent = online ? '서버와 연결됨' : '서버 연결 끊김 — 재연결 중...';
}

function _startQuickMatch() {
  if (!net?.connected) { _toast('서버 연결을 기다리는 중...'); return; }
  const trackId = document.getElementById('lobby-quick-track')?.value;
  if (!trackId) return;
  net.send({
    t: 'quickMatch',
    trackId,
    carId: selectedCar?.id,
    carName: selectedCar?.name,
  });
  queueTrackId = trackId;
  document.getElementById('btn-lobby-quick')?.classList.add('hidden');
  document.getElementById('btn-lobby-quick-cancel')?.classList.remove('hidden');
}

function _cancelQuickMatch() {
  if (!net) return;
  net.send({ t: 'cancelQueue' });
  queueTrackId = null;
  document.getElementById('btn-lobby-quick')?.classList.remove('hidden');
  document.getElementById('btn-lobby-quick-cancel')?.classList.add('hidden');
  _renderQueueStatus(null);
}

function _createRoom() {
  if (!net?.connected) { _toast('서버 연결을 기다리는 중...'); return; }
  const trackId = document.getElementById('lobby-private-track')?.value;
  if (!trackId) return;
  net.send({
    t: 'createRoom',
    trackId,
    carId: selectedCar?.id,
    carName: selectedCar?.name,
  });
}

function _joinRoom() {
  if (!net?.connected) { _toast('서버 연결을 기다리는 중...'); return; }
  const codeInput = document.getElementById('lobby-private-code');
  const code = (codeInput?.value || '').trim().toUpperCase();
  if (!code) { _toast('코드를 입력하세요.'); return; }
  net.send({
    t: 'joinRoom',
    code,
    carId: selectedCar?.id,
    carName: selectedCar?.name,
  });
}

function _toggleReady() {
  if (!currentRoom || !net) return;
  const me = currentRoom.players.find(p => p.id === myClientId);
  const ready = !(me?.ready);
  net.send({ t: 'setReady', ready });
}

function _startRace() {
  if (!currentRoom || !net) return;
  if (currentRoom.hostId !== myClientId) return;
  net.send({ t: 'start' });
}

function _leaveRoom() {
  if (!net) return;
  net.send({ t: 'leaveRoom' });
  currentRoom = null;
  _renderRoom(null);
}

function _renderTabs() {
  _switchTab(currentTab);
}

function _renderRoom(room) {
  const pane = document.getElementById('lobby-room-pane');
  if (!pane) return;
  if (!room) {
    pane.classList.add('hidden');
    return;
  }
  pane.classList.remove('hidden');

  const codeEl = document.getElementById('lobby-room-code');
  if (codeEl) codeEl.textContent = room.code;
  const label = document.getElementById('lobby-room-label');
  if (label) label.textContent = room.isPrivate ? '친구방 코드' : '빠른 매칭 방';

  const trackName = TRACKS.find(t => t.id === room.trackId)?.name || room.trackId;
  const trackEl = document.getElementById('lobby-room-track');
  if (trackEl) trackEl.textContent = `🏁 ${trackName}`;
  const lapsEl = document.getElementById('lobby-room-laps');
  if (lapsEl) lapsEl.textContent = `${room.lapTarget} LAP`;

  const isHost = room.hostId === myClientId;
  const trackSelect = document.getElementById('lobby-room-track-select');
  const lapsSelect = document.getElementById('lobby-room-laps-select');
  const controls = document.getElementById('lobby-room-controls');
  if (controls) controls.classList.toggle('hidden', !isHost || !room.isPrivate);
  if (trackSelect) trackSelect.value = room.trackId;
  if (lapsSelect) lapsSelect.value = String(room.lapTarget);

  const list = document.getElementById('lobby-player-list');
  if (list) {
    list.innerHTML = '';
    for (const p of room.players) {
      const li = document.createElement('li');
      li.className = 'lobby-player-row'
        + (p.id === myClientId ? ' is-me' : '')
        + (p.isHost ? ' is-host' : '');
      const dot = document.createElement('span');
      dot.className = 'lobby-player-dot';
      dot.style.background = p.themeColor || '#2ec4b6';
      const name = document.createElement('div');
      name.innerHTML = `<div class="lobby-player-name">${escapeHtml(p.playerName)}</div>
                       <div class="lobby-player-car">${escapeHtml(p.carName || p.carId || 'Car')}</div>`;
      const host = document.createElement('span');
      host.className = 'lobby-player-flag' + (p.isHost ? ' host' : '');
      host.textContent = p.isHost ? 'HOST' : '';
      if (!p.isHost) host.style.visibility = 'hidden';
      const ready = document.createElement('span');
      ready.className = 'lobby-player-flag' + (p.ready ? ' ready' : '');
      ready.textContent = p.ready ? 'READY' : 'WAIT';
      li.append(dot, name, host, ready);
      list.appendChild(li);
    }
  }

  const startBtn = document.getElementById('btn-lobby-start');
  if (startBtn) {
    startBtn.classList.toggle('hidden', !isHost);
    const ready = room.players.filter(p => p.ready).length;
    startBtn.disabled = room.status !== 'waiting' || room.players.length < 1;
    startBtn.textContent = isHost
      ? `레이스 시작 (${ready}/${room.players.length} 준비)`
      : '대기 중...';
  }

  const readyBtn = document.getElementById('btn-lobby-ready');
  if (readyBtn) {
    const me = room.players.find(p => p.id === myClientId);
    readyBtn.textContent = me?.ready ? '준비 해제' : '준비 완료';
    readyBtn.classList.toggle('btn-primary', !!me?.ready);
  }
}

function _renderQueueStatus(state) {
  const el = document.getElementById('lobby-queue-status');
  if (!el) return;
  if (!state) {
    el.textContent = '대기 인원: -';
    return;
  }
  const seconds = Math.max(0, Math.ceil(state.etaMs / 1000));
  el.textContent = `매칭 중 · ${state.count}/${state.target}명 · ${seconds}초 후 자동 시작`;
}

function _toast(text) {
  const el = document.getElementById('lobby-toast');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
}

function escapeHtml(text) {
  return String(text || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export function getActiveNet() {
  return net;
}

export function detachNet() {
  // Hand off the socket to MP game without disconnecting.
  for (const fn of unsubscribers) {
    try { fn(); } catch {}
  }
  unsubscribers = [];
  const handle = net;
  net = null;
  currentRoom = null;
  queueTrackId = null;
  return handle;
}
