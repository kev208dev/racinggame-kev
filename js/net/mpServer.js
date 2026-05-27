// Inline WebSocket implementation + multiplayer room manager.
// Pure Node, no external dependencies. Handles text frames + ping/pong + close.

import { createHash, randomBytes } from 'node:crypto';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LEN = 6;
const MAX_PLAYERS_PER_ROOM = 8;
const QUICK_FILL_MS = 8000;
const QUICK_MAX_WAIT_MS = 30000;
const SNAPSHOT_HZ = 20;
const SNAPSHOT_INTERVAL_MS = 1000 / SNAPSHOT_HZ;
const COUNTDOWN_MS = 3500;
const MIN_LAPS = 1;
const MAX_LAPS = 5;
const DEFAULT_LAPS = 3;
const HEARTBEAT_INTERVAL_MS = 15000;
const HEARTBEAT_TIMEOUT_MS = 35000;
const HELLO_DEADLINE_MS = 5000;
const RACE_HARD_LIMIT_MS = 15 * 60 * 1000;
const MIN_LAP_MS = 15000;
const MAX_LAP_MS = 10 * 60 * 1000;

// ── WebSocket frame handling ────────────────────────────────────

export function attachWebSocket(server, path, onConnection) {
  server.on('upgrade', (req, socket /* net.Socket */, head) => {
    if (!req.url || !req.url.startsWith(path)) {
      socket.destroy();
      return;
    }
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }
    const accept = createHash('sha1').update(key + WS_GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );
    socket.setNoDelay(true);
    const conn = new WsConnection(socket);
    onConnection(conn, req);
  });
}

class WsConnection {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.closed = false;
    this.onMessage = null;
    this.onClose = null;
    this.lastPongAt = Date.now();
    this.pendingFragments = null;
    this.fragmentOpcode = 0;

    socket.on('data', (chunk) => this._onData(chunk));
    socket.on('close', () => this._handleClose());
    socket.on('error', () => this._handleClose());
  }

  _onData(chunk) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    this._parse();
  }

  _parse() {
    while (this.buffer.length >= 2 && !this.closed) {
      const b0 = this.buffer[0];
      const b1 = this.buffer[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let offset = 2;
      if (len === 126) {
        if (this.buffer.length < 4) return;
        len = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        if (this.buffer.length < 10) return;
        const lo = this.buffer.readUInt32BE(6);
        const hi = this.buffer.readUInt32BE(2);
        if (hi !== 0) {
          this._fail();
          return;
        }
        len = lo;
        offset = 10;
      }
      if (masked) {
        if (this.buffer.length < offset + 4) return;
        var maskKey = this.buffer.subarray(offset, offset + 4);
        offset += 4;
      }
      if (this.buffer.length < offset + len) return;

      let payload = Buffer.from(this.buffer.subarray(offset, offset + len));
      if (masked) {
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= maskKey[i & 3];
        }
      }
      this.buffer = this.buffer.subarray(offset + len);

      if (opcode === 0x8) {
        this._sendFrame(0x8, Buffer.alloc(0));
        this._handleClose();
        return;
      }
      if (opcode === 0x9) {
        this._sendFrame(0xA, payload);
        continue;
      }
      if (opcode === 0xA) {
        this.lastPongAt = Date.now();
        continue;
      }
      if (opcode === 0x0 || opcode === 0x1 || opcode === 0x2) {
        if (opcode !== 0x0) {
          this.pendingFragments = payload;
          this.fragmentOpcode = opcode;
        } else if (this.pendingFragments) {
          this.pendingFragments = Buffer.concat([this.pendingFragments, payload]);
        }
        if (fin) {
          const finalBuf = this.pendingFragments || payload;
          const finalOp = this.pendingFragments ? this.fragmentOpcode : opcode;
          this.pendingFragments = null;
          this.fragmentOpcode = 0;
          if (finalOp === 0x1 && this.onMessage) {
            try { this.onMessage(finalBuf.toString('utf8')); }
            catch (err) { /* ignore */ }
          }
        }
      }
    }
  }

  send(text) {
    if (this.closed) return;
    const payload = typeof text === 'string' ? Buffer.from(text, 'utf8') : Buffer.from(text);
    this._sendFrame(0x1, payload);
  }

  ping() {
    if (this.closed) return;
    this._sendFrame(0x9, Buffer.alloc(0));
  }

  _sendFrame(opcode, payload) {
    if (this.closed) return;
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.alloc(2);
      header[1] = len;
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[1] = 127;
      header.writeUInt32BE(0, 2);
      header.writeUInt32BE(len, 6);
    }
    header[0] = 0x80 | opcode;
    try {
      this.socket.write(header);
      this.socket.write(payload);
    } catch {
      this._handleClose();
    }
  }

  close() {
    if (this.closed) return;
    try { this._sendFrame(0x8, Buffer.alloc(0)); } catch {}
    try { this.socket.end(); } catch {}
    this._handleClose();
  }

  _fail() {
    try { this.socket.destroy(); } catch {}
    this._handleClose();
  }

  _handleClose() {
    if (this.closed) return;
    this.closed = true;
    try { this.socket.destroy(); } catch {}
    if (this.onClose) this.onClose();
  }
}

// ── Multiplayer state ───────────────────────────────────────────

const CLIENTS = new Set();
const ROOMS = new Map();        // code -> Room
const QUICK_QUEUES = new Map(); // trackId -> { players: Set<MpClient>, timer, firstJoinAt }

class MpClient {
  constructor(conn) {
    this.conn = conn;
    this.id = randomBytes(8).toString('hex');
    this.helloed = false;
    this.helloDeadline = setTimeout(() => {
      if (!this.helloed) this.close('hello-timeout');
    }, HELLO_DEADLINE_MS);
    this.playerId = null;
    this.playerName = 'Driver';
    this.themeColor = '#2ec4b6';
    this.room = null;
    this.queueTrackId = null;
    this.carId = null;
    this.carName = null;
    this.ready = false;
    this.lastState = null;
    this.lap = 0;
    this.lapMs = null;
    this.bestLapMs = null;
    this.lapTimes = [];
    this.finishedAt = null;
    this.dnf = false;
    this.totalMs = null;
    this.heartbeat = setInterval(() => {
      if (Date.now() - this.conn.lastPongAt > HEARTBEAT_TIMEOUT_MS) {
        this.close('heartbeat-timeout');
        return;
      }
      try { this.conn.ping(); } catch {}
    }, HEARTBEAT_INTERVAL_MS);

    conn.onMessage = (raw) => this._onMessage(raw);
    conn.onClose = () => this._onDisconnect();
  }

  send(obj) {
    try { this.conn.send(JSON.stringify(obj)); }
    catch {}
  }

  sendError(code, message) {
    this.send({ t: 'error', code, message });
  }

  close(reason) {
    try { this.conn.close(); } catch {}
  }

  _onMessage(raw) {
    let msg;
    try { msg = JSON.parse(raw); }
    catch { return; }
    if (!msg || typeof msg.t !== 'string') return;

    if (msg.t === 'hello') return this._handleHello(msg);
    if (!this.helloed) return this.sendError('not-helloed', '먼저 hello 메시지를 보내세요.');

    switch (msg.t) {
      case 'quickMatch': return this._handleQuickMatch(msg);
      case 'createRoom': return this._handleCreateRoom(msg);
      case 'joinRoom':   return this._handleJoinRoom(msg);
      case 'leaveRoom':  return this._handleLeaveRoom();
      case 'setReady':   return this._handleSetReady(msg);
      case 'setTrack':   return this._handleSetTrack(msg);
      case 'setLaps':    return this._handleSetLaps(msg);
      case 'setCar':     return this._handleSetCar(msg);
      case 'start':      return this._handleStart();
      case 'state':      return this._handleState(msg);
      case 'lap':        return this._handleLap(msg);
      case 'finish':     return this._handleFinish(msg);
      case 'ping':       return this.send({ t: 'pong', id: msg.id });
      case 'cancelQueue':return this._cancelQueue();
      default: this.sendError('unknown', `알 수 없는 메시지: ${msg.t}`);
    }
  }

  _handleHello(msg) {
    if (this.helloed) return;
    this.playerId = sanitizeId(msg.playerId) || `guest_${this.id.slice(0, 6)}`;
    this.playerName = sanitizeName(msg.playerName, 'Driver');
    this.themeColor = sanitizeColor(msg.themeColor) || '#2ec4b6';
    this.helloed = true;
    clearTimeout(this.helloDeadline);
    this.send({ t: 'welcome', clientId: this.id });
  }

  _handleQuickMatch(msg) {
    if (this.room) {
      this.sendError('already-in-room', '이미 방에 있습니다.');
      return;
    }
    const trackId = sanitizeId(msg.trackId);
    const carId = sanitizeId(msg.carId);
    const carName = sanitizeName(msg.carName, carId || 'Car');
    if (!trackId || !carId) {
      this.sendError('bad-quick-match', '트랙 또는 차량 정보가 없습니다.');
      return;
    }
    this.carId = carId;
    this.carName = carName;
    this.queueTrackId = trackId;

    let queue = QUICK_QUEUES.get(trackId);
    if (!queue) {
      queue = { players: new Set(), timer: null, firstJoinAt: 0, maxWaitTimer: null };
      QUICK_QUEUES.set(trackId, queue);
    }
    queue.players.add(this);
    if (queue.players.size === 1) {
      queue.firstJoinAt = Date.now();
      queue.maxWaitTimer = setTimeout(() => promoteQuickQueue(trackId, /*forceSolo*/ true), QUICK_MAX_WAIT_MS);
    }
    if (queue.players.size >= 2 && !queue.timer) {
      queue.timer = setTimeout(() => promoteQuickQueue(trackId), QUICK_FILL_MS);
    }
    if (queue.players.size >= MAX_PLAYERS_PER_ROOM) {
      if (queue.timer) clearTimeout(queue.timer);
      if (queue.maxWaitTimer) clearTimeout(queue.maxWaitTimer);
      promoteQuickQueue(trackId);
      return;
    }
    broadcastQuickQueue(trackId);
  }

  _cancelQueue() {
    if (!this.queueTrackId) return;
    const queue = QUICK_QUEUES.get(this.queueTrackId);
    if (queue) {
      queue.players.delete(this);
      if (queue.players.size === 0) {
        if (queue.timer) clearTimeout(queue.timer);
        if (queue.maxWaitTimer) clearTimeout(queue.maxWaitTimer);
        QUICK_QUEUES.delete(this.queueTrackId);
      } else {
        broadcastQuickQueue(this.queueTrackId);
      }
    }
    const trackId = this.queueTrackId;
    this.queueTrackId = null;
    this.send({ t: 'queueCancelled', trackId });
  }

  _handleCreateRoom(msg) {
    if (this.room) {
      this.sendError('already-in-room', '이미 방에 있습니다.');
      return;
    }
    const trackId = sanitizeId(msg.trackId);
    const carId = sanitizeId(msg.carId);
    const carName = sanitizeName(msg.carName, carId || 'Car');
    if (!trackId || !carId) {
      this.sendError('bad-create', '트랙 또는 차량 정보가 없습니다.');
      return;
    }
    this.carId = carId;
    this.carName = carName;
    const code = generateRoomCode();
    const room = new Room(code, trackId, /*isPrivate*/ true);
    room.hostId = this.id;
    ROOMS.set(code, room);
    room.addPlayer(this);
  }

  _handleJoinRoom(msg) {
    if (this.room) {
      this.sendError('already-in-room', '이미 방에 있습니다.');
      return;
    }
    const code = sanitizeCode(msg.code);
    const carId = sanitizeId(msg.carId);
    const carName = sanitizeName(msg.carName, carId || 'Car');
    if (!code || !carId) {
      this.sendError('bad-join', '방 코드 또는 차량 정보가 없습니다.');
      return;
    }
    const room = ROOMS.get(code);
    if (!room) {
      this.sendError('room-not-found', '존재하지 않는 방 코드입니다.');
      return;
    }
    if (room.status !== 'waiting') {
      this.sendError('room-in-progress', '이미 시작된 방입니다.');
      return;
    }
    if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
      this.sendError('room-full', '방이 가득 찼습니다.');
      return;
    }
    this.carId = carId;
    this.carName = carName;
    room.addPlayer(this);
  }

  _handleLeaveRoom() {
    if (this.queueTrackId) {
      this._cancelQueue();
      return;
    }
    if (!this.room) return;
    this.room.removePlayer(this);
  }

  _handleSetReady(msg) {
    if (!this.room) return;
    this.ready = !!msg.ready;
    this.room.broadcastRoomState();
  }

  _handleSetTrack(msg) {
    if (!this.room) return;
    if (this.room.hostId !== this.id) return;
    if (this.room.status !== 'waiting') return;
    const trackId = sanitizeId(msg.trackId);
    if (!trackId) return;
    this.room.trackId = trackId;
    this.room.broadcastRoomState();
  }

  _handleSetLaps(msg) {
    if (!this.room) return;
    if (this.room.hostId !== this.id) return;
    if (this.room.status !== 'waiting') return;
    const n = Math.max(MIN_LAPS, Math.min(MAX_LAPS, Math.round(Number(msg.laps) || DEFAULT_LAPS)));
    this.room.lapTarget = n;
    this.room.broadcastRoomState();
  }

  _handleSetCar(msg) {
    if (!this.room) return;
    if (this.room.status !== 'waiting') return;
    const carId = sanitizeId(msg.carId);
    const carName = sanitizeName(msg.carName, carId || 'Car');
    if (!carId) return;
    this.carId = carId;
    this.carName = carName;
    this.room.broadcastRoomState();
  }

  _handleStart() {
    if (!this.room) return;
    if (this.room.hostId !== this.id) return;
    this.room.startCountdown();
  }

  _handleState(msg) {
    if (!this.room || this.room.status !== 'racing') return;
    // Validate numbers + clamp to prevent malformed snapshots.
    const x = Number(msg.x), y = Number(msg.y), a = Number(msg.a);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(a)) return;
    this.lastState = {
      x,
      y,
      a,
      vx: clampNum(msg.vx, -2000, 2000),
      vy: clampNum(msg.vy, -2000, 2000),
      g: clampNum(msg.g, 0, 8) | 0,
      drift: !!msg.drift,
      boost: !!msg.boost,
      drs: !!msg.drs,
      lap: clampNum(msg.lap, 0, 99) | 0,
      lm: clampNum(msg.lm, 0, RACE_HARD_LIMIT_MS) | 0,
      ts: Date.now(),
    };
  }

  _handleLap(msg) {
    if (!this.room || this.room.status !== 'racing') return;
    const lapMs = Math.round(Number(msg.lapMs));
    const lapNum = clampNum(msg.lapNum, 1, MAX_LAPS) | 0;
    if (!Number.isFinite(lapMs) || lapMs < MIN_LAP_MS || lapMs > MAX_LAP_MS) return;
    if (lapNum !== this.lap + 1) return;
    this.lap = lapNum;
    this.lapTimes.push(lapMs);
    if (this.bestLapMs == null || lapMs < this.bestLapMs) this.bestLapMs = lapMs;
    this.room.broadcastPlayerLap(this, lapMs, lapNum);
    if (this.lap >= this.room.lapTarget) {
      this._markFinished();
    }
  }

  _handleFinish(msg) {
    if (!this.room) return;
    if (this.finishedAt != null) return;
    if (this.lap < this.room.lapTarget) return;
    this._markFinished();
  }

  _markFinished() {
    this.finishedAt = Date.now();
    this.totalMs = this.lapTimes.reduce((s, n) => s + n, 0);
    this.room.handlePlayerFinished(this);
  }

  _onDisconnect() {
    clearTimeout(this.helloDeadline);
    clearInterval(this.heartbeat);
    CLIENTS.delete(this);
    if (this.queueTrackId) {
      const queue = QUICK_QUEUES.get(this.queueTrackId);
      if (queue) {
        queue.players.delete(this);
        if (queue.players.size === 0) {
          if (queue.timer) clearTimeout(queue.timer);
          if (queue.maxWaitTimer) clearTimeout(queue.maxWaitTimer);
          QUICK_QUEUES.delete(this.queueTrackId);
        } else {
          broadcastQuickQueue(this.queueTrackId);
        }
      }
      this.queueTrackId = null;
    }
    if (this.room) {
      this.dnf = this.room.status === 'racing' && this.finishedAt == null;
      this.room.removePlayer(this, /*dropped*/ true);
    }
  }
}

class Room {
  constructor(code, trackId, isPrivate) {
    this.code = code;
    this.trackId = trackId;
    this.isPrivate = isPrivate;
    this.hostId = null;
    this.players = new Map();
    this.status = 'waiting';
    this.startAt = 0;
    this.raceStartedAt = 0;
    this.lapTarget = DEFAULT_LAPS;
    this.snapshotTimer = null;
    this.countdownTimer = null;
    this.raceLimitTimer = null;
    this.finishOrder = [];
    this.createdAt = Date.now();
  }

  addPlayer(client) {
    client.room = this;
    client.ready = false;
    client.lap = 0;
    client.lapTimes = [];
    client.bestLapMs = null;
    client.finishedAt = null;
    client.totalMs = null;
    client.dnf = false;
    client.lastState = null;
    this.players.set(client.id, client);
    if (!this.hostId || !this.players.has(this.hostId)) {
      this.hostId = client.id;
    }
    client.send({ t: 'joined', code: this.code, you: client.id });
    this.broadcastRoomState();
  }

  removePlayer(client, dropped = false) {
    if (!this.players.has(client.id)) return;
    this.players.delete(client.id);
    client.room = null;
    if (this.players.size === 0) {
      this._dispose();
      ROOMS.delete(this.code);
      return;
    }
    if (this.hostId === client.id) {
      this.hostId = this.players.keys().next().value;
    }
    if (this.status === 'racing') {
      this.broadcastPlayerLeft(client.id, dropped);
      this._checkFinishedAll();
    }
    this.broadcastRoomState();
  }

  startCountdown() {
    if (this.status !== 'waiting') return;
    if (this.players.size < 1) return;
    this.status = 'countdown';
    this.startAt = Date.now() + COUNTDOWN_MS;
    for (const player of this.players.values()) {
      player.lap = 0;
      player.lapTimes = [];
      player.bestLapMs = null;
      player.finishedAt = null;
      player.totalMs = null;
      player.dnf = false;
      player.lastState = null;
    }
    this.broadcastRoomState();
    this.broadcast({ t: 'countdown', startAt: this.startAt, trackId: this.trackId, lapTarget: this.lapTarget });
    this.countdownTimer = setTimeout(() => this._startRace(), COUNTDOWN_MS);
  }

  _startRace() {
    if (this.status !== 'countdown') return;
    this.status = 'racing';
    this.raceStartedAt = Date.now();
    this.broadcast({ t: 'raceStart', serverTime: this.raceStartedAt });
    this.snapshotTimer = setInterval(() => this._tickSnapshot(), SNAPSHOT_INTERVAL_MS);
    this.raceLimitTimer = setTimeout(() => this._forceEnd('time-limit'), RACE_HARD_LIMIT_MS);
  }

  _tickSnapshot() {
    const T = Date.now();
    const players = [];
    for (const p of this.players.values()) {
      if (!p.lastState) continue;
      players.push({
        id: p.id,
        x: p.lastState.x,
        y: p.lastState.y,
        a: p.lastState.a,
        vx: p.lastState.vx,
        vy: p.lastState.vy,
        g: p.lastState.g,
        drift: p.lastState.drift,
        boost: p.lastState.boost,
        drs: p.lastState.drs,
        lap: p.lap,
        finished: p.finishedAt != null,
        ts: p.lastState.ts,
      });
    }
    this.broadcast({ t: 'snap', T, P: players });
  }

  handlePlayerFinished(client) {
    if (!this.finishOrder.includes(client.id)) {
      this.finishOrder.push(client.id);
    }
    this.broadcast({
      t: 'playerFinish',
      id: client.id,
      totalMs: client.totalMs,
      bestLapMs: client.bestLapMs,
      rank: this.finishOrder.length,
    });
    this._checkFinishedAll();
  }

  _checkFinishedAll() {
    const remaining = [...this.players.values()].filter(p => p.finishedAt == null);
    if (remaining.length === 0) {
      this._endRace('all-finished');
    } else if (this.finishOrder.length > 0) {
      const leaderTotal = (() => {
        const first = this.players.get(this.finishOrder[0]);
        return first?.totalMs ?? 0;
      })();
      const trailerDeadline = leaderTotal + 60000;
      const elapsed = Date.now() - this.raceStartedAt;
      if (elapsed > trailerDeadline + 30000) {
        this._endRace('trailer-timeout');
      }
    }
  }

  _forceEnd(reason) {
    if (this.status !== 'racing') return;
    this._endRace(reason);
  }

  _endRace(reason) {
    if (this.status === 'finished') return;
    this.status = 'finished';
    if (this.snapshotTimer) clearInterval(this.snapshotTimer);
    if (this.raceLimitTimer) clearTimeout(this.raceLimitTimer);
    this.snapshotTimer = null;
    this.raceLimitTimer = null;

    const results = [];
    for (const p of this.players.values()) {
      const rank = this.finishOrder.indexOf(p.id);
      results.push({
        id: p.id,
        playerName: p.playerName,
        themeColor: p.themeColor,
        carId: p.carId,
        carName: p.carName,
        lapsCompleted: p.lap,
        totalMs: p.totalMs,
        bestLapMs: p.bestLapMs,
        finishRank: rank >= 0 ? rank + 1 : null,
        dnf: p.finishedAt == null,
      });
    }
    results.sort((a, b) => {
      if (a.dnf && !b.dnf) return 1;
      if (!a.dnf && b.dnf) return -1;
      if (a.finishRank != null && b.finishRank != null) return a.finishRank - b.finishRank;
      if (b.lapsCompleted !== a.lapsCompleted) return b.lapsCompleted - a.lapsCompleted;
      return (a.totalMs || Infinity) - (b.totalMs || Infinity);
    });
    this.broadcast({ t: 'raceEnd', reason, results });

    setTimeout(() => {
      this.status = 'waiting';
      this.startAt = 0;
      this.raceStartedAt = 0;
      this.finishOrder = [];
      for (const p of this.players.values()) {
        p.ready = false;
        p.lap = 0;
        p.lapTimes = [];
        p.bestLapMs = null;
        p.finishedAt = null;
        p.totalMs = null;
        p.dnf = false;
        p.lastState = null;
      }
      this.broadcastRoomState();
    }, 30000);
  }

  broadcastRoomState() {
    const payload = { t: 'roomState', room: this.serialize() };
    for (const p of this.players.values()) p.send(payload);
  }

  broadcastPlayerLap(client, lapMs, lapNum) {
    const isBest = client.bestLapMs === lapMs;
    this.broadcast({
      t: 'playerLap',
      id: client.id,
      lapMs,
      lapNum,
      isBest,
      bestLapMs: client.bestLapMs,
    });
  }

  broadcastPlayerLeft(id, dropped) {
    this.broadcast({ t: 'playerLeft', id, dropped });
  }

  broadcast(payload) {
    const json = JSON.stringify(payload);
    for (const p of this.players.values()) {
      try { p.conn.send(json); } catch {}
    }
  }

  serialize() {
    return {
      code: this.code,
      trackId: this.trackId,
      isPrivate: this.isPrivate,
      hostId: this.hostId,
      status: this.status,
      lapTarget: this.lapTarget,
      startAt: this.startAt,
      players: [...this.players.values()].map(p => ({
        id: p.id,
        playerName: p.playerName,
        themeColor: p.themeColor,
        carId: p.carId,
        carName: p.carName,
        ready: p.ready,
        isHost: p.id === this.hostId,
      })),
    };
  }

  _dispose() {
    if (this.snapshotTimer) clearInterval(this.snapshotTimer);
    if (this.countdownTimer) clearTimeout(this.countdownTimer);
    if (this.raceLimitTimer) clearTimeout(this.raceLimitTimer);
    this.snapshotTimer = null;
    this.countdownTimer = null;
    this.raceLimitTimer = null;
  }
}

// ── Quick-match promotion ──────────────────────────────────────

function promoteQuickQueue(trackId, allowSolo = false) {
  const queue = QUICK_QUEUES.get(trackId);
  if (!queue) return;
  const players = [...queue.players];
  if (queue.timer) clearTimeout(queue.timer);
  if (queue.maxWaitTimer) clearTimeout(queue.maxWaitTimer);

  if (players.length < 2 && !allowSolo) return;
  if (players.length === 0) {
    QUICK_QUEUES.delete(trackId);
    return;
  }

  QUICK_QUEUES.delete(trackId);
  for (const p of players) p.queueTrackId = null;

  if (players.length === 1) {
    players[0].send({ t: 'queueExpired', trackId });
    return;
  }

  const code = `Q-${randomBytes(2).toString('hex').toUpperCase()}`;
  const room = new Room(code, trackId, /*isPrivate*/ false);
  room.hostId = players[0].id;
  ROOMS.set(code, room);
  for (const p of players.slice(0, MAX_PLAYERS_PER_ROOM)) {
    room.addPlayer(p);
  }
  setTimeout(() => {
    if (room.status === 'waiting' && room.players.size >= 1) {
      room.startCountdown();
    }
  }, 1500);
}

function broadcastQuickQueue(trackId) {
  const queue = QUICK_QUEUES.get(trackId);
  if (!queue) return;
  const elapsed = Date.now() - queue.firstJoinAt;
  const remaining = queue.players.size >= 2
    ? Math.max(0, QUICK_FILL_MS - (Date.now() - queue.firstJoinAt))
    : Math.max(0, QUICK_MAX_WAIT_MS - elapsed);
  const payload = {
    t: 'queueState',
    trackId,
    count: queue.players.size,
    target: MAX_PLAYERS_PER_ROOM,
    etaMs: remaining,
  };
  for (const p of queue.players) p.send(payload);
}

// ── Public hook ────────────────────────────────────────────────

export function attachMultiplayer(server, path = '/api/mp') {
  attachWebSocket(server, path, (conn) => {
    const client = new MpClient(conn);
    CLIENTS.add(client);
  });
}

export function mpStats() {
  return {
    clients: CLIENTS.size,
    rooms: ROOMS.size,
    quickQueues: [...QUICK_QUEUES.entries()].map(([trackId, q]) => ({
      trackId,
      count: q.players.size,
    })),
  };
}

// ── helpers ────────────────────────────────────────────────────

function sanitizeId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
}

function sanitizeName(value, fallback) {
  const text = String(value || '').replace(/[^\p{L}\p{N}\s._-]/gu, '').trim();
  return (text || fallback || 'Driver').slice(0, 24);
}

function sanitizeColor(value) {
  const text = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : null;
}

function sanitizeCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12);
}

function generateRoomCode() {
  for (let attempt = 0; attempt < 8; attempt++) {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LEN; i++) {
      code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
    }
    if (!ROOMS.has(code)) return code;
  }
  return `R-${randomBytes(3).toString('hex').toUpperCase()}`;
}

function clampNum(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(min, Math.min(max, n));
}
