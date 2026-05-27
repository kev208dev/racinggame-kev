// Client-side WebSocket wrapper for the multiplayer server.
// Lightweight: connect, send JSON, dispatch typed events, reconnect-with-backoff.

const RECONNECT_INITIAL_MS = 800;
const RECONNECT_MAX_MS = 8000;
const PING_INTERVAL_MS = 12000;

export class MpClient extends EventTarget {
  constructor() {
    super();
    this.ws = null;
    this.url = null;
    this.identity = null;
    this.reconnectMs = RECONNECT_INITIAL_MS;
    this.shouldReconnect = false;
    this.pingTimer = null;
    this.connected = false;
    this.clientId = null;
    this.lastPongAt = 0;
  }

  connect(identity) {
    this.identity = identity;
    this.shouldReconnect = true;
    this.url = buildWsUrl();
    this._openSocket();
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    this.connected = false;
  }

  _openSocket() {
    let ws;
    try {
      ws = new WebSocket(this.url);
    } catch (err) {
      this._scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.addEventListener('open', () => {
      this.connected = true;
      this.reconnectMs = RECONNECT_INITIAL_MS;
      this.lastPongAt = performance.now();
      this._sendHello();
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this._heartbeat(), PING_INTERVAL_MS);
      this._emit('open');
    });
    ws.addEventListener('message', (e) => {
      let msg;
      try { msg = JSON.parse(e.data); }
      catch { return; }
      if (!msg || typeof msg.t !== 'string') return;
      if (msg.t === 'welcome') {
        this.clientId = msg.clientId;
      }
      if (msg.t === 'pong') {
        this.lastPongAt = performance.now();
      }
      this._emit(msg.t, msg);
      this._emit('*', msg);
    });
    ws.addEventListener('close', () => {
      this.connected = false;
      if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
      this._emit('close');
      this.ws = null;
      this._scheduleReconnect();
    });
    ws.addEventListener('error', () => {
      try { ws.close(); } catch {}
    });
  }

  _scheduleReconnect() {
    if (!this.shouldReconnect) return;
    const delay = Math.min(this.reconnectMs, RECONNECT_MAX_MS);
    this.reconnectMs = Math.min(this.reconnectMs * 1.8, RECONNECT_MAX_MS);
    setTimeout(() => {
      if (this.shouldReconnect) this._openSocket();
    }, delay);
  }

  _heartbeat() {
    if (!this.connected) return;
    this.send({ t: 'ping', id: Date.now() });
  }

  _sendHello() {
    if (!this.identity) return;
    this.send({
      t: 'hello',
      playerId: this.identity.id,
      playerName: this.identity.name,
      themeColor: this.identity.themeColor,
    });
  }

  send(obj) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try { this.ws.send(JSON.stringify(obj)); return true; }
    catch { return false; }
  }

  _emit(type, payload) {
    this.dispatchEvent(new CustomEvent(type, { detail: payload }));
  }

  on(type, handler) {
    const wrapped = (e) => handler(e.detail);
    this.addEventListener(type, wrapped);
    return () => this.removeEventListener(type, wrapped);
  }
}

function buildWsUrl() {
  const loc = window.location;
  const scheme = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${loc.host}/api/mp`;
}
