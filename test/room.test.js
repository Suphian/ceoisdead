import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { GameRoom } from '../site/room.js';

import { createGame, applyAction, getLegalActions } from '../site/game/engine.js';
const PROTOCOL = 'ceoisdead-room-v2';

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

function table(count = 2) {
  const FakePeer = fakeNetwork();
  const common = { loadPeer: async () => FakePeer, getUrl: () => 'https://example.com/game/?theme=night#board' };
  const received = Array.from({ length: count - 1 }, () => []);
  const actions = [], readiness = Array.from({ length: count }, () => []);
  let state = createGame({ seed: 'room', players: ['Ada', 'Grace', 'Linus', 'Margaret'].slice(0, count) });
  const host = new GameRoom({ ...common, onConnected: value => readiness[0].push(value), onAction: action => {
    actions.push(action); state = applyAction(state, action.actionId); host.broadcast(state);
  } });
  const guests = received.map((list, i) => new GameRoom({ ...common, onState: s => list.push(s), onConnected: value => readiness[i + 1].push(value) }));
  return { host, guests, common, received, actions, readiness, get state() { return state; },
    advance() { state = applyAction(state, getLegalActions(state)[0]); host.broadcast(state); },
    close() { guests.forEach(g => g.close()); host.close(); } };
}
const wire = (guest, packet) => [...guest._connections.values()][0].connection.send({ protocol: PROTOCOL, roomId: guest.roomId, ...packet });

test('invitation preserves path and seats wait in the lobby until the host starts', async t => {
  const p = table(); t.after(() => p.close());
  const invitation = await p.host.host(p.state), url = new URL(invitation.url);
  assert.equal(url.pathname, '/game/'); assert.equal(url.searchParams.get('theme'), 'night'); assert.equal(url.hash, '#board');
  assert.equal(url.searchParams.get('room'), invitation.roomId);
  const membership = await p.guests[0].join(invitation.roomId, { name: 'Grace' });
  assert.equal(membership.seat, 1); assert.ok(membership.token);
  assert.equal(p.host.ready, false); assert.equal(p.guests[0].ready, false);
  assert.equal(p.guests[0].sendAction('0/pass', 0), false);
  assert.equal(p.guests[0].start(), false);
  assert.deepEqual(p.received[0][0], p.state);
  assert.equal(p.host.start(), true); await flush();
  assert.equal(p.host.ready, true); assert.equal(p.guests[0].ready, true);
});

for (const count of [3, 4]) test(count + ' seats join concurrently and pass through a full turn cycle', async t => {
  const p = table(count); t.after(() => p.close());
  const invitation = await p.host.host(p.state);
  const memberships = await Promise.all(p.guests.map((g, i) => g.join(invitation.roomId, { name: 'Rival ' + (i + 1) })));
  assert.deepEqual(memberships.map(m => m.seat).sort(), Array.from({length:count-1},(_,i)=>i+1));
  assert.equal(new Set(memberships.map(m => m.token)).size, count - 1);
  assert.equal(p.host.lobby.seats.filter(s => s.connected).length, count);
  const publicInfo = JSON.stringify(p.host.lobby);
  for (const member of memberships) assert.equal(publicInfo.includes(member.token), false);
  assert.equal(p.host.start(), true); await flush(); p.advance(); await flush();
  for (let seat = 1; seat < count; seat++) {
    const guest = p.guests.find(g => g.seat === seat);
    assert.equal(guest.sendAction(p.state.revision + '/pass', p.state.revision), true);
    await flush();
  }
  assert.equal(p.state.round, 1); assert.equal(p.state.activePlayer, 0);
  assert.deepEqual(p.actions.map(a => a.seat), Array.from({length:count-1},(_,i)=>i+1));
  for (const list of p.received) assert.equal(list.at(-1).revision, count);
});

test('wrong-seat, stale, duplicate, forged-state, and different-room packets cannot advance the game', async t => {
  const p = table(3); t.after(() => p.close());
  const invitation = await p.host.host(p.state);
  await Promise.all(p.guests.map(g => g.join(invitation.roomId)));
  p.host.start(); await flush();
  wire(p.guests[1], { type: 'action', seat: 0, actionId: '0/pass', revision: 0 });
  wire(p.guests[0], { type: 'start' });
  wire(p.guests[0], { type: 'state', state: { revision: 99 } });
  await flush(); assert.equal(p.state.revision, 0); assert.equal(p.host.broadcast(p.state), true);
  p.advance(); await flush();
  wire(p.guests[0], { type: 'action', seat: 0, actionId: '1/pass', revision: 1, roomId: 'another-room' });
  wire(p.guests[0], { type: 'action', actionId: '0/pass', revision: 0 });
  wire(p.guests[1], { type: 'action', seat: 1, actionId: '1/pass', revision: 1 });
  await flush(); assert.equal(p.actions.length, 0);
  wire(p.guests[0], { type: 'action', actionId: '1/pass', revision: 1, seat: 99 });
  wire(p.guests[0], { type: 'action', actionId: '1/pass', revision: 1 });
  await flush(); assert.equal(p.actions.length, 1); assert.equal(p.actions[0].seat, 1); assert.equal(p.state.revision, 2);
  assert.equal(p.guests[0].broadcast(p.state), false);
});

test('a full lobby rejects an extra player without replacing anyone', async t => {
  const p = table(4), extra = new GameRoom(p.common); t.after(() => { extra.close(); p.close(); });
  const invitation = await p.host.host(p.state);
  await Promise.all(p.guests.map(g => g.join(invitation.roomId)));
  await assert.rejects(extra.join(invitation.roomId), /full/);
  assert.equal(p.host.lobby.seats.filter(s => s.connected).length, 4);
  assert.equal(p.host.start(), true);
});

test('a disconnected lobby seat becomes available before the match starts', async t => {
  const p = table(3), replacement = new GameRoom(p.common); t.after(() => { replacement.close(); p.close(); });
  const invitation = await p.host.host(p.state);
  assert.equal(p.host.start(), false);
  await p.guests[0].join(invitation.roomId); p.guests[0].close(); await flush();
  assert.equal(p.host.lobby.seats[1].connected, false);
  const member = await replacement.join(invitation.roomId);
  assert.equal(member.seat, 1); assert.equal(p.host.ready, false);
});

test('disconnect pauses every player; only the original token can resume a frozen seat', async t => {
  const p = table(4), stranger = new GameRoom(p.common), returning = new GameRoom(p.common);
  t.after(() => { stranger.close(); returning.close(); p.close(); });
  const invitation = await p.host.host(p.state);
  const membership = await p.guests[0].join(invitation.roomId, { name: 'Original' });
  await Promise.all(p.guests.slice(1).map(g => g.join(invitation.roomId)));
  p.host.start(); await flush(); p.advance(); await flush();
  const oldRecord = [...p.host._connections.values()].find(r => r.seat === membership.seat);
  p.guests[0].close(); await flush();
  assert.equal(p.host.ready, false); assert.ok(p.guests.slice(1).every(g => !g.ready));
  assert.equal(p.guests[1].sendAction('1/pass', 1), false);
  await assert.rejects(stranger.join(invitation.roomId, { name: 'Original', token: 'wrong-token' }), /original players/);
  const rejoined = await returning.join(invitation.roomId, { token: membership.token, name: 'Impostor rename' });
  await flush();
  assert.equal(rejoined.seat, membership.seat); assert.equal(rejoined.token, membership.token);
  assert.equal(p.host.lobby.seats[membership.seat].name, 'Original');
  assert.equal(p.host.ready, true); assert.ok(p.guests.slice(1).every(g => g.ready)); assert.equal(returning.ready, true);
  p.host._disconnect(oldRecord, 'Old callback'); assert.equal(p.host.ready, true);
  assert.equal(returning.sendAction('1/pass', 1), true); await flush(); assert.equal(p.state.revision, 2);
});

test('duplicate active token cannot evict the player who owns the seat', async t => {
  const p = table(), duplicate = new GameRoom(p.common); t.after(() => { duplicate.close(); p.close(); });
  const invitation = await p.host.host(p.state), member = await p.guests[0].join(invitation.roomId);
  p.host.start(); await flush();
  await assert.rejects(duplicate.join(invitation.roomId, { token: member.token }), /already connected/);
  assert.equal(p.guests[0].ready, true); assert.equal(p.host.ready, true);
});

test('names can change in the lobby, then freeze when the host starts', async t => {
  const p = table(); t.after(() => p.close());
  const invitation = await p.host.host(p.state);
  await p.guests[0].join(invitation.roomId);
  assert.equal(p.guests[0].rename('Grace Hopper'), true); await flush();
  assert.equal(p.host.lobby.seats[1].name, 'Grace Hopper');
  assert.equal(p.received[0].at(-1).players[1].name, 'Grace Hopper');
  assert.equal(p.host.rename('Ada Lovelace'), true); await flush();
  assert.equal(p.guests[0].lobby.seats[0].name, 'Ada Lovelace');
  p.host.start(); await flush(); assert.equal(p.guests[0].rename('New name'), false);
});

test('character choices are public cosmetics, allow duplicates, and propagate before start', async t => {
  const p = table(3); t.after(() => p.close());
  const invitation = await p.host.host(p.state, { character: 3 });
  await p.guests[0].join(invitation.roomId, { name: 'Grace', character: 3 });
  await p.guests[1].join(invitation.roomId);
  await flush();
  assert.deepEqual(p.host.lobby.seats.map(s => s.character), [3, 3, 2]);
  assert.equal(p.host.lobby.seats[2].name, 'Player 3');
  assert.equal(p.host.chooseCharacter(1), true);
  assert.equal(p.guests[0].chooseCharacter(1), true);
  await flush();
  for (const room of [p.host, ...p.guests]) assert.deepEqual(room.lobby.seats.map(s => s.character), [1, 1, 2]);
  assert.equal(p.host._state.revision, 0);
  assert.deepEqual(p.host._state.regions, p.state.regions);
  assert.ok(p.received.flat().every(state => state.players.every(player => !Object.hasOwn(player, 'character'))));
  assert.ok(p.host.lobby.seats.every(seat => !Object.hasOwn(seat, 'token')));
});

test('invalid characters and forged seat IDs cannot change another player or a frozen choice', async t => {
  const p = table(3); t.after(() => p.close());
  const invitation = await p.host.host(p.state);
  await Promise.all(p.guests.map(g => g.join(invitation.roomId)));
  for (const character of [-1, 4, 1.5, '1', null, {}, []]) {
    assert.equal(p.host.chooseCharacter(character), false);
    assert.equal(p.guests[0].chooseCharacter(character), false);
    wire(p.guests[0], { type: 'character', character, seat: 0 });
  }
  await flush();
  assert.deepEqual(p.host.lobby.seats.map(s => s.character), [0, 1, 2]);
  wire(p.guests[0], { type: 'character', character: 3, seat: 2 });
  wire(p.guests[1], { type: 'character', character: 0, roomId: 'another-room' });
  wire(p.guests[0], { type: 'lobby', lobby: { capacity: 3, started: false, seats: [] } });
  await flush();
  assert.deepEqual(p.host.lobby.seats.map(s => s.character), [0, 3, 2]);
  p.host.start(); await flush();
  assert.equal(p.host.chooseCharacter(2), false);
  assert.equal(p.guests[0].chooseCharacter(2), false);
  wire(p.guests[0], { type: 'character', character: 2 });
  await flush();
  assert.deepEqual(p.host.lobby.seats.map(s => s.character), [0, 3, 2]);
});

test('invalid host and join preferences reject without closing an existing room', async t => {
  const p = table(); t.after(() => p.close());
  const invitation = await p.host.host(p.state);
  await p.guests[0].join(invitation.roomId);
  for (const character of [-1, 4, 1.5, '1', null]) {
    await assert.rejects(p.host.host(p.state, { character }), /character/);
    await assert.rejects(p.guests[0].join(invitation.roomId, { character }), /character/);
  }
  assert.equal(p.host.connected, true); assert.equal(p.guests[0].connected, true);
});

test('token-based lobby refresh preserves character while a replacement gets a fresh identity', async t => {
  const p = table(), returning = new GameRoom(p.common), replacement = new GameRoom(p.common);
  t.after(() => { returning.close(); replacement.close(); p.close(); });
  const invitation = await p.host.host(p.state);
  const first = await p.guests[0].join(invitation.roomId, { name: 'Original', character: 3 });
  p.guests[0].close(); await flush();
  const resumed = await returning.join(invitation.roomId, { token: first.token, character: 0 });
  assert.equal(resumed.seat, first.seat); assert.equal(resumed.token, first.token);
  assert.equal(returning.lobby.seats[first.seat].character, 3);
  assert.equal(returning.lobby.seats[first.seat].name, 'Original');
  returning.close(); await flush();
  const fresh = await replacement.join(invitation.roomId);
  assert.equal(fresh.seat, first.seat); assert.notEqual(fresh.token, first.token);
  assert.equal(p.host.lobby.seats[first.seat].character, 1);
  assert.equal(p.host.lobby.seats[first.seat].name, 'Player 2');
  p.host.start(); await flush(); replacement.close(); await flush();
  await assert.rejects(returning.join(invitation.roomId, { token: first.token }), /original players/);
});

test('a started seat keeps its character when the original guest rejoins', async t => {
  const p = table(), returning = new GameRoom(p.common); t.after(() => { returning.close(); p.close(); });
  const invitation = await p.host.host(p.state, { character: 2 });
  const member = await p.guests[0].join(invitation.roomId, { character: 3 });
  p.host.start(); await flush(); p.guests[0].close(); await flush();
  await returning.join(invitation.roomId, { token: member.token, character: 0 }); await flush();
  assert.deepEqual(returning.lobby.seats.map(s => s.character), [2, 3]);
  assert.equal(returning.ready, true);
  assert.equal(returning.chooseCharacter(1), false);
});

test('legacy lobby packets without characters receive seat defaults', async t => {
  const p = table(4); t.after(() => p.close());
  const publicLobby = p.host._publicLobby.bind(p.host);
  p.host._publicLobby = () => {
    const lobby = publicLobby();
    lobby.seats.forEach(seat => delete seat.character);
    return lobby;
  };
  const invitation = await p.host.host(p.state);
  await Promise.all(p.guests.map(g => g.join(invitation.roomId))); await flush();
  for (const guest of p.guests) assert.deepEqual(guest.lobby.seats.map(s => s.character), [0, 1, 2, 3]);
  p.host.start(); await flush();
  assert.ok(p.guests.every(guest => guest.ready));
});

test('an invalid character in the hello packet is rejected before claiming a seat', async t => {
  const p = table(); t.after(() => p.close());
  const invitation = await p.host.host(p.state), guest = p.guests[0];
  const send = guest._send.bind(guest);
  guest._send = (record, packet) => send(record, packet.type === 'hello' ? { ...packet, character: '2' } : packet);
  await assert.rejects(guest.join(invitation.roomId), /character/);
  assert.equal(p.host.lobby.seats[1].connected, false);
  assert.equal(p.host.lobby.seats[1].character, 1);
});

test('lobby validation rejects malformed characters and changes to started choices', async t => {
  const p = table(); t.after(() => p.close());
  const invitation = await p.host.host(p.state);
  await p.guests[0].join(invitation.roomId); p.host.start(); await flush();
  for (const character of [-1, 4, 1.5, '1', null, {}, []]) {
    const lobby = structuredClone(p.host.lobby); lobby.seats[0].character = character;
    assert.equal(p.guests[0]._validateLobby(lobby), null);
  }
  const lobby = structuredClone(p.host.lobby); lobby.seats[0].character = 3;
  const record = [...p.host._connections.values()][0];
  p.host._send(record, { type: 'lobby', lobby }); await flush();
  assert.equal(p.guests[0].connected, false);
  assert.equal(p.host.ready, false);
});

test('host close pauses guests and refuses new actions', async t => {
  const p = table(3); t.after(() => p.close());
  const invitation = await p.host.host(p.state); await Promise.all(p.guests.map(g => g.join(invitation.roomId)));
  p.host.start(); await flush(); p.host.close(); await flush();
  for (const g of p.guests) { assert.equal(g.ready, false); assert.equal(g.connected, false); assert.equal(g.sendAction('0/pass', 0), false); }
});

test('invalid links and unavailable hosts produce actionable errors', async t => {
  const p = table(); t.after(() => p.close());
  await assert.rejects(p.guests[0].join('invalid'), /valid room/);
  await assert.rejects(p.guests[0].join('ceoisdead-00000000-0000-0000-0000-000000000000'), /host is not online/);
});

test('rejecting the initial state cannot resurrect a closed room or its timers', async t => {
  const p = table(); t.after(() => p.close());
  p.guests[0].onState = () => p.guests[0].close();
  const invitation = await p.host.host(p.state);
  await assert.rejects(p.guests[0].join(invitation.roomId), /cancelled/); await flush();
  assert.equal(p.guests[0].connected, false); assert.equal(p.guests[0].ready, false);
  assert.equal(p.guests[0]._connections.size, 0); assert.equal(p.guests[0]._heartbeat, undefined);
  assert.equal(p.host.lobby.seats[1].connected, false);
});

test('a send failure while starting never restores an outdated ready lobby', async t => {
  const p = table(3); t.after(() => p.close());
  const invitation = await p.host.host(p.state); await Promise.all(p.guests.map(g => g.join(invitation.roomId)));
  const failed = [...p.host._connections.values()].find(r => r.seat === 1);
  failed.connection.send = () => { throw new Error('Network failed during publication'); };
  p.host.start(); await flush();
  assert.equal(p.host.ready, false); assert.equal(p.guests[1].ready, false);
  assert.equal(p.guests[1].lobby.seats[1].connected, false);
});

test('a peer failing immediately after opening cannot resurrect host or guest state', async t => {
  class FailingPeer extends EventEmitter {
    constructor(id) { super(); this.id = id; queueMicrotask(() => { this.emit('open'); this.emit('error', new Error('Immediate failure')); }); }
    destroy() {}
    connect() { assert.fail('A failed peer must not create a connection'); }
  }
  const host = new GameRoom({ loadPeer: async () => FailingPeer, getUrl: () => 'https://example.com' });
  const guest = new GameRoom({ loadPeer: async () => FailingPeer });
  t.after(() => { host.close(); guest.close(); });
  await assert.rejects(host.host(createGame()), /cancelled|failure/);
  await assert.rejects(guest.join('ceoisdead-00000000-0000-0000-0000-000000000000'), /cancelled|failure/);
  assert.equal(host.connected, false); assert.equal(host.isHost, false); assert.equal(host._peer, null);
  assert.equal(guest.connected, false); assert.equal(guest._connections.size, 0);
});
