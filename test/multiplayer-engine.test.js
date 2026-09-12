import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, getLegalActions, assertInvariants, serializeGame, deserializeGame, chooseAIAction, seededRandom, REGIONS, CARDS } from '../site/game/engine.js';

const factions = ['scots', 'welsh', 'english'];
const ids = REGIONS.map(r => r.id);
const names = ['Ada', 'Grace', 'Linus', 'Margaret'];
const counts = (scots = 0, welsh = 0, english = 0) => ({ scots, welsh, english });
const pass = state => applyAction(state, getLegalActions(state).find(a => a.type === 'pass'));
function ending({ courts, controls, last = [], teams = true }) {
  const state = createGame({ seed: 'ending', players: names.slice(0, courts.length), teams });
  state.order = [...ids];
  state.players.forEach((p, i) => {
    p.court = courts[i];
    const used = last[i] ? ['assemble-1'] : [];
    p.discard = used; p.hand = Object.keys(CARDS).filter(id => !used.includes(id)); p.lastActionAt = last[i] ?? 0;
  });
  state.actionCount = last.filter(Boolean).length;
  state.revision = state.actionCount;
  if (state.actionCount) {
    const player = last.indexOf(Math.max(...last));
    state.lastAction = { player, cardId: 'assemble-1', delta: {} };
  }
  state.regions = Object.fromEntries(ids.map((id, i) => [id, { followers: counts(), control: controls[i] ?? null }]));
  state.round = controls.length;
  // The last unresolved region goes to the Scottish faction at coronation.
  if (controls.length === 7) state.regions[ids[7]].followers.scots = 1;
  state.supply = Object.fromEntries(factions.map(f => [f, 18 - courts.reduce((n, c) => n + c[f], 0) - ids.reduce((n, id) => n + state.regions[id].followers[f], 0)]));
  assertInvariants(state);
  let result = state;
  for (let i = 0; i < courts.length; i++) result = pass(result);
  return result;
}

for (const count of [3, 4]) {
  test(`${count} players receive balanced setup and rotate through every seat`, () => {
    let state = createGame({ seed: 'bigger-table', players: names.slice(0, count) });
    assert.equal(state.players.length, count);
    assert.equal(Object.values(state.supply).reduce((a, b) => a + b), 22 - count * 2);
    for (const f of factions) assert.equal(state.supply[f] + state.players.reduce((n, p) => n + p.court[f], 0) + ids.reduce((n, id) => n + state.regions[id].followers[f], 0), 18);
    for (let seat = 0; seat < count; seat++) {
      assert.equal(state.activePlayer, seat);
      assert.equal(state.round, 0);
      assert.equal(getLegalActions(state)[0].label.startsWith('Pass and resolve'), seat === count - 1);
      state = pass(state);
    }
    assert.equal(state.round, 1); assert.equal(state.activePlayer, 0); assert.equal(state.passes, 0);
    assert.deepEqual(deserializeGame(serializeGame(state)), state);
  });

  test(`${count}-player card interrupts a pass sequence and recruitment stays with its actor`, () => {
    let state = createGame({ players: names.slice(0, count) });
    for (let i = 0; i < count - 1; i++) state = pass(state);
    const actor = state.activePlayer;
    state = applyAction(state, getLegalActions(state, 'assemble-1')[0]);
    assert.equal(state.passes, 0); assert.equal(state.activePlayer, actor); assert.equal(state.phase, 'summon');
    const recruitment = getLegalActions(state)[0], before = state.players[actor].court[recruitment.faction];
    state = applyAction(state, recruitment);
    assert.equal(state.players[actor].court[recruitment.faction], before + 1);
    assert.equal(state.activePlayer, 0); assert.equal(state.round, 0);
  });

  test(`${count}-player randomized complete matches conserve pieces and replay`, () => {
    for (let seed = 0; seed < 30; seed++) {
      let state = createGame({ seed: `multiplayer-${seed}`, players: names.slice(0, count) });
      const random = seededRandom(state.seed), history = [];
      while (state.phase !== 'ended' && history.length < 256) {
        const actions = getLegalActions(state);
        const action = state.phase === 'action' && random() < .4 ? actions[0] : actions[Math.floor(random() * actions.length)];
        history.push(action.id); state = applyAction(state, action);
      }
      assert.equal(state.phase, 'ended'); assertInvariants(state);
      let replay = createGame({ seed: state.seed, players: names.slice(0, count) });
      for (const action of history) replay = applyAction(replay, action);
      assert.deepEqual(replay, state); assert.deepEqual(deserializeGame(serializeGame(state)), state);
    }
  });
}

test('three-player coronation awards the strongest individual, including seat three', () => {
  const state = ending({ teams: false, courts: [counts(1), counts(2), counts(4)], controls: Array(7).fill('scots') });
  assert.deepEqual(state.result.winners, ['p3']);
});
test('four-player coronation compares individual courts and awards both teammates', () => {
  const state = ending({ courts: [counts(4), counts(3), counts(), counts(3)], controls: Array(7).fill('scots') });
  assert.deepEqual(state.result.winners, ['p1', 'p3']);
});
test('team invasion combines courts before counting sets', () => {
  const state = ending({ courts: [counts(3, 0, 0), counts(1, 1, 1), counts(0, 3, 3), counts(1, 1, 1)], controls: ['unstable', 'unstable'] });
  assert.equal(state.result.type, 'invasion'); assert.deepEqual(state.result.winners, ['p1', 'p3']);
});
test('team invasion ties use the latest action by either teammate', () => {
  const state = ending({ courts: [counts(1, 1, 1), counts(1, 1, 1), counts(), counts()], controls: ['unstable', 'unstable'], last: [1, 2, 4, 3] });
  assert.deepEqual(state.result.winners, ['p1', 'p3']);
});
test('team coronation ties compare the latest action of each entire team', () => {
  const state = ending({ courts: [counts(2), counts(2), counts(), counts()], controls: Array(7).fill('scots'), last: [1, 2, 4, 3] });
  assert.deepEqual(state.result.winners, ['p2', 'p4']);
});
test('multiple individual rivals can play with practice AI without invalid seat indexing', () => {
  let state = createGame({ players: names.slice(0, 3) });
  state = pass(pass(state));
  const action = chooseAIAction(state); assert.ok(getLegalActions(state).some(a => a.id === action.id));
  assertInvariants(applyAction(state, action));
});
test('expanded snapshot validation rejects forged seats, inventory and team winners', () => {
  for (const mutate of [s => s.activePlayer = 4, s => s.lastAction = { player: 4 }, s => s.passes = 4, s => s.players[3].id = 'p1', s => s.supply.scots++, s => s.teams = 'yes']) {
    const state = createGame({ players: names }); mutate(state);
    assert.throws(() => deserializeGame(JSON.stringify(state)), /Invalid game/);
  }
  const finished = ending({ courts: [counts(4), counts(1), counts(), counts()], controls: Array(7).fill('scots') });
  finished.result.winners = ['p1'];
  assert.throws(() => deserializeGame(JSON.stringify(finished)), /winner/);
});
test('legacy two-player snapshots and seeds remain supported', () => {
  const state = createGame({ seed: 'legacy' }); state.version = 1; delete state.teams;
  assert.deepEqual(deserializeGame(JSON.stringify(state)), state);
  assertInvariants(pass(state));
});
