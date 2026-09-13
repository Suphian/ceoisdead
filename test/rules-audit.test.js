import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, getLegalActions } from '../site/game/engine.js';

// Legal, reachable matches exhibiting the final coronation tiebreak.
// Publisher reference: tkid2_rulebook.pdf, pages 7 (individual) and 8 (teams).
// A tied contender/team that played ALL its cards must beat an unspent hand.
// The prototype's fallback for tied parties with unspent hands is separate.
const individualHistory = `
0/assemble-2/73 1/summon/lancaster/english
2/assemble-2/307 3/summon/northumbria/scots
4/assemble-1/26 5/summon/devon/english
6/outmanoeuvre/131 7/summon/essex/welsh
8/outmanoeuvre/80 9/summon/moray/scots
10/negotiate/17 11/summon/northumbria/english
12/manoeuvre/35 13/summon/strathclyde/welsh
14/assemble-1/15 15/summon/moray/welsh
16/welsh-support/1 17/summon/northumbria/english
18/manoeuvre/94 19/summon/warwick/scots
20/negotiate/40 21/summon/northumbria/welsh
22/welsh-support/0 23/summon/warwick/welsh
24/english-support/0 25/summon/northumbria/scots
26/english-support/0 27/summon/essex/english
28/scottish-support/0 29/summon/warwick/welsh
`;
const teamHistory = `
0/outmanoeuvre/207 1/summon/moray/scots
2/outmanoeuvre/4 3/summon/northumbria/english
4/assemble-1/345 5/summon/warwick/english
6/assemble-2/404 7/summon/lancaster/scots
8/assemble-2/67 9/summon/essex/welsh
10/assemble-2/238 11/summon/essex/welsh
12/outmanoeuvre/19 13/summon/devon/welsh
14/negotiate/11 15/summon/warwick/english
16/manoeuvre/22 17/summon/strathclyde/english
18/manoeuvre/88 19/summon/moray/scots
20/manoeuvre/109 21/summon/strathclyde/scots
22/manoeuvre/50 23/summon/strathclyde/english
24/negotiate/3 25/summon/essex/scots
26/negotiate/8 27/summon/lancaster/english
28/negotiate/7 29/summon/essex/english
30/outmanoeuvre/43 31/summon/lancaster/welsh
32/scottish-support/0 33/summon/gwynedd/english
34/assemble-1/5 35/summon/warwick/welsh
36/english-support/1 37/summon/northumbria/scots
38/welsh-support/0 39/summon/essex/scots
40/english-support/0 41/summon/gwynedd/welsh
42/welsh-support/0 43/summon/strathclyde/welsh
44/welsh-support/0 45/summon/warwick/scots
46/english-support/0 47/summon/strathclyde/english
48/welsh-support/0 49/summon/moray/scots
50/english-support/0 51/summon/moray/scots
52/assemble-2/0 53/summon/northumbria/english
54/assemble-1/0 55/summon/essex/english
56/assemble-1/0 57/summon/moray/scots
58/scottish-support/0 59/summon/northumbria/scots
60/scottish-support/0 61/summon/warwick/welsh
`;

function finish(state, history) {
  for (const id of history.trim().split(/\s+/)) state = applyAction(state, id);
  while (state.phase !== 'ended') {
    state = applyAction(state, getLegalActions(state).find(action => action.type === 'pass'));
  }
  assert.equal(state.result.type, 'coronation');
  return state;
}

test('official coronation tiebreak prioritizes a fully spent hand over an earlier unspent hand', () => {
  const state = finish(createGame({ seed: 'official-timing-11' }), individualHistory);
  assert.deepEqual(state.result.ranking, ['english', 'welsh', 'scots']);
  assert.deepEqual(state.players.map(player => [player.court.english, player.court.welsh]), [[3, 3], [3, 3]]);
  assert.deepEqual(state.players.map(player => player.hand.length), [0, 1]);
  assert.deepEqual(state.players.map(player => player.lastActionAt), [15, 14]);
  assert.deepEqual(state.result.winners, ['p1']);
});

test('official team coronation tiebreak prioritizes the team that exhausted both hands', () => {
  const state = finish(createGame({ seed: 'official-team-timing-2', players: ['A', 'B', 'C', 'D'] }), teamHistory);
  assert.deepEqual(state.result.ranking, ['welsh', 'english', 'scots']);
  assert.deepEqual(state.players.slice(0, 2).map(player => [player.court.welsh, player.court.english]), [[3, 2], [3, 2]]);
  assert.deepEqual(state.players.map(player => player.hand.length), [0, 0, 0, 1]);
  assert.deepEqual(state.players.map(player => player.lastActionAt), [29, 30, 31, 28]);
  assert.deepEqual(state.result.winners, ['p1', 'p3']);
});

test('version-one histories retain their original coronation interpretation', () => {
  const initial = createGame({ seed: 'official-timing-11' });
  initial.version = 1;
  delete initial.teams;
  const state = finish(initial, individualHistory);
  assert.deepEqual(state.result.winners, ['p2']);
});
