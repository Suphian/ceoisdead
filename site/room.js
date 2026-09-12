const PROTOCOL = 'ceoisdead-room-v1';
const PEER_MODULE = 'https://esm.sh/peerjs@1.5.5?bundle';
let peerModulePromise;

async function loadDefaultPeer() {
  peerModulePromise ??= import(PEER_MODULE).catch(error => {
    peerModulePromise = null;
    throw error;
  });
  const module = await peerModulePromise;
  return module.Peer || module.default;
}

function newId() {
  if (!globalThis.crypto?.getRandomValues) throw new Error('Online rooms need HTTPS or localhost in a modern browser.');
  const random = globalThis.crypto.randomUUID?.()
    || Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
  return 'ceoisdead-' + random;
}

function friendlyError(error) {
  const messages = {
    'peer-unavailable': 'The host is not online. Ask them to open the room again.',
    'browser-incompatible': 'This browser cannot make an online connection. Try a current desktop browser.',
    'unavailable-id': 'That room could not be created. Please try again.',
    'network': 'The room service could not be reached. Check your connection and try again.',
    'server-error': 'The room service is unavailable. Local play still works.',
    'socket-error': 'The room service connection failed. Please try again.',
    'socket-closed': 'The room service disconnected. The game is paused.',
    'webrtc': 'A direct connection could not be made. Try another network or local play.',
  };
  return new Error(messages[error?.type] || error?.message || 'Could not connect. Try another network or local play.');
}

function cloneState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('A game state object is required.');
  const json = JSON.stringify(state);
  if (json.length > 262144) throw new Error('The game state is too large to share.');
  return JSON.parse(json);
}

/**
 * Casual two-player transport. The host application must validate every action
 * against the current engine state, revision, and guest player assignment.
 * onStatus(message, kind), onConnected(boolean), onState(state),
 * onAction({ actionId, revision }). No game state is stored on a server.
 */
export class GameRoom {
  constructor({
    onState = () => {}, onAction = () => {}, onStatus = () => {},
    onConnected = () => {}, loadPeer = loadDefaultPeer,
    getUrl = () => globalThis.location.href, timeoutMs = 15000,
  } = {}) {
    Object.assign(this, { onState, onAction, onStatus, onConnected });
    this._loadPeer = loadPeer;
    this._getUrl = getUrl;
    this._timeoutMs = timeoutMs;
    this._epoch = 0;
    this.isHost = false;
    this.connected = false;
  }

  async host(initialState) {
    const state = cloneState(initialState);
    this.close();
    const epoch = this._epoch;
    this.isHost = true;
    this._state = state;
    this.onStatus('Creating a room…', 'connecting');
    try {
      const peer = await this._openPeer(epoch);
      const url = new URL(this._getUrl());
      url.searchParams.set('room', peer.id);
      this.onStatus('Room ready. Share the link and keep this tab open.', 'waiting');
      return { roomId: peer.id, url: url.href };
    } catch (error) {
      if (epoch === this._epoch) {
        this.close();
        this.onStatus(friendlyError(error).message, 'error');
      }
      throw friendlyError(error);
    }
  }

  async join(roomId) {
    if (typeof roomId !== 'string' || !/^ceoisdead-[a-zA-Z0-9-]{20,80}$/.test(roomId)) {
      throw new Error('This invitation link is not a valid room.');
    }
    this.close();
    const epoch = this._epoch;
    this.onStatus('Connecting to the host…', 'connecting');
    try {
      const peer = await this._openPeer(epoch);
      await new Promise((resolve, reject) => {
        this._joinReady = { resolve, reject };
        this._bind(peer.connect(roomId, { reliable: true, serialization: 'json', metadata: { protocol: PROTOCOL } }), epoch);
      });
    } catch (error) {
      if (epoch === this._epoch) {
        this.close();
        this.onStatus(friendlyError(error).message, 'error');
      }
      throw friendlyError(error);
    }
  }

  async _openPeer(epoch) {
    let loadTimer;
    let Peer;
    try {
      Peer = await Promise.race([
        this._loadPeer(),
        new Promise((_, reject) => {
          loadTimer = setTimeout(() => reject(new Error('Online play could not load. Check your connection; local play still works.')), this._timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(loadTimer);
    }
    if (epoch !== this._epoch) throw new Error('Connection cancelled.');
    const peer = new Peer(newId(), { secure: true, debug: 0 });
    this._peer = peer;

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this._openReject = null;
        if (error) reject(error);
        else resolve(peer);
      };
      const timer = setTimeout(() => finish(new Error('The room service did not respond. Please try again.')), this._timeoutMs);
      this._openReject = finish;
      peer.on('open', () => {
        if (epoch === this._epoch) finish();
      });
      peer.on('connection', connection => {
        if (epoch !== this._epoch) { connection.close(); return; }
        if (!this.isHost || this._connection) {
          connection.on('error', () => {});
          connection.on('open', () => {
            connection.send({ protocol: PROTOCOL, type: 'reject', message: 'This room already has two players.' });
            setTimeout(() => connection.close(), 200);
          });
          return;
        }
        this._bind(connection, epoch);
      });
      peer.on('error', error => {
        if (epoch !== this._epoch) return;
        finish(friendlyError(error));
        this._drop(friendlyError(error).message);
      });
      for (const event of ['disconnected', 'close']) {
        peer.on(event, () => {
          if (epoch !== this._epoch) return;
          const message = 'Connection lost. The game is paused. Ask the host to create a new room.';
          finish(new Error(message));
          this._drop(message);
        });
      }
    });
  }

  _bind(connection, epoch) {
    this._connection = connection;
    this._handshakeTimer = setTimeout(() => {
      if (this._connection === connection) this._drop('Could not reach the other player. Keep the host tab open or try another network.');
    }, this._timeoutMs);
    connection.on('open', () => {
      if (this._epoch !== epoch || this._connection !== connection) return;
      if (!this.isHost) this._send({ type: 'hello' });
    });
    connection.on('data', packet => {
      if (this._epoch !== epoch || this._connection !== connection) return;
      this._receive(packet);
    });
    connection.on('close', () => {
      if (this._epoch === epoch && this._connection === connection) this._drop('The other player disconnected. The game is paused.');
    });
    connection.on('error', error => {
      if (this._epoch === epoch && this._connection === connection) this._drop(friendlyError(error).message);
    });
  }

  _receive(packet) {
    if (!packet || typeof packet !== 'object' || packet.protocol !== PROTOCOL) return;
    this._lastSeen = Date.now();
    if (packet.type === 'reject' && !this.isHost) {
      this._drop('This room already has two players. Ask the host for a new invitation.');
      return;
    }
    if (packet.type === 'hello' && this.isHost && !this.connected) {
      this._setConnected();
      this._send({ type: 'state', state: this._state });
      return;
    }
    if (packet.type === 'state' && !this.isHost) {
      let state;
      try { state = cloneState(packet.state); } catch { this._drop('The host sent an invalid game state.'); return; }
      const firstState = !this.connected;
      const epoch = this._epoch;
      const connection = this._connection;
      // The application may reject a malformed state and close this room.
      this.connected = true;
      this.onState(state);
      if (epoch !== this._epoch || connection !== this._connection || !this.connected) return;
      if (firstState) this._setConnected();
      const ready = this._joinReady;
      this._joinReady = null;
      ready?.resolve();
      return;
    }
    if (!this.connected) return;
    if (packet.type === 'ping') { this._send({ type: 'pong' }); return; }
    if (packet.type === 'pong') return;
    if (packet.type === 'action' && this.isHost
      && typeof packet.actionId === 'string' && packet.actionId.length <= 160
      && Number.isSafeInteger(packet.revision) && packet.revision >= 0) {
      this.onAction({ actionId: packet.actionId, revision: packet.revision });
    }
  }

  _setConnected() {
    this.connected = true;
    clearTimeout(this._handshakeTimer);
    clearInterval(this._heartbeat);
    this._lastSeen = Date.now();
    this._heartbeat = setInterval(() => {
      if (Date.now() - this._lastSeen > 20000) this._drop('The other player stopped responding. The game is paused.');
      else this._send({ type: 'ping' });
    }, 5000);
    this._heartbeat.unref?.();
    this.onStatus(this.isHost ? 'Your friend joined. You are player one.' : 'Connected. You are player two.', 'connected');
    this.onConnected(true);
  }

  _send(packet) {
    if (!this._connection?.open) return false;
    try {
      this._connection.send({ ...packet, protocol: PROTOCOL });
      return true;
    } catch {
      this._drop('The connection interrupted your move. The game is paused.');
      return false;
    }
  }

  broadcast(state) {
    if (!this.isHost) return false;
    this._state = cloneState(state);
    return this.connected ? this._send({ type: 'state', state: this._state }) : false;
  }

  sendAction(actionId, revision) {
    if (this.isHost || !this.connected || typeof actionId !== 'string'
      || actionId.length > 160 || !Number.isSafeInteger(revision) || revision < 0) return false;
    return this._send({ type: 'action', actionId, revision });
  }

  _drop(message) {
    clearTimeout(this._handshakeTimer);
    clearInterval(this._heartbeat);
    const connection = this._connection;
    this._connection = null;
    this.connected = false;
    const ready = this._joinReady;
    this._joinReady = null;
    connection?.close();
    ready?.reject(new Error(message));
    this.onStatus(message, 'disconnected');
    this.onConnected(false);
  }

  close() {
    this._epoch += 1;
    const wasConnected = this.connected;
    this.connected = false;
    this.isHost = false;
    clearTimeout(this._handshakeTimer);
    clearInterval(this._heartbeat);
    this._openReject?.(new Error('Connection cancelled.'));
    this._openReject = null;
    this._joinReady?.reject(new Error('Connection cancelled.'));
    this._joinReady = null;
    this._connection?.close();
    this._connection = null;
    this._peer?.destroy();
    this._peer = null;
    this._state = null;
    if (wasConnected) this.onConnected(false);
  }
}
