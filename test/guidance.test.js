import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, getLegalActions, applyAction } from '../site/game/engine.js';
import { getTurnGuidance } from '../site/guidance.js';

const table = names => createGame({ seed: 'turn-guidance', players: names ?? ['girl', 'EdTed'] });
const online = (game, localSeat, extra = {}) => getTurnGuidance({ game, mode: 'online', localSeat, roomReady: true, ...extra });
const lobby = (game, connected, started = false) => ({
  capacity: game.players.length, started,
  seats: game.players.map((player, seat) => ({ seat, name: player.name, connected: connected.includes(seat) })),
});
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

test('opposite viewers of the same two-player room receive opposite turn instructions', () => {
  const game = table();
  const girl = online(game, 0), ed = online(game, 1);
  assert.deepEqual([girl.title, girl.localPlayerName, girl.activePlayerName, girl.isMyTurn], ['YOUR TURN', 'girl', 'girl', true]);
  assert.deepEqual([ed.title, ed.localPlayerName, ed.activePlayerName, ed.isMyTurn], ['WAITING FOR girl', 'EdTed', 'girl', false]);
  assert.equal(girl.target, '#hand');
  assert.equal(ed.target, null);
  const next = applyAction(game, getLegalActions(game).find(action => action.type === 'pass'));
  assert.equal(online(next, 0).title, 'WAITING FOR EdTed');
  assert.equal(online(next, 1).title, 'YOUR TURN');
});

test('same names do not confer turn ownership, including a four-player teammate', () => {
  const game = table(['Alex', 'Alex', 'Alex', 'Alex']);
  assert.equal(game.teams, true);
  for (const seat of [1, 2, 3]) {
    const guidance = online(game, seat);
    assert.equal(guidance.state, 'waiting');
    assert.equal(guidance.title, 'WAITING FOR Alex');
    assert.equal(guidance.isMyTurn, false);
  }
  assert.equal(online(game, 0).isMyTurn, true);
});

test('a remote default name of You is described by seat, without renaming real names', () => {
  const game = table(['You', 'EdTed']);
  assert.equal(online(game, 1).title, 'WAITING FOR Seat 1');
  assert.equal(online(game, 1).activePlayerName, 'Seat 1');
  assert.equal(online(game, 0).localPlayerName, 'You');
  assert.equal(online(game, 0).title, 'YOUR TURN');
  const waiting = online(game, 1, { roomReady: false, roomLobby: lobby(game, [0, 1]) });
  assert.match(waiting.detail, /^Seat 1 will start/);
  const paused = online(game, 1, { roomReady: false, roomLobby: lobby(game, [1], true) });
  assert.match(paused.detail, /Seat 1 to reconnect/);
  assert.equal(getTurnGuidance({ game, mode: 'hotseat' }).title, 'Seat 1’S TURN');
  game.players[0].name = 'Younger Ed';
  assert.equal(online(game, 1).title, 'WAITING FOR Younger Ed');
  game.players[0].name = ' YOU ';
  assert.equal(online(game, 1).title, 'WAITING FOR Seat 1');
});

test('card, effect, and confirmation guidance targets the next available control', () => {
  const game = table(), card = 'assemble-1';
  const effects = getLegalActions(game, card);
  const context = { selectedCard: card, optionCount: effects.length };
  assert.equal(online(game, 0).state, 'action');
  assert.equal(online(game, 0, context).target, '#action-choice');
  assert.equal(online(game, 0, context).state, 'effect');
  const confirm = online(game, 0, { ...context, selectedAction: effects[0].id });
  assert.equal(confirm.state, 'confirm');
  assert.equal(confirm.target, '[data-command="confirm-move"]');
  const filtered = online(game, 0, { ...context, selectedRegion: 'moray', optionCount: 0, selectedAction: effects[0].id });
  assert.equal(filtered.state, 'effect');
  assert.equal(filtered.target, '#region-rail');
});

test('recruitment remains with the card player and directs both viewers correctly', () => {
  let game = table();
  game = applyAction(game, getLegalActions(game, 'assemble-1')[0]);
  assert.equal(game.phase, 'summon');
  assert.equal(online(game, 0).state, 'recruit-region');
  assert.equal(online(game, 0).target, '#region-rail');
  assert.equal(online(game, 1).state, 'waiting');
  assert.match(online(game, 1).detail, /girl.*choosing one follower/);
  const recruit = getLegalActions(game)[0];
  const options = getLegalActions(game).filter(action => action.region === recruit.region);
  const guidance = online(game, 0, { selectedRegion: recruit.region, regionOptions: options });
  assert.equal(guidance.state, 'recruit');
  assert.equal(guidance.target, '#move-panel .move-options');
  assert.equal(online(game, 0, { selectedRegion: recruit.region, regionOptions: options.length }).state, 'recruit');
  assert.equal(online(game, 0, { selectedRegion: recruit.region, regionOptions: [] }).state, 'recruit-region');
  game = applyAction(game, recruit);
  assert.equal(online(game, 0).state, 'waiting');
  assert.equal(online(game, 1).title, 'YOUR TURN');
});

test('a spent hand points to Pass, while a stale selected card cannot be confirmed', () => {
  const game = table();
  game.players[0].hand = [];
  const used = online(game, 0, { selectedCard: 'assemble-1', selectedAction: 'stale', optionCount: 1 });
  assert.equal(used.state, 'action');
  assert.equal(used.target, '#pass-button');
  assert.match(used.detail, /All eight cards are spent/);
  game.players[0].hand = ['negotiate'];
  assert.equal(online(game, 0, { selectedCard: 'assemble-1', selectedAction: 'stale', optionCount: 1 }).target, '#hand');
});

test('hosts fill and start the lobby while guests wait for the host', () => {
  const game = table();
  const partial = { roomReady: false, roomLobby: lobby(game, [0]) };
  assert.equal(online(game, 0, partial).title, 'WAITING FOR FRIENDS');
  assert.equal(online(game, 0, partial).target, '#invite-button');
  const filled = { roomReady: false, roomLobby: lobby(game, [0, 1]) };
  const host = online(game, 0, filled), guest = online(game, 1, filled);
  assert.deepEqual([host.state, host.title, host.target, host.isMyTurn], ['lobby', 'TABLE READY', '#start-table', false]);
  assert.equal(guest.title, 'WAITING FOR HOST');
  assert.match(guest.detail, /girl will start/);
  assert.equal(guest.isMyTurn, false);
  // A transient ready flag cannot override an explicit unstarted lobby.
  assert.equal(online(game, 0, { ...filled, roomReady: true }).isMyTurn, false);
});

test('disconnects never announce a turn, and reconnect restores the assigned seat', () => {
  const game = table();
  const disconnected = { roomReady: false, roomLobby: lobby(game, [0], true) };
  for (const seat of [0, 1]) {
    const guidance = online(game, seat, disconnected);
    assert.equal(guidance.state, 'paused');
    assert.equal(guidance.title, 'MATCH PAUSED');
    assert.equal(guidance.isMyTurn, false);
    assert.equal(guidance.target, '#invite-button');
  }
  assert.match(online(game, 0, disconnected).detail, /EdTed to reconnect/);
  assert.match(online(game, 1, disconnected).detail, /reclaim your seat/);
  const rejoined = { roomReady: true, roomLobby: lobby(game, [0, 1], true) };
  assert.equal(online(game, 0, rejoined).title, 'YOUR TURN');
  assert.equal(online(game, 1, rejoined).title, 'WAITING FOR girl');
  const progressed = applyAction(game, getLegalActions(game).find(action => action.type === 'pass'));
  assert.equal(online(progressed, 1, { roomReady: false, roomLobby: null }).state, 'paused');
});

test('an unassigned or invalid online seat never inherits the host identity', () => {
  const game = table();
  for (const localSeat of [null, undefined, -1, 9, '0']) {
    const guidance = online(game, localSeat);
    assert.equal(guidance.localPlayerName, null);
    assert.equal(guidance.isMyTurn, false);
    assert.equal(guidance.state, 'paused');
  }
  assert.equal(online(game, null, { roomReady: false }).title, 'JOINING THE TABLE');
});

test('same-screen play names the active player and has no persistent local identity', () => {
  let game = table();
  const first = getTurnGuidance({ game, mode: 'hotseat', localSeat: 1 });
  assert.deepEqual([first.title, first.localPlayerName, first.isMyTurn], ['girl’S TURN', null, true]);
  game = applyAction(game, getLegalActions(game).find(action => action.type === 'pass'));
  const next = getTurnGuidance({ game, mode: 'hotseat', localSeat: 0 });
  assert.deepEqual([next.title, next.localPlayerName, next.isMyTurn], ['EdTed’S TURN', null, true]);
});

test('solo guidance always treats seat zero as the human and ended games have no turn', () => {
  let game = table();
  const first = getTurnGuidance({ game, mode: 'solo', localSeat: 1 });
  assert.equal(first.localPlayerName, 'girl');
  assert.equal(first.isMyTurn, true);
  game = applyAction(game, getLegalActions(game).find(action => action.type === 'pass'));
  assert.equal(getTurnGuidance({ game, mode: 'solo' }).title, 'WAITING FOR EdTed');
  while (game.phase !== 'ended') game = applyAction(game, getLegalActions(game).find(action => action.type === 'pass'));
  const ended = online(game, game.activePlayer, { roomReady: false });
  assert.deepEqual([ended.state, ended.title, ended.isMyTurn, ended.target], ['ended', 'GAME OVER', false, null]);
});

test('guidance reads frozen input without changing game, selections, or player names', () => {
  const game = table(['<girl>', 'EdTed']);
  const context = freeze({ game, mode: 'online', localSeat: 0, roomReady: true, roomLobby: lobby(game, [0, 1], true), selectedCard: 'assemble-1', optionCount: 2, regionOptions: [] });
  const before = JSON.stringify(context);
  const guidance = getTurnGuidance(context);
  assert.equal(guidance.localPlayerName, '<girl>');
  assert.equal(JSON.stringify(context), before);
  assert.deepEqual(Object.keys(guidance).sort(), ['state', 'title', 'detail', 'step', 'target', 'localPlayerName', 'activePlayerName', 'isMyTurn'].sort());
});
