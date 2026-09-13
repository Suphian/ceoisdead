import { deserializeGame, serializeGame } from './game/engine.js';
import { validateHostCheckpoint } from './room.js';

export const GAME_LIBRARY_KEY = 'togaisdead.games.v1';
const copy = value => JSON.parse(JSON.stringify(value));
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,160}$/.test(value);
const validPeerId = value => typeof value === 'string' && /^ceoisdead-[a-zA-Z0-9-]{20,80}$/.test(value);
const validCharacter = value => Number.isInteger(value) && value >= 0 && value < 4;
const validTime = value => Number.isSafeInteger(value) && value >= 0;
const validStatus = value => value === 'open' || value === 'closed';

function samePosition(a, b) {
  const position = game => ({ ...game, players: game.players.map(player => ({ ...player, name: '' })) });
  return JSON.stringify(position(a)) === JSON.stringify(position(b));
}

function roomData(value, game, characters) {
  if (!value || !['host', 'guest'].includes(value.role) || !validPeerId(value.roomId)
    || !Number.isInteger(value.seat) || value.seat < 0 || value.seat >= game.players.length
    || (value.role === 'host' ? value.seat !== 0 : value.seat === 0)) throw new Error('The saved online seat is invalid.');
  let url = '';
  if (value.url) {
    const parsed = new URL(value.url);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password
      || parsed.searchParams.get('room') !== value.roomId) throw new Error('The saved invitation is invalid.');
    url = parsed.href;
  }
  const room = { role: value.role, roomId: value.roomId, url, seat: value.seat };
  if (value.role === 'host') {
    const checkpoint = validateHostCheckpoint(value.checkpoint);
    if (checkpoint.roomId !== value.roomId || serializeGame(checkpoint.state) !== serializeGame(game)
      || checkpoint.seats.some((s, i) => s.character !== characters[i])) throw new Error('The host checkpoint does not match the saved game.');
    room.checkpoint = checkpoint;
  } else {
    if (!validPeerId(value.token) || value.checkpoint != null) throw new Error('The saved guest seat cannot be resumed.');
    room.token = value.token;
  }
  return room;
}

function recordData(value) {
  if (!value || value.version !== 1 || !validId(value.id) || !validTime(value.createdAt)
    || !validTime(value.updatedAt) || value.updatedAt < value.createdAt || !validStatus(value.status)
    || !['solo', 'hotseat', 'online'].includes(value.mode) || !['medieval', 'roman'].includes(value.theme)) {
    throw new Error('A saved game has invalid details.');
  }
  const game = deserializeGame(JSON.stringify(value.game));
  if (!Array.isArray(value.characters) || value.characters.length !== game.players.length
    || !value.characters.every(validCharacter)) throw new Error('The saved characters are invalid.');
  const characters = value.characters.slice();
  const room = value.mode === 'online' ? roomData(value.room, game, characters) : null;
  if (value.mode !== 'online' && value.room != null) throw new Error('A local game cannot contain online seat credentials.');
  return { version: 1, id: value.id, createdAt: value.createdAt, updatedAt: value.updatedAt,
    status: game.phase === 'ended' ? 'closed' : value.status, mode: value.mode, theme: value.theme,
    characters, game, room };
}

function summary(record) {
  const { id, createdAt, updatedAt, status, mode, theme, characters, game, room } = record;
  return { id, createdAt, updatedAt, status, mode, theme, characters: characters.slice(),
    players: game.players.map(player => player.name), revision: game.revision, round: game.round,
    phase: game.phase, activePlayer: game.activePlayer,
    room: room ? { role: room.role, roomId: room.roomId, url: room.url, seat: room.seat } : null };
}

/**
 * Same-device archive; there is no server-side table directory. list() returns
 * summaries without credentials. get()/save() return full private records.
 * An online record requires an assigned seat: save hosts from onCheckpoint,
 * and save guests after join() returns their private resume token.
 */
export function createGameLibrary({ storage, now = Date.now } = {}) {
  if (storage === undefined) {
    try { storage = globalThis.localStorage; } catch { storage = null; }
  }
  function read() {
    if (!storage) return [];
    let raw;
    try { raw = storage.getItem(GAME_LIBRARY_KEY); }
    catch { throw new Error('Saved games could not be read on this device.'); }
    if (raw == null) return [];
    try {
      if (raw.length > 8_000_000) throw new Error('Archive too large.');
      const data = JSON.parse(raw);
      if (!data || data.version !== 1 || !Array.isArray(data.games) || data.games.length > 200) throw new Error('Invalid archive.');
      const games = data.games.map(recordData);
      if (new Set(games.map(game => game.id)).size !== games.length) throw new Error('Duplicate saved games.');
      return games;
    } catch { throw new Error('The saved-game library is damaged. Your existing data has been kept unchanged.'); }
  }
  function write(games) {
    if (!storage) throw new Error('Browser storage is unavailable. This game cannot be saved on this device.');
    if (games.length > 200) throw new Error('This device already has 200 saved games. Its existing saves have been kept.');
    try { storage.setItem(GAME_LIBRARY_KEY, JSON.stringify({ version: 1, games })); }
    catch { throw new Error('The game could not be saved. Browser storage may be full or disabled; the previous save is unchanged.'); }
  }
  function timestamp(previous = 0) {
    const time = now();
    if (!validTime(time)) throw new Error('A valid save timestamp is required.');
    return Math.max(time, previous);
  }
  return {
    save(input) {
      if (!input || !input.game) throw new Error('A game is required to save.');
      const games = read(), previous = input.id ? games.find(game => game.id === input.id) : null;
      const time = timestamp(previous?.updatedAt ?? 0);
      const id = input.id ?? 'game-' + (globalThis.crypto?.randomUUID?.() ?? time.toString(36) + '-' + Math.random().toString(36).slice(2));
      const record = recordData({ version: 1, id, createdAt: previous?.createdAt ?? time, updatedAt: time,
        status: input.status ?? previous?.status ?? 'open', mode: input.mode, theme: input.theme ?? 'medieval',
        characters: input.characters ?? input.game.players?.map((_, i) => i % 4), game: input.game, room: input.room ?? null });
      if (previous && (previous.game.seed !== record.game.seed || previous.mode !== record.mode
        || previous.room?.roomId !== record.room?.roomId || previous.room?.role !== record.room?.role
        || previous.room?.seat !== record.room?.seat)) throw new Error('This save belongs to a different table. Save the new table separately.');
      if (previous && record.game.revision < previous.game.revision) throw new Error('A newer turn is already saved. Reopen the saved game before continuing.');
      if (previous && record.game.revision === previous.game.revision && !samePosition(previous.game, record.game)) {
        throw new Error('Another tab saved a different move. Reopen the saved game before continuing.');
      }
      const index = games.findIndex(game => game.id === id);
      if (index < 0) games.push(record); else games[index] = record;
      write(games);
      return copy(record);
    },
    get(id) { return copy(read().find(game => game.id === id) ?? null); },
    list({ status } = {}) {
      if (status !== undefined && !validStatus(status)) throw new Error('Choose open or closed saved games.');
      return read().filter(game => status === undefined || game.status === status)
        .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)).map(summary);
    },
    setStatus(id, status) {
      if (!validStatus(status)) throw new Error('Choose open or closed saved games.');
      const games = read(), record = games.find(game => game.id === id);
      if (!record) return null;
      record.status = record.game.phase === 'ended' ? 'closed' : status;
      record.updatedAt = timestamp(record.updatedAt);
      write(games);
      return copy(record);
    },
  };
}
