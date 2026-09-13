import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, getLegalActions } from '../site/game/engine.js';
import { createGameLibrary, GAME_LIBRARY_KEY } from '../site/game-library.js';

function memoryStorage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)) };
}
const peerId = number => 'ceoisdead-00000000-0000-0000-0000-' + String(number).padStart(12, '0');
function hostRoom(game, characters = [2, 3]) {
  const roomId = peerId(1);
  return { role: 'host', roomId, seat: 0, url: 'https://example.com/?room=' + roomId,
    checkpoint: { version: 1, roomId, started: true, state: game,
      seats: game.players.map((player, seat) => ({ seat, name: player.name, character: characters[seat], token: seat ? peerId(seat + 1) : null })) } };
}

test('multiple game snapshots survive a new library instance, with open/closed lists and stable IDs', () => {
  const storage = memoryStorage(); let time = 10;
  const library = createGameLibrary({ storage, now: () => time++ });
  const first = library.save({ game: createGame({ seed: 'first' }), mode: 'solo', theme: 'medieval' });
  const second = library.save({ game: createGame({ seed: 'second' }), mode: 'hotseat', theme: 'roman', characters: [3, 3] });
  assert.notEqual(first.id, second.id);
  library.setStatus(first.id, 'closed');
  const reopened = createGameLibrary({ storage, now: () => time++ });
  assert.deepEqual(reopened.list({ status: 'closed' }).map(game => game.id), [first.id]);
  assert.deepEqual(reopened.list({ status: 'open' }).map(game => game.id), [second.id]);
  assert.deepEqual(reopened.get(second.id).characters, [3, 3]);
  assert.deepEqual(reopened.get(second.id).game, second.game);
  assert.equal(reopened.get('missing'), null);
  assert.equal(reopened.setStatus('missing', 'closed'), null);
  const originalTime = first.createdAt;
  const next = applyAction(first.game, getLegalActions(first.game).find(action => action.type === 'play').id);
  const updated = reopened.save({ ...first, game: next, status: 'open' });
  assert.equal(updated.id, first.id); assert.equal(updated.createdAt, originalTime);
  assert.equal(updated.game.phase, 'summon');
  assert.equal(reopened.list()[0].id, first.id);
  assert.equal(reopened.list().length, 2);
});

test('finished games stay closed, while unfinished archived games can reopen', () => {
  const library = createGameLibrary({ storage: memoryStorage() });
  let game = createGame({ seed: 'finished' });
  while (game.phase !== 'ended') game = applyAction(game, getLegalActions(game).find(action => action.type === 'pass').id);
  const finished = library.save({ game, mode: 'solo', status: 'open' });
  assert.equal(finished.status, 'closed');
  assert.equal(library.setStatus(finished.id, 'open').status, 'closed');
  const ongoing = library.save({ game: createGame({ seed: 'ongoing' }), mode: 'hotseat' });
  library.setStatus(ongoing.id, 'closed');
  assert.equal(library.setStatus(ongoing.id, 'open').status, 'open');
});

test('host and guest credentials persist privately but never appear in list summaries', () => {
  const storage = memoryStorage(), library = createGameLibrary({ storage });
  const game = createGame({ seed: 'online' }), characters = [2, 3], room = hostRoom(game, characters);
  const host = library.save({ game, mode: 'online', characters, room });
  const guest = library.save({ game, mode: 'online', characters,
    room: { role: 'guest', roomId: room.roomId, url: room.url, seat: 1, token: peerId(2) } });
  const fresh = createGameLibrary({ storage });
  assert.equal(fresh.get(host.id).room.checkpoint.seats[1].token, peerId(2));
  assert.equal(fresh.get(guest.id).room.token, peerId(2));
  const summaries = fresh.list(), publicText = JSON.stringify(summaries);
  assert.equal(publicText.includes(peerId(2)), false);
  assert.ok(summaries.every(summary => !Object.hasOwn(summary, 'game') && !Object.hasOwn(summary.room, 'checkpoint') && !Object.hasOwn(summary.room, 'token')));
  assert.deepEqual(summaries[0].players, game.players.map(player => player.name));
  assert.equal(summaries[0].room.roomId, room.roomId);
});

test('returned records, summaries and input objects cannot mutate stored snapshots', () => {
  const library = createGameLibrary({ storage: memoryStorage() }), game = createGame();
  const saved = library.save({ game, mode: 'solo', characters: [1, 2] });
  game.players[0].name = 'Input mutation'; saved.game.players[0].name = 'Result mutation';
  const list = library.list(); list[0].players[0] = 'Summary mutation'; list[0].characters[0] = 3;
  const current = library.get(saved.id); current.characters[0] = 0;
  assert.notEqual(library.get(saved.id).game.players[0].name, 'Input mutation');
  assert.deepEqual(library.get(saved.id).characters, [1, 2]);
});

test('invalid games and mismatched host checkpoints are rejected before writing', () => {
  const storage = memoryStorage(), library = createGameLibrary({ storage });
  const game = createGame({ seed: 'valid' });
  const initial = library.save({ game, mode: 'solo' }), before = storage.getItem(GAME_LIBRARY_KEY);
  const invalid = structuredClone(game); invalid.players[0].character = 3;
  assert.throws(() => library.save({ game: invalid, mode: 'solo' }), /Invalid game/);
  assert.throws(() => library.save({ game, mode: 'solo', characters: [1, '2'] }), /characters/);
  assert.throws(() => library.save({ game, mode: 'online' }), /online seat/);
  const room = hostRoom(game);
  assert.throws(() => library.save({ game, mode: 'online', characters: [0, 1], room }), /checkpoint/);
  const advanced = applyAction(game, getLegalActions(game).find(action => action.type === 'pass').id);
  assert.throws(() => library.save({ game: advanced, mode: 'online', characters: [2, 3], room }), /checkpoint/);
  const guest = { role: 'guest', roomId: room.roomId, seat: 1, token: peerId(2) };
  assert.throws(() => library.save({ game, mode: 'online', room: { ...guest, token: 'invalid' } }), /guest seat/);
  assert.throws(() => library.save({ game, mode: 'online', room: { ...guest, checkpoint: room.checkpoint } }), /guest seat/);
  assert.throws(() => library.save({ game, mode: 'online', room: { ...guest, url: 'javascript:alert(1)' } }), /invitation/);
  assert.equal(storage.getItem(GAME_LIBRARY_KEY), before);
  assert.deepEqual(library.get(initial.id).game, game);
});

test('a stale tab or a different table cannot overwrite a newer save', () => {
  const storage = memoryStorage(), firstTab = createGameLibrary({ storage }), secondTab = createGameLibrary({ storage });
  const initial = firstTab.save({ game: createGame({ seed: 'same-table' }), mode: 'hotseat' });
  const advanced = applyAction(initial.game, getLegalActions(initial.game).find(action => action.type === 'pass').id);
  secondTab.save({ ...initial, game: advanced });
  assert.throws(() => firstTab.save(initial), /newer turn/);
  const conflicting = applyAction(initial.game, getLegalActions(initial.game).find(action => action.type === 'play').id);
  assert.throws(() => firstTab.save({ ...initial, game: conflicting }), /different move/);
  assert.throws(() => firstTab.save({ ...initial, game: createGame({ seed: 'different-table' }) }), /different table/);
  assert.equal(firstTab.get(initial.id).game.revision, 1);
});

test('corrupt storage is not silently overwritten, and failed writes preserve the previous save', () => {
  const storage = memoryStorage(), library = createGameLibrary({ storage });
  storage.setItem(GAME_LIBRARY_KEY, '{broken');
  assert.throws(() => library.list(), /damaged/);
  assert.throws(() => library.save({ game: createGame(), mode: 'solo' }), /damaged/);
  assert.equal(storage.getItem(GAME_LIBRARY_KEY), '{broken');
  storage.setItem(GAME_LIBRARY_KEY, JSON.stringify({ version: 1, games: [] }));
  const saved = library.save({ game: createGame(), mode: 'solo' }), before = storage.getItem(GAME_LIBRARY_KEY);
  storage.setItem = () => { throw new Error('Quota exceeded'); };
  assert.throws(() => library.setStatus(saved.id, 'closed'), /previous save is unchanged/);
  assert.equal(storage.getItem(GAME_LIBRARY_KEY), before);
  assert.equal(library.get(saved.id).status, 'open');
  const blocked = createGameLibrary({ storage: { getItem() { throw new Error('Access denied'); } } });
  assert.throws(() => blocked.list(), /could not be read/);
  const unavailable = createGameLibrary({ storage: null });
  assert.deepEqual(unavailable.list(), []);
  assert.throws(() => unavailable.save({ game: createGame(), mode: 'solo' }), /storage is unavailable/);
});

test('corrupt stored game state is rejected instead of entering the engine', () => {
  const storage = memoryStorage(), library = createGameLibrary({ storage });
  library.save({ game: createGame(), mode: 'solo' });
  const data = JSON.parse(storage.getItem(GAME_LIBRARY_KEY)); data.games[0].game.supply.scots = 999;
  storage.setItem(GAME_LIBRARY_KEY, JSON.stringify(data));
  assert.throws(() => library.get(data.games[0].id), /damaged/);
});
