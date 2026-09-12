import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, getLegalActions, applyAction, assertInvariants, chooseAIAction, serializeGame, deserializeGame, getStandings, REGIONS, CARDS } from '../site/game/engine.js';

const factions = ['scots', 'welsh', 'english'];
const ids = REGIONS.map(r => r.id);
const copy = value => JSON.parse(JSON.stringify(value));
const counts = (scots = 0, welsh = 0, english = 0) => ({ scots, welsh, english });
const play = (state, card, predicate = () => true) => {
  const command = getLegalActions(state, card).find(predicate);
  assert.ok(command, 'Expected a legal ' + card + ' action');
  return applyAction(state, command);
};
const pass = state => applyAction(state, getLegalActions(state).find(a => a.type === 'pass'));
function summon(state, predicate = () => true) {
  const command = getLegalActions(state).find(a => a.type === 'summon' && predicate(a));
  assert.ok(command, 'Expected a summon choice');
  return applyAction(state, command);
}
function fixture({ board = {}, controls = {}, courts = [counts(), counts()], used = [[], []], last = [0, 0], order = ids } = {}) {
  const state = createGame({ seed: 'fixture' });
  state.order = [...order];
  state.players.forEach((p, i) => {
    p.court = { ...courts[i] };
    p.discard = [...used[i]];
    p.hand = Object.keys(CARDS).filter(c => !used[i].includes(c));
    p.lastActionAt = last[i];
  });
  state.actionCount = used.flat().length;
  state.revision = state.actionCount + Object.keys(controls).length * 2;
  if (state.actionCount) {
    const index = last[0] > last[1] ? 0 : 1;
    state.lastAction = { player: index, cardId: used[index].at(-1), delta: {} };
  }
  state.regions = Object.fromEntries(ids.map(id => [id, { followers: { ...(board[id] ?? counts()) }, control: controls[id] ?? null }]));
  state.round = Object.keys(controls).length;
  state.supply = Object.fromEntries(factions.map(f => [f, 16 - state.players.reduce((n, p) => n + p.court[f], 0) - ids.reduce((n, r) => n + state.regions[r].followers[f], 0)]));
  assertInvariants(state);
  return state;
}

test('seeded setup is reproducible, balanced, and serializable', () => {
  const a = createGame({ seed: 'first-night' });
  assert.deepEqual(a, createGame({ seed: 'first-night' }));
  assert.notDeepEqual(a.order, createGame({ seed: 'different' }).order);
  for (const region of Object.values(a.regions)) assert.equal(Object.values(region.followers).reduce((n, count) => n + count), 4);
  assert.ok(a.regions.moray.followers.scots >= 2);
  assert.ok(a.regions.gwynedd.followers.welsh >= 2);
  assert.ok(a.regions.essex.followers.english >= 2);
  assert.equal(a.players[0].hand.length, 8);
  assert.deepEqual(deserializeGame(serializeGame(a)), a);
  assert.throws(() => createGame({ players: ['Solo'] }), /two players/);
});

test('commands are immutable, revision bound, and cannot forge their effects', () => {
  const state = createGame();
  const before = serializeGame(state);
  const command = getLegalActions(state, 'scottish-support')[0];
  const next = applyAction(state, { ...command, placements: [{ region: 'moray', faction: 'scots', count: 9000 }] });
  assert.equal(serializeGame(state), before);
  assert.equal(next.phase, 'summon');
  assert.throws(() => applyAction(next, command), /no longer legal/);
  assert.throws(() => applyAction(state, { id: 'invented' }), /no longer legal/);
  assertInvariants(next);
});

test('support uses a neighboring home region and as much supply as available', () => {
  const state = createGame();
  const actions = getLegalActions(state, 'scottish-support');
  assert.ok(actions.every(a => a.placements.length === 1 && a.placements[0].region === 'strathclyde' && a.placements[0].count === 2));
  const scarce = fixture({ board: { moray: counts(1) }, courts: [counts(14), counts()] });
  const partial = getLegalActions(scarce, 'scottish-support');
  assert.equal(partial[0].placements[0].count, 1);
  const occupied = fixture({ controls: { moray: 'english' }, board: { strathclyde: counts(1) } });
  assert.ok(getLegalActions(occupied, 'scottish-support')[0].noop);
});

test('assemble requires every available faction and permits distributing them', () => {
  const state = fixture({ courts: [counts(16, 0, 0), counts()] });
  const actions = getLegalActions(state, 'assemble-1');
  assert.equal(actions.length, 64);
  assert.ok(actions.every(a => a.placements.length === 2 && a.placements.every(p => p.count === 1 && p.faction !== 'scots')));
  assert.ok(actions.some(a => a.regions.length === 2));
});

test('two consecutive passes resolve one region and continue normal turn order', () => {
  let state = fixture({ board: { moray: counts(3, 1, 1) } });
  state = pass(state);
  assert.equal(state.round, 0);
  assert.equal(state.activePlayer, 1);
  state = pass(state);
  assert.equal(state.round, 1);
  assert.equal(state.activePlayer, 0);
  assert.equal(state.regions.moray.control, 'scots');
  assert.deepEqual(state.regions.moray.followers, counts());
  assert.equal(state.passes, 0);
});

test('a card resets passes and its player must finish summoning before play changes', () => {
  let state = pass(createGame());
  state = play(state, 'assemble-1');
  assert.equal(state.activePlayer, 1);
  assert.equal(state.passes, 0);
  assert.equal(state.phase, 'summon');
  assert.ok(getLegalActions(state).every(a => a.type === 'summon'));
  const before = copy(state.players[1].court);
  const command = getLegalActions(state)[0];
  state = applyAction(state, command);
  assert.equal(state.players[1].court[command.faction], before[command.faction] + 1);
  assert.equal(state.activePlayer, 0);
  state = pass(state);
  assert.equal(state.round, 0);
  assert.equal(state.passes, 1);
});

test('plurality ties and empty regions become unstable; minority ties do not', () => {
  for (const [followers, expected] of [[counts(2, 2, 1), 'unstable'], [counts(), 'unstable'], [counts(3, 1, 1), 'scots']]) {
    const state = pass(pass(fixture({ board: { moray: followers } })));
    assert.equal(state.regions.moray.control, expected);
  }
});

test('third instability ends the match even on the final contest', () => {
  const controls = Object.fromEntries(ids.slice(0, 7).map((id, i) => [id, i < 2 ? 'unstable' : 'scots']));
  const state = pass(pass(fixture({ controls, courts: [counts(2, 2, 2), counts(4, 1, 1)] })));
  assert.equal(state.round, 8);
  assert.equal(state.result.type, 'invasion');
  assert.deepEqual(state.result.winners, ['p1']);
  assert.equal(getLegalActions(state).length, 0);
});

test('coronation faction ties favor the latest region victory', () => {
  const controls = Object.fromEntries(ids.slice(0, 7).map((id, i) => [id, i < 4 ? 'scots' : 'welsh']));
  const state = pass(pass(fixture({ controls, board: { devon: counts(0, 2, 0) }, courts: [counts(1, 3), counts(4, 1)] })));
  assert.equal(state.result.faction, 'welsh');
  assert.deepEqual(state.result.winners, ['p1']);
});

test('coronation checks second faction support before action timing', () => {
  const controls = Object.fromEntries(ids.slice(0, 7).map((id, i) => [id, i < 5 ? 'scots' : 'welsh']));
  const state = pass(pass(fixture({ controls, board: { devon: counts(0, 0, 1) }, courts: [counts(3, 1), counts(3, 2)] })));
  assert.deepEqual(state.result.winners, ['p2']);
});

test('coronation timing rewards the earlier final action, even with cards left', () => {
  const controls = Object.fromEntries(ids.slice(0, 7).map(id => [id, 'scots']));
  const state = pass(pass(fixture({ controls, board: { devon: counts(1) }, courts: [counts(2, 2), counts(2, 2)], used: [['assemble-1'], ['assemble-1']], last: [2, 1] })));
  assert.deepEqual(state.result.winners, ['p2']);
  assert.equal(state.players[1].hand.length, 7);
});

test('invasion sets tie favors the more recent action', () => {
  const controls = { moray: 'unstable', strathclyde: 'unstable' };
  const state = pass(pass(fixture({ controls, courts: [counts(2, 2, 2), counts(2, 2, 2)], used: [['assemble-1'], ['assemble-1']], last: [1, 2] })));
  assert.equal(state.result.type, 'invasion');
  assert.deepEqual(state.result.winners, ['p2']);
});

test('negotiate swaps unresolved unlocked contests and locks the chosen region card', () => {
  let state = createGame();
  const [a, b] = state.order;
  state = play(state, 'negotiate', command => command.swap.a === a && command.swap.b === b && command.swap.lock === a);
  assert.deepEqual(state.order.slice(0, 2), [b, a]);
  assert.deepEqual(state.locked, [a]);
  state = summon(state);
  assert.ok(getLegalActions(state, 'negotiate').every(command => !command.regions.includes(a)));
});

test('resolved regions reject all placements, exchanges, and summons', () => {
  const state = pass(pass(fixture({ board: { moray: counts(2), strathclyde: counts(1), lancaster: counts(0, 1) } })));
  assert.ok(getLegalActions(state).every(a => !a.regions.includes('moray')));
  const after = play(state, 'assemble-1');
  assert.ok(getLegalActions(after).every(a => a.region !== 'moray'));
});

test('an immediate reverse manoeuvre is forbidden even after a pass', () => {
  let state = fixture({ board: { moray: counts(1), devon: counts(0, 1), warwick: counts(0, 0, 2) }, order: ['warwick', ...ids.filter(id => id !== 'warwick')] });
  state = play(state, 'manoeuvre', a => a.exchange.from === 'moray' && a.exchange.to === 'devon');
  state = summon(state, a => a.region === 'warwick');
  assert.ok(!getLegalActions(state, 'manoeuvre').some(a => a.exchange?.from === 'moray' && a.exchange?.to === 'devon'));
  const p = pass(state); // Same actor who moved is now active.
  const p2 = pass(p); // Region resolves; previous action is still remembered.
  assert.equal(p2.lastAction.cardId, 'manoeuvre');
  assert.ok(!getLegalActions(p2, 'manoeuvre').some(a => a.exchange?.from === 'moray' && a.exchange?.to === 'devon'));
  const intervened = summon(play(state, 'assemble-1'), a => a.region === 'warwick');
  assert.equal(intervened.lastAction.cardId, 'assemble-1');
});

test('outmanoeuvre uses two return followers whenever possible and otherwise one', () => {
  const full = fixture({ board: { moray: counts(1), strathclyde: counts(0, 2) } });
  assert.ok(getLegalActions(full, 'outmanoeuvre').every(a => a.exchange.take.length === 2));
  const partial = fixture({ board: { moray: counts(1), strathclyde: counts(0, 1) } });
  assert.ok(getLegalActions(partial, 'outmanoeuvre').every(a => a.exchange.take.length === 1));
  const absent = fixture({ board: { moray: counts(1), devon: counts(0, 1) } });
  assert.ok(getLegalActions(absent, 'outmanoeuvre')[0].noop);
});

test('a no-effect card still summons; no board followers gracefully skips impossible summon', () => {
  let state = fixture({ controls: { moray: 'english' }, board: { strathclyde: counts(1) } });
  state = play(state, 'scottish-support');
  assert.equal(state.phase, 'summon');
  const empty = fixture();
  const skipped = play(empty, 'manoeuvre');
  assert.equal(skipped.phase, 'action');
  assert.equal(skipped.activePlayer, 1);
  assert.equal(skipped.players[0].discard.length, 1);
});

test('serialization rejects missing cubes and broken card inventories', () => {
  const state = createGame();
  state.supply.scots++;
  assert.throws(() => deserializeGame(JSON.stringify(state)), /conservation/);
  const broken = createGame();
  broken.players[0].hand.pop();
  assert.throws(() => assertInvariants(broken), /inventory/);
});

test('100 random complete matches conserve all pieces and terminate legally', () => {
  const endings = new Set();
  for (let seed = 0; seed < 100; seed++) {
    let state = createGame({ seed: String(seed) });
    let rng = (seed + 1) * 1234567, steps = 0;
    while (state.phase !== 'ended') {
      const legal = getLegalActions(state);
      rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
      const action = state.phase === 'action' && rng % 4 === 0 ? legal[0] : legal[rng % legal.length];
      state = applyAction(state, action);
      assertInvariants(state);
      assert.ok(++steps < 80, 'Game should terminate within its action/pass budget');
    }
    endings.add(state.result.type);
    assert.ok(state.result.winners.length >= 1);
  }
  assert.deepEqual([...endings].sort(), ['coronation', 'invasion']);
});

test('practice AI completes a deterministic legal match', () => {
  let state = createGame({ seed: 'practice' }), steps = 0;
  while (state.phase !== 'ended') {
    const command = chooseAIAction(state);
    assert.ok(command);
    state = applyAction(state, command);
    assert.ok(++steps < 80);
  }
  assert.equal(chooseAIAction(state), null);
  assert.ok(getStandings(state).instability <= 3);
});

test('remote snapshots reject malformed UI fields, unknown properties, and oversized data', () => {
  const mutateAndReject = mutate => {
    const state = createGame();
    mutate(state);
    assert.throws(() => deserializeGame(JSON.stringify(state)), /Invalid game/);
  };
  mutateAndReject(s => { s.players[0].name = {}; });
  mutateAndReject(s => { s.log = 'not an array'; });
  mutateAndReject(s => { s.log = [{ revision: 0, type: 'pass', text: {} }]; });
  mutateAndReject(s => { s.players[0].hand[0] = '__proto__'; });
  mutateAndReject(s => { s.regions.moray.followers.constructor = 0; });
  mutateAndReject(s => { s.lastAction = { player: 2, cardId: 'negotiate', delta: {} }; });
  mutateAndReject(s => { s.order.push('unknown'); });
  mutateAndReject(s => { s.phase = 'ended'; s.result = {}; });
  assert.throws(() => deserializeGame(' '.repeat(131073)), /too large/);
  assert.throws(() => createGame({ seed: 'x'.repeat(129) }), /Seed/);
});

test('a sole controlling faction does not invent a second most powerful faction', () => {
  const controls = Object.fromEntries(ids.slice(0, 7).map(id => [id, 'scots']));
  const state = pass(pass(fixture({ controls, board: { devon: counts(1) }, courts: [counts(2, 1, 4), counts(2, 4, 1)], used: [['assemble-1'], ['assemble-1']], last: [1, 2] })));
  assert.deepEqual(state.result.winners, ['p1']);
});

test('deserialization rejects a forged winner in a finished game', () => {
  const controls = { moray: 'unstable', strathclyde: 'unstable' };
  const state = pass(pass(fixture({ controls, courts: [counts(2, 2, 2), counts(1, 1, 1)] })));
  state.result.winners = ['p2'];
  assert.throws(() => deserializeGame(JSON.stringify(state)), /winner does not match board/);
});
