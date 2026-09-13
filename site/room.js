const PROTOCOL = 'ceoisdead-room-v2';
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

function validCharacter(value) {
  return Number.isInteger(value) && value >= 0 && value < 4;
}

/**
 * Host-star rooms for 2–4 seats. Lobby occupancy is separate from playable state.
 * Guest identity comes only from the host's connection record. Private resume
 * tokens are never included in a public lobby, URL, or game snapshot.
 */
export class GameRoom {
  constructor({
    onState = () => {}, onAction = () => {}, onStatus = () => {},
    onConnected = () => {}, onLobby = () => {}, loadPeer = loadDefaultPeer,
    getUrl = () => globalThis.location.href, timeoutMs = 15000,
  } = {}) {
    Object.assign(this, { onState, onAction, onStatus, onConnected, onLobby });
    this._loadPeer = loadPeer; this._getUrl = getUrl; this._timeoutMs = timeoutMs;
    this._epoch = 0; this._lobbyGeneration = 0; this._connections = new Map();
    this.isHost = false; this.connected = false; this.ready = false;
    this.started = false; this.seat = null; this.lobby = null;
  }

  async host(initialState, { character = 0 } = {}) {
    const state = cloneState(initialState);
    if (!Array.isArray(state.players) || state.players.length < 2 || state.players.length > 4
      || state.revision !== 0) throw new Error('Start a fresh table with two to four players.');
    if (!validCharacter(character)) throw new Error('Choose a character from 0 to 3.');
    this.close();
    const epoch = this._epoch;
    this.isHost = true; this.seat = 0; this._state = state;
    this._seats = state.players.map((p, seat) => ({
      seat, name: p.name, defaultName: seat === 0 ? p.name : 'Player ' + (seat + 1),
      character: seat === 0 ? character : seat % 4, connected: seat === 0, token: null, record: null,
    }));
    this.onStatus('Creating your table…', 'connecting');
    try {
      const peer = await this._openPeer(epoch);
      if (epoch !== this._epoch || !this.isHost || this._peer !== peer) throw new Error('Connection cancelled.');
      this.roomId = peer.id; this.connected = true;
      const url = new URL(this._getUrl()); url.searchParams.set('room', peer.id);
      this._publishLobby();
      if (epoch !== this._epoch || !this.isHost || !this.connected) throw new Error('Connection cancelled.');
      return { roomId: peer.id, url: url.href };
    } catch (error) {
      if (epoch === this._epoch) this._fatal(friendlyError(error).message);
      throw friendlyError(error);
    }
  }

  async join(roomId, { name = '', token = '', character } = {}) {
    if (typeof roomId !== 'string' || !/^ceoisdead-[a-zA-Z0-9-]{20,80}$/.test(roomId)) {
      throw new Error('This invitation link is not a valid room.');
    }
    if (character !== undefined && !validCharacter(character)) throw new Error('Choose a character from 0 to 3.');
    this.close();
    const epoch = this._epoch;
    this.roomId = roomId; this._hello = { name: String(name).trim().slice(0, 24), token: String(token).slice(0, 100) };
    if (character !== undefined) this._hello.character = character;
    this.onStatus('Connecting to the host…', 'connecting');
    try {
      const peer = await this._openPeer(epoch);
      if (epoch !== this._epoch || this._peer !== peer) throw new Error('Connection cancelled.');
      return await new Promise((resolve, reject) => {
        this._joinReady = { resolve, reject };
        this._bind(peer.connect(roomId, { reliable: true, serialization: 'json', metadata: { protocol: PROTOCOL } }), epoch);
      });
    } catch (error) {
      if (epoch === this._epoch) this._fatal(friendlyError(error).message);
      throw friendlyError(error);
    }
  }

  async _openPeer(epoch) {
    let loadTimer, Peer;
    try {
      Peer = await Promise.race([this._loadPeer(), new Promise((_, reject) => {
        loadTimer = setTimeout(() => reject(new Error('Online play could not load. Check your connection; local play still works.')), this._timeoutMs);
      })]);
    } finally { clearTimeout(loadTimer); }
    if (epoch !== this._epoch) throw new Error('Connection cancelled.');
    const peer = new Peer(newId(), { secure: true, debug: 0 });
    this._peer = peer;
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = error => {
        if (settled) return; settled = true; clearTimeout(timer); this._openReject = null;
        error ? reject(error) : resolve(peer);
      };
      const timer = setTimeout(() => finish(new Error('The room service did not respond. Please try again.')), this._timeoutMs);
      this._openReject = finish;
      peer.on('open', () => {
        if (epoch !== this._epoch) return;
        this._heartbeat = setInterval(() => {
          for (const record of [...this._connections.values()]) {
            if (!record.joined) continue;
            if (Date.now() - record.lastSeen > 20000) this._disconnect(record, 'A player stopped responding. Refresh their tab to rejoin.');
            else this._send(record, { type: 'ping' });
          }
        }, 5000);
        this._heartbeat.unref?.(); finish();
      });
      peer.on('connection', connection => {
        if (epoch !== this._epoch || !this.isHost || this._connections.size >= 6) {
          connection.on('error', () => {}); connection.close(); return;
        }
        this._bind(connection, epoch);
      });
      peer.on('error', error => {
        if (epoch !== this._epoch) return;
        finish(friendlyError(error)); this._fatal(friendlyError(error).message);
      });
      for (const event of ['disconnected', 'close']) peer.on(event, () => {
        if (epoch !== this._epoch) return;
        const message = 'The host connection closed. Keep the host tab open; guests can refresh to rejoin while the host is online.';
        finish(new Error(message)); this._fatal(message);
      });
    });
  }

  _bind(connection, epoch) {
    const record = { connection, epoch, seat: null, joined: false, lastSeen: Date.now() };
    this._connections.set(connection, record);
    record.timer = setTimeout(() => this._disconnect(record, 'Could not reach the table. Keep the host tab open or try another network.'), this._timeoutMs);
    connection.on('open', () => {
      if (!this._current(record)) return;
      if (!this.isHost) this._send(record, { type: 'hello', ...this._hello });
    });
    connection.on('data', packet => { if (this._current(record)) this._receive(record, packet); });
    connection.on('close', () => this._disconnect(record, 'A player disconnected. The match is paused until they rejoin.'));
    connection.on('error', error => this._disconnect(record, friendlyError(error).message));
  }

  _current(record) { return record.epoch === this._epoch && this._connections.get(record.connection) === record; }
  _send(record, packet) {
    if (!this._current(record) || !record.connection.open) return false;
    try { record.connection.send({ ...packet, protocol: PROTOCOL, roomId: this.roomId }); return true; }
    catch { this._disconnect(record, 'A connection interrupted the move. The match is paused.'); return false; }
  }
  _reject(record, message) {
    if (record.rejected) return;
    record.rejected = true;
    this._send(record, { type: 'reject', message });
    clearTimeout(record.timer);
    record.timer = setTimeout(() => this._disconnect(record, message), 200);
  }

  _receive(record, packet) {
    if (record.rejected) return;
    if (!packet || typeof packet !== 'object' || Array.isArray(packet)) return;
    if (packet.protocol !== PROTOCOL) {
      if (this.isHost && packet.type === 'hello') this._reject(record, 'This table uses a newer version. Refresh the game and try again.');
      return;
    }
    if (packet.roomId !== this.roomId) return;
    record.lastSeen = Date.now();
    if (packet.type === 'reject' && !this.isHost) {
      this._fatal(typeof packet.message === 'string' ? packet.message.slice(0, 240) : 'This table is unavailable.'); return;
    }
    if (packet.type === 'hello' && this.isHost && !record.joined) {
      if (typeof packet.name !== 'string' || packet.name.length > 24 || typeof packet.token !== 'string' || packet.token.length > 100) return;
      if (Object.hasOwn(packet, 'character') && !validCharacter(packet.character)) {
        this._reject(record, 'Choose a character from 0 to 3.'); return;
      }
      let seat = packet.token ? this._seats.find(s => s.token === packet.token) : null;
      const resuming = Boolean(seat);
      if (seat?.connected) { this._reject(record, 'Your seat is already connected in another tab.'); return; }
      if (!seat && this.started) { this._reject(record, 'This match has started. Only its original players can rejoin their reserved seats.'); return; }
      seat ??= this._seats.find(s => s.seat > 0 && !s.connected);
      if (!seat) { this._reject(record, 'This table is full. Ask the host to create a larger table.'); return; }
      if (!resuming) {
        seat.token = newId(); seat.name = seat.defaultName;
        seat.character = packet.character ?? seat.seat % 4;
      }
      if (!this.started && packet.name.trim()) seat.name = packet.name.trim();
      seat.connected = true; seat.record = record;
      record.seat = seat.seat; record.joined = true; clearTimeout(record.timer);
      this._syncNames();
      this._send(record, { type: 'welcome', seat: seat.seat, token: seat.token, state: this._state, lobby: this._publicLobby() });
      if (this._current(record)) this._publishLobby();
      return;
    }
    if (packet.type === 'welcome' && !this.isHost && !record.joined) {
      const lobby = this._validateLobby(packet.lobby);
      if (!lobby || !Number.isInteger(packet.seat) || packet.seat < 1 || packet.seat >= lobby.capacity
        || typeof packet.token !== 'string' || !/^ceoisdead-[a-zA-Z0-9-]{20,80}$/.test(packet.token)) {
        this._fatal('The host sent invalid seat information.'); return;
      }
      let state;
      try { state = cloneState(packet.state); } catch { this._fatal('The host sent an invalid game state.'); return; }
      if (state.players?.length !== lobby.capacity) { this._fatal('The table size does not match the game.'); return; }
      this.seat = packet.seat; this.resumeToken = packet.token; this.connected = true;
      record.joined = true; clearTimeout(record.timer);
      this.onState(state);
      if (!this._current(record) || !this.connected) return;
      this._applyLobby(lobby);
      if (!this._current(record) || !this.connected) return;
      const pending = this._joinReady; this._joinReady = null;
      pending?.resolve({ seat: this.seat, token: this.resumeToken });
      return;
    }
    if (!record.joined) return;
    if (packet.type === 'ping') { this._send(record, { type: 'pong' }); return; }
    if (packet.type === 'pong') return;
    if (packet.type === 'state' && !this.isHost) {
      try {
        const state = cloneState(packet.state);
        if (state.players?.length !== this.lobby?.capacity) throw new Error('Table size changed.');
        this.onState(state);
      } catch { this._fatal('The host sent an invalid game state.'); }
      return;
    }
    if (packet.type === 'lobby' && !this.isHost) {
      const lobby = this._validateLobby(packet.lobby);
      if (!lobby || lobby.capacity !== this.lobby?.capacity || (this.started && (!lobby.started
        || lobby.seats.some((s, i) => s.character !== this.lobby.seats[i].character)))) {
        this._fatal('The host sent invalid lobby information.'); return;
      }
      this._applyLobby(lobby); return;
    }
    if (packet.type === 'name' && this.isHost && !this.started
      && typeof packet.name === 'string' && packet.name.trim().length > 0 && packet.name.length <= 24) {
      this._seats[record.seat].name = packet.name.trim(); this._syncNames(); this._publishLobby(); return;
    }
    if (packet.type === 'character' && this.isHost && !this.started && validCharacter(packet.character)) {
      this._seats[record.seat].character = packet.character; this._publishLobby(); return;
    }
    if (packet.type === 'action' && this.isHost && this.ready
      && record.seat === this._state.activePlayer
      && typeof packet.actionId === 'string' && packet.actionId.length <= 160
      && Number.isSafeInteger(packet.revision) && packet.revision >= 0) {
      if (packet.revision !== this._state.revision) { this._send(record, { type: 'state', state: this._state }); return; }
      this.onAction({ actionId: packet.actionId, revision: packet.revision, seat: record.seat });
    }
  }

  _syncNames() {
    this._state.players = this._state.players.map((p, i) => ({ ...p, name: this._seats[i].name }));
  }
  _publicLobby() {
    return { capacity: this._seats.length, started: this.started,
      seats: this._seats.map(({ seat, name, connected, character }) => ({ seat, name, connected, character })) };
  }
  _validateLobby(value) {
    if (!value || typeof value !== 'object' || !Number.isInteger(value.capacity) || value.capacity < 2 || value.capacity > 4
      || typeof value.started !== 'boolean' || !Array.isArray(value.seats) || value.seats.length !== value.capacity) return null;
    if (value.seats.some((s, i) => !s || s.seat !== i || typeof s.name !== 'string' || !s.name.trim() || s.name.length > 40
      || typeof s.connected !== 'boolean' || (Object.hasOwn(s, 'character') && !validCharacter(s.character)))) return null;
    return { capacity: value.capacity, started: value.started,
      seats: value.seats.map(({ seat, name, connected, character = seat % 4 }) => ({ seat, name, connected, character })) };
  }
  _applyLobby(lobby) {
    const epoch = this._epoch, generation = this._lobbyGeneration;
    this.lobby = lobby; this.started = lobby.started;
    this.ready = this.connected && this.started && lobby.seats.every(s => s.connected);
    this.onLobby(cloneState(lobby));
    if (epoch !== this._epoch || generation !== this._lobbyGeneration) return;
    const count = lobby.seats.filter(s => s.connected).length;
    this.onStatus(this.ready ? 'Everyone is connected. The table is live.'
      : this.started ? 'The match is paused. Waiting for a disconnected player to rejoin.'
      : count === lobby.capacity ? 'Everyone is here. The host can start the game.'
      : count + ' of ' + lobby.capacity + ' seats filled. Share the invitation link.', this.ready ? 'connected' : 'waiting');
    if (epoch !== this._epoch || generation !== this._lobbyGeneration) return;
    if (this._reportedReady !== this.ready) {
      this._reportedReady = this.ready; this.onConnected(this.ready);
    }
  }
  _publishLobby() {
    const epoch = this._epoch, generation = ++this._lobbyGeneration, lobby = this._publicLobby();
    const current = () => epoch === this._epoch && generation === this._lobbyGeneration;
    this._applyLobby(lobby);
    if (!current()) return;
    for (const record of [...this._connections.values()]) if (record.joined) {
      this._send(record, { type: 'lobby', lobby });
      if (!current()) return;
      this._send(record, { type: 'state', state: this._state });
      if (!current()) return;
    }
  }

  start() {
    if (!this.isHost || this.started || !this.connected || !this._seats.every(s => s.connected)) return false;
    this.started = true; this._publishLobby(); return true;
  }
  rename(name) {
    if (!this.connected || this.started || typeof name !== 'string' || !name.trim() || name.length > 24) return false;
    if (this.isHost) {
      this._seats[0].name = name.trim(); this._syncNames(); this._publishLobby(); return true;
    }
    const record = [...this._connections.values()][0];
    return record ? this._send(record, { type: 'name', name: name.trim() }) : false;
  }
  chooseCharacter(character) {
    if (!this.connected || this.started || !validCharacter(character)) return false;
    if (this.isHost) {
      this._seats[0].character = character; this._publishLobby(); return true;
    }
    const record = [...this._connections.values()][0];
    return record ? this._send(record, { type: 'character', character }) : false;
  }
  broadcast(state) {
    if (!this.isHost) return false;
    const snapshot = cloneState(state);
    if (snapshot.players?.length !== this._seats.length) return false;
    this._state = snapshot;
    for (const record of this._connections.values()) if (record.joined) this._send(record, { type: 'state', state: this._state });
    return true;
  }
  sendAction(actionId, revision) {
    if (this.isHost || !this.ready || typeof actionId !== 'string' || actionId.length > 160
      || !Number.isSafeInteger(revision) || revision < 0) return false;
    const record = [...this._connections.values()][0];
    return record ? this._send(record, { type: 'action', actionId, revision }) : false;
  }

  _disconnect(record, message) {
    if (!this._current(record)) return;
    this._connections.delete(record.connection); clearTimeout(record.timer);
    if (this.isHost) {
      if (record.joined && this._seats[record.seat]?.record === record) {
        const seat = this._seats[record.seat];
        seat.connected = false; seat.record = null;
        // Keep cosmetic identity for a token-based refresh. An unclaimed lobby
        // seat remains available, and a replacement receives a fresh token.
      }
      record.connection.close();
      if (record.joined) this._publishLobby();
    } else {
      record.connection.close(); this._fatal(message);
    }
  }
  _fatal(message) {
    const pending = this._joinReady; this._joinReady = null;
    pending?.reject(new Error(message));
    this.close(); this.onStatus(message, 'error');
  }
  close() {
    this._epoch++;
    const wasReady = this.ready;
    this.ready = false; this.connected = false; this.isHost = false; this.started = false;
    this._reportedReady = false;
    clearInterval(this._heartbeat); this._heartbeat = undefined;
    this._openReject?.(new Error('Connection cancelled.')); this._openReject = null;
    this._joinReady?.reject(new Error('Connection cancelled.')); this._joinReady = null;
    for (const record of this._connections.values()) { clearTimeout(record.timer); record.connection.close(); }
    this._connections.clear();
    this._peer?.destroy(); this._peer = null;
    this._state = null; this._seats = []; this.lobby = null; this.seat = null;
    this.resumeToken = null; this.roomId = null;
    if (wasReady) this.onConnected(false);
  }
}
