import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { GameRoom } from '../site/room.js';

const PROTOCOL = 'ceoisdead-room-v1';

function fakeNetwork() {
  const registry = new Map();
  class Connection extends EventEmitter {
    constructor() { super(); this.open = false; this.closed = false; }
    send(data) {
      if (!this.open) throw new Error('Connection closed');
      const copy = JSON.parse(JSON.stringify(data));
      queueMicrotask(() => { if (!this.other.closed) this.other.emit('data', copy); });
    }
    close() {
      if (this.closed) return;
      this.closed = true;
      this.open = false;
      this.emit('close');
      this.other?.close();
    }
  }
  return class FakePeer extends EventEmitter {
    constructor(id) {
      super();
      this.id = id;
      this.connections = [];
      registry.set(id, this);
      queueMicrotask(() => this.emit('open', id));
    }
    connect(id) {
      const local = new Connection();
      const remote = new Connection();
      local.other = remote;
      remote.other = local;
      this.connections.push(local);
      const host = registry.get(id);
      if (!host) {
        queueMicrotask(() => this.emit('error', { type: 'peer-unavailable' }));
        return local;
      }
      host.connections.push(remote);
      queueMicrotask(() => {
        host.emit('connection', remote);
        local.open = remote.open = true;
        remote.emit('open');
        local.emit('open');
      });
      return local;
    }
    destroy() {
      registry.delete(this.id);
      for (const connection of this.connections) connection.close();
      this.emit('close');
    }
  };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

function pair() {
  const FakePeer = fakeNetwork();
  const common = { loadPeer: async () => FakePeer, getUrl: () => 'https://example.com/game/?theme=night#board' };
  const received = [], actions = [], hostConnections = [], guestConnections = [];
  const host = new GameRoom({ ...common, onAction: action => actions.push(action), onConnected: value => hostConnections.push(value) });
  const guest = new GameRoom({ ...common, onState: state => received.push(state), onConnected: value => guestConnections.push(value) });
  return { host, guest, common, received, actions, hostConnections, guestConnections };
}

test('room invitation preserves app path and handshakes initial host state', async t => {
  const p = pair();
  t.after(() => { p.guest.close(); p.host.close(); });
  const initial = { revision: 0, turn: 0, score: [0, 0] };
  const invitation = await p.host.host(initial);
  const url = new URL(invitation.url);
  assert.equal(url.pathname, '/game/');
  assert.equal(url.searchParams.get('theme'), 'night');
  assert.equal(url.searchParams.get('room'), invitation.roomId);
  assert.equal(url.hash, '#board');
  assert.equal(p.host.connected, false);
  await p.guest.join(invitation.roomId);
  assert.equal(p.host.connected, true);
  assert.equal(p.guest.connected, true);
  assert.deepEqual(p.received, [initial]);
  assert.deepEqual(p.hostConnections, [true]);
  assert.deepEqual(p.guestConnections, [true]);
});

test('guest sends action intent and only host broadcasts state', async t => {
  const p = pair();
  t.after(() => { p.guest.close(); p.host.close(); });
  const initial = { revision: 0, turn: 1 };
  const invitation = await p.host.host(initial);
  await p.guest.join(invitation.roomId);
  assert.equal(p.guest.sendAction('card:1', 0), true);
  await flush();
  assert.deepEqual(p.actions, [{ actionId: 'card:1', revision: 0 }]);
  assert.equal(p.host.sendAction('card:1', 0), false);
  assert.equal(p.guest.broadcast({ revision: 100 }), false);
  p.guest._connection.send({ protocol: PROTOCOL, type: 'state', state: { revision: 100 } });
  p.guest._connection.send({ protocol: PROTOCOL, type: 'action', actionId: 'bad', revision: -1 });
  await flush();
  assert.deepEqual(p.host._state, initial);
  assert.equal(p.actions.length, 1);
  const next = { revision: 1, turn: 0 };
  p.host.broadcast(next);
  await flush();
  assert.deepEqual(p.received.at(-1), next);
});

test('a third player is rejected without replacing the connected guest', async t => {
  const p = pair();
  const extra = new GameRoom(p.common);
  t.after(() => { extra.close(); p.guest.close(); p.host.close(); });
  const invitation = await p.host.host({ revision: 0 });
  await p.guest.join(invitation.roomId);
  await assert.rejects(extra.join(invitation.roomId), /already has two players/);
  assert.equal(p.host.connected, true);
  assert.equal(p.guest.connected, true);
  p.host.broadcast({ revision: 1 });
  await flush();
  assert.equal(p.received.at(-1).revision, 1);
});

test('disconnect pauses both clients and refuses new guest actions', async t => {
  const p = pair();
  t.after(() => { p.guest.close(); p.host.close(); });
  const invitation = await p.host.host({ revision: 0 });
  await p.guest.join(invitation.roomId);
  p.host.close();
  await flush();
  assert.equal(p.host.connected, false);
  assert.equal(p.guest.connected, false);
  assert.equal(p.guest.sendAction('card:1', 0), false);
  assert.equal(p.guestConnections.at(-1), false);
});

test('invalid links and missing hosts fail with actionable messages', async t => {
  const p = pair();
  t.after(() => { p.guest.close(); p.host.close(); });
  await assert.rejects(p.guest.join('invalid'), /valid room/);
  await assert.rejects(p.guest.join('ceoisdead-00000000-0000-0000-0000-000000000000'), /host is not online/);
  assert.equal(p.guest.connected, false);
});

test('rejecting an initial state cannot resurrect a closed room', async t => {
  const p = pair();
  t.after(() => { p.guest.close(); p.host.close(); });
  p.guest.onState = () => p.guest.close();
  const invitation = await p.host.host({ revision: 0 });
  await assert.rejects(p.guest.join(invitation.roomId), /cancelled/);
  await flush();
  assert.equal(p.guest.connected, false);
  assert.equal(p.host.connected, false);
  assert.equal(p.guest._connection, null);
  assert.equal(p.guest._heartbeat, undefined);
  assert.equal(p.guestConnections.includes(true), false);
});
