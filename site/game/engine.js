/**
 * Deterministic two-to-four-player standard game engine.
 * Original implementation; rules reference:
 * https://www.ospreypublishing.com/media/3yxddtqg/tkid2_rulebook.pdf
 * No artwork or rulebook prose is included.
 */
export const FACTIONS = Object.freeze([
  { id: 'scots', name: 'Scottish', color: '#74a9cc' },
  { id: 'welsh', name: 'Welsh', color: '#d9bd6e' },
  { id: 'english', name: 'English', color: '#ce7774' },
]);
const F = FACTIONS.map(f => f.id);
export const REGIONS = Object.freeze([
  { id: 'moray', name: 'Moray', neighbors: ['strathclyde'] },
  { id: 'strathclyde', name: 'Strathclyde', neighbors: ['moray', 'lancaster', 'northumbria'] },
  { id: 'lancaster', name: 'Lancaster', neighbors: ['strathclyde', 'northumbria', 'gwynedd', 'warwick'] },
  { id: 'northumbria', name: 'Northumbria', neighbors: ['strathclyde', 'lancaster', 'warwick', 'essex'] },
  { id: 'gwynedd', name: 'Gwynedd', neighbors: ['lancaster', 'warwick', 'devon'] },
  { id: 'warwick', name: 'Warwick', neighbors: ['lancaster', 'northumbria', 'gwynedd', 'essex', 'devon'] },
  { id: 'essex', name: 'Essex', neighbors: ['northumbria', 'warwick', 'devon'] },
  { id: 'devon', name: 'Devon', neighbors: ['gwynedd', 'warwick', 'essex'] },
]);
const R = REGIONS.map(r => r.id);
const regionInfo = Object.fromEntries(REGIONS.map(r => [r.id, r]));
const HOME = { scots: 'moray', welsh: 'gwynedd', english: 'essex' };
export const CARDS = Object.freeze({
  'scottish-support': { id: 'scottish-support', name: 'Scottish Support', kind: 'support', faction: 'scots', description: 'Add up to two Scottish followers beside Scottish territory.' },
  'welsh-support': { id: 'welsh-support', name: 'Welsh Support', kind: 'support', faction: 'welsh', description: 'Add up to two Welsh followers beside Welsh territory.' },
  'english-support': { id: 'english-support', name: 'English Support', kind: 'support', faction: 'english', description: 'Add up to two English followers beside English territory.' },
  'assemble-1': { id: 'assemble-1', name: 'Assemble', kind: 'assemble', description: 'Place one available follower of each faction, together or separately.' },
  'assemble-2': { id: 'assemble-2', name: 'Assemble', kind: 'assemble', description: 'Place one available follower of each faction, together or separately.' },
  negotiate: { id: 'negotiate', name: 'Negotiate', kind: 'negotiate', description: 'Exchange two unlocked contests, then lock one of them.' },
  manoeuvre: { id: 'manoeuvre', name: 'Manoeuvre', kind: 'exchange', description: 'Exchange one follower in each of two different regions.' },
  outmanoeuvre: { id: 'outmanoeuvre', name: 'Outmanoeuvre', kind: 'exchange', description: 'Exchange one follower for two in an adjacent region.' },
});
const zero = () => ({ scots: 0, welsh: 0, english: 0 });
const total = counts => F.reduce((n, f) => n + counts[f], 0);
const nameOf = id => regionInfo[id].name;
const factionName = id => FACTIONS.find(f => f.id === id).name;
const clone = value => JSON.parse(JSON.stringify(value));

export function seededRandom(seed) {
  let hash = 2166136261;
  for (const c of String(seed)) { hash ^= c.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return () => {
    hash += 0x6d2b79f5;
    let t = hash;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function shuffle(array, random) {
  const out = [...array];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
export function createGame(options = {}) {
  const seed = String(options.seed ?? 'the-empty-throne');
  if (seed.length > 128) throw new Error('Seed must be at most 128 characters.');
  const names = options.players ?? ['You', 'Rival'];
  if (!Array.isArray(names) || names.length < 2 || names.length > 4) throw new Error('This table needs two to four players.');
  const teams = options.teams ?? names.length === 4;
  if (typeof teams !== 'boolean' || (teams && names.length !== 4)) throw new Error('Teams need exactly four players.');
  const random = seededRandom(seed);
  const regions = Object.fromEntries(R.map(id => [id, { followers: zero(), control: null }]));
  for (const f of F) regions[HOME[f]].followers[f] = 2;
  const bag = shuffle(F.flatMap(f => Array(names.length === 2 ? 14 : 16).fill(f)), random);
  const draw = counts => { counts[bag.pop()]++; };
  const players = names.map((name, i) => {
    const court = zero(); draw(court); draw(court);
    return { id: 'p' + (i + 1), name: String(name).slice(0, 40) || 'Player ' + (i + 1), court, hand: Object.keys(CARDS), discard: [], lastActionAt: 0 };
  });
  for (const id of R) while (total(regions[id].followers) < 4) draw(regions[id].followers);
  const supply = zero();
  for (const f of bag) supply[f]++;
  const state = {
    version: 2, teams, seed, players, regions, supply, order: shuffle(R, random),
    locked: [], round: 0, activePlayer: 0, phase: 'action', passes: 0,
    revision: 0, actionCount: 0, lastAction: null, result: null, log: [],
  };
  assertInvariants(state);
  return state;
}

function exchangeDelta(effect) {
  const delta = {};
  if (!effect.exchange) return delta;
  const { from, to, give, take } = effect.exchange;
  const add = (region, faction, n) => {
    const key = region + ':' + faction;
    delta[key] = (delta[key] ?? 0) + n;
  };
  for (const f of give) { add(from, f, -1); add(to, f, 1); }
  for (const f of take) { add(to, f, -1); add(from, f, 1); }
  for (const key of Object.keys(delta)) if (delta[key] === 0) delete delta[key];
  return delta;
}
function isForbiddenReverse(state, cardId, effect) {
  const previous = state.lastAction;
  if (!previous || previous.player === state.activePlayer || previous.cardId !== cardId) return false;
  const delta = exchangeDelta(effect);
  const keys = Object.keys(delta);
  return keys.length > 0 && keys.length === Object.keys(previous.delta).length
    && keys.every(key => delta[key] === -previous.delta[key]);
}
function choices(counts, amount) {
  const result = [];
  function visit(start, picked, remaining) {
    if (!remaining) { result.push(picked); return; }
    for (let i = start; i < F.length; i++) {
      const f = F[i];
      if (picked.filter(value => value === f).length < counts[f]) visit(i, [...picked, f], remaining - 1);
    }
  }
  visit(0, [], amount);
  return result;
}
function effectsForCard(state, cardId) {
  const card = CARDS[cardId];
  const open = R.filter(id => state.regions[id].control === null);
  const effects = [];
  if (card.kind === 'support') {
    const f = card.faction;
    const bases = R.filter(id => state.regions[id].control === f
      || (id === HOME[f] && state.regions[id].control === null));
    const targets = open.filter(id => bases.some(base => regionInfo[base].neighbors.includes(id)));
    const count = Math.min(2, state.supply[f]);
    if (count) for (const region of targets) effects.push({
      placements: [{ region, faction: f, count }],
      regions: [region], label: 'Add ' + count + ' ' + factionName(f) + ' to ' + nameOf(region),
    });
  } else if (card.kind === 'assemble') {
    const available = F.filter(f => state.supply[f] > 0);
    if (available.length && open.length) {
      function place(index, placements) {
        if (index === available.length) {
          effects.push({ placements, regions: [...new Set(placements.map(p => p.region))],
            label: placements.map(p => factionName(p.faction) + ' → ' + nameOf(p.region)).join(' · ') });
          return;
        }
        for (const region of open) place(index + 1, [...placements, { region, faction: available[index], count: 1 }]);
      }
      place(0, []);
    }
  } else if (card.kind === 'negotiate') {
    const eligible = state.order.slice(state.round).filter(id => !state.locked.includes(id));
    for (let i = 0; i < eligible.length; i++) for (let j = i + 1; j < eligible.length; j++) {
      const a = eligible[i], b = eligible[j];
      for (const lock of [a, b]) effects.push({ swap: { a, b, lock }, regions: [a, b],
        label: nameOf(a) + ' ↔ ' + nameOf(b) + '; lock ' + nameOf(lock) });
    }
  } else {
    function exchanges(amount) {
      const found = [];
      for (const from of open) for (const to of open) {
        if (from === to || (cardId === 'outmanoeuvre' && !regionInfo[from].neighbors.includes(to))) continue;
        if (cardId === 'manoeuvre' && R.indexOf(from) > R.indexOf(to)) continue;
        for (const give of choices(state.regions[from].followers, 1)) {
          for (const take of choices(state.regions[to].followers, amount)) {
            const effect = { exchange: { from, to, give, take }, regions: [from, to],
              label: nameOf(from) + ': ' + give.map(factionName).join(' + ') + ' ↔ ' + nameOf(to) + ': ' + take.map(factionName).join(' + ') };
            if (!isForbiddenReverse(state, cardId, effect)) found.push(effect);
          }
        }
      }
      return found;
    }
    effects.push(...exchanges(cardId === 'outmanoeuvre' ? 2 : 1));
    if (!effects.length && cardId === 'outmanoeuvre') effects.push(...exchanges(1));
  }
  return effects.length ? effects : [{ noop: true, regions: [], label: 'No legal effect; still summon a follower' }];
}

/**
 * Actions are canonical commands. Send only {id} (or the returned object) to applyAction.
 * A revision prefix makes old selections invalid after another command.
 * Filter by cardId to populate a particular card's effect picker.
 */
export function getLegalActions(state, cardId) {
  if (state.phase === 'ended') return [];
  if (state.phase === 'summon') {
    return R.flatMap(region => F.filter(f => state.regions[region].followers[f] > 0).map(faction => ({
      id: state.revision + '/summon/' + region + '/' + faction,
      type: 'summon', region, faction, regions: [region],
      label: 'Summon ' + factionName(faction) + ' from ' + nameOf(region),
    })));
  }
  const actions = cardId ? [] : [{
    id: state.revision + '/pass', type: 'pass', regions: [],
    label: state.passes === state.players.length - 1 ? 'Pass and resolve ' + nameOf(state.order[state.round]) : 'Pass',
  }];
  for (const id of state.players[state.activePlayer].hand) {
    if (cardId && id !== cardId) continue;
    const effects = effectsForCard(state, id);
    effects.forEach((effect, i) => actions.push({
      id: state.revision + '/' + id + '/' + i, type: 'play', cardId: id, ...effect,
    }));
  }
  return actions;
}
function pushLog(state, type, text, extra = {}) {
  state.log.push({ revision: state.revision, type, text, ...extra });
}
function finishTurn(state) {
  state.phase = 'action';
  state.activePlayer = (state.activePlayer + 1) % state.players.length;
}
function move(state, from, to, faction) {
  state.regions[from].followers[faction]--;
  state.regions[to].followers[faction]++;
}
function factionRanks(state) {
  return [...F].sort((a, b) => {
    const wins = f => state.order.map((id, i) => state.regions[id].control === f ? i : -1).filter(i => i >= 0);
    const aa = wins(a), bb = wins(b);
    return bb.length - aa.length || (bb.at(-1) ?? -1) - (aa.at(-1) ?? -1) || F.indexOf(a) - F.indexOf(b);
  });
}
export function getStandings(state) {
  const ranking = factionRanks(state);
  return {
    factions: ranking.map(id => ({ id, regions: R.filter(r => state.regions[r].control === id).length })),
    players: state.players.map(p => ({ id: p.id, court: { ...p.court }, sets: Math.min(...F.map(f => p.court[f])), cards: p.hand.length })),
    instability: R.filter(id => state.regions[id].control === 'unstable').length,
  };
}
function scoreEnd(state, type) {
  const ranking = factionRanks(state);
  if (state.teams) {
    const teams = [0, 1].map(team => state.players.filter((_, index) => index % 2 === team));
    let candidates = [0, 1], reason;
    if (type === 'invasion') {
      const sets = teams.map(team => Math.min(...F.map(f => team.reduce((n, p) => n + p.court[f], 0))));
      candidates = candidates.filter(team => sets[team] === Math.max(...sets));
      reason = Math.max(...sets) + ' combined team faction sets';
    } else {
      let leaders = state.players;
      const secondHasPower = R.some(id => state.regions[id].control === ranking[1]);
      for (const f of ranking.slice(0, secondHasPower ? 2 : 1)) {
        const maximum = Math.max(...leaders.map(p => p.court[f]));
        leaders = leaders.filter(p => p.court[f] === maximum);
        candidates = [...new Set(leaders.map(p => state.players.indexOf(p) % 2))];
        if (candidates.length === 1) { reason = 'Strongest individual ' + factionName(f) + ' support wins for the team'; break; }
      }
    }
    if (candidates.length > 1) {
      // At coronation, a team that finished both hands outranks tied teams
      // with cards left. Only use the unspent-hand fallback if none finished.
      const completed = type === 'coronation'
        ? candidates.filter(i => teams[i].every(player => player.hand.length === 0)) : [];
      if (completed.length) candidates = completed;
      const timing = teams.map(team => Math.max(...team.map(p => p.lastActionAt)));
      const target = type === 'invasion' ? Math.max(...candidates.map(i => timing[i])) : Math.min(...candidates.map(i => timing[i]));
      candidates = candidates.filter(i => timing[i] === target);
      reason = type === 'invasion' ? 'Most recent team action breaks the takeover tie'
        : completed.length ? 'First team to play all its cards breaks the succession tie'
          : 'Least recent team action breaks the succession tie';
    }
    if (candidates.length > 1) reason = 'Shared victory: both teams remain tied';
    const winners = state.players.filter((_, i) => candidates.includes(i % 2)).map(p => p.id);
    state.result = { type, winners, faction: type === 'coronation' ? ranking[0] : null, ranking, reason };
    state.phase = 'ended';
    pushLog(state, 'end', (candidates.length === 1 ? 'Team ' + (candidates[0] + 1) + ' wins' : 'Shared team victory') + ' — ' + type + '.', { result: clone(state.result) });
    return;
  }
  let tied = state.players;
  let reason;
  if (type === 'invasion') {
    const maximum = Math.max(...tied.map(p => Math.min(...F.map(f => p.court[f]))));
    tied = tied.filter(p => Math.min(...F.map(f => p.court[f])) === maximum);
    reason = maximum + ' complete faction set' + (maximum === 1 ? '' : 's');
    if (tied.length > 1) {
      const latest = Math.max(...tied.map(p => p.lastActionAt));
      tied = tied.filter(p => p.lastActionAt === latest);
      reason += '; most recent action breaks the tie';
    }
  } else {
    // When the other two factions both hold zero regions, neither has a latest
    // victory. Do not let an arbitrary array order decide that undefined tie.
    const secondHasPower = R.some(id => state.regions[id].control === ranking[1]);
    for (const faction of ranking.slice(0, secondHasPower ? 2 : 1)) {
      const maximum = Math.max(...tied.map(p => p.court[faction]));
      tied = tied.filter(p => p.court[faction] === maximum);
      if (tied.length === 1) { reason = 'Most ' + factionName(faction) + ' support'; break; }
    }
    if (tied.length > 1) {
      // The published final tiebreak rewards the first exhausted hand. Keep
      // v1 results stable; use the documented fallback only if nobody finished.
      const completed = state.version === 1 ? [] : tied.filter(p => p.hand.length === 0);
      if (completed.length) tied = completed;
      const earliest = Math.min(...tied.map(p => p.lastActionAt));
      tied = tied.filter(p => p.lastActionAt === earliest);
      reason = completed.length ? 'First to play all cards breaks the coronation tie'
        : 'Least recent action breaks the coronation tie';
    }
  }
  state.result = { type, winners: tied.map(p => p.id), faction: type === 'coronation' ? ranking[0] : null, ranking, reason };
  if (tied.length > 1) state.result.reason = state.version === 1 ? 'Shared victory: neither tied player took an action' : 'Shared victory: the tied players took no action';
  state.phase = 'ended';
  pushLog(state, 'end', (tied.length > 1 ? 'Shared victory' : tied[0].name + ' wins') + ' — ' + type + '.', { result: clone(state.result) });
}
function resolveRegion(state) {
  const id = state.order[state.round];
  const region = state.regions[id];
  const best = Math.max(...F.map(f => region.followers[f]));
  const leaders = F.filter(f => region.followers[f] === best);
  const control = best > 0 && leaders.length === 1 ? leaders[0] : 'unstable';
  region.control = control;
  for (const f of F) { state.supply[f] += region.followers[f]; region.followers[f] = 0; }
  state.round++;
  state.passes = 0;
  pushLog(state, 'resolve', nameOf(id) + (control === 'unstable' ? ' falls into instability.' : ' is controlled by the ' + factionName(control) + ' faction.'), { region: id, control });
  if (R.filter(r => state.regions[r].control === 'unstable').length === 3) scoreEnd(state, 'invasion');
  else if (state.round === R.length) scoreEnd(state, 'coronation');
}

/** Return a new state; never mutate caller data. Illegal and stale commands throw. */
export function applyAction(state, command) {
  const id = typeof command === 'string' ? command : command?.id;
  const action = getLegalActions(state).find(candidate => candidate.id === id);
  if (!action) throw new Error('That action is no longer legal. Choose again.');
  const next = clone(state);
  next.revision++;
  const player = next.players[next.activePlayer];
  if (action.type === 'pass') {
    next.passes++;
    pushLog(next, 'pass', player.name + ' passes.', { player: player.id });
    next.activePlayer = (next.activePlayer + 1) % next.players.length;
    if (next.passes === next.players.length) resolveRegion(next);
  } else if (action.type === 'summon') {
    next.regions[action.region].followers[action.faction]--;
    player.court[action.faction]++;
    pushLog(next, 'summon', player.name + ' summons ' + factionName(action.faction) + ' from ' + nameOf(action.region) + '.', { player: player.id, region: action.region, faction: action.faction });
    finishTurn(next);
  } else {
    for (const p of action.placements ?? []) {
      next.supply[p.faction] -= p.count;
      next.regions[p.region].followers[p.faction] += p.count;
    }
    if (action.exchange) {
      const { from, to, give, take } = action.exchange;
      for (const f of give) move(next, from, to, f);
      for (const f of take) move(next, to, from, f);
    }
    if (action.swap) {
      const { a, b, lock } = action.swap;
      const ai = next.order.indexOf(a), bi = next.order.indexOf(b);
      [next.order[ai], next.order[bi]] = [next.order[bi], next.order[ai]];
      next.locked.push(lock);
    }
    player.hand = player.hand.filter(card => card !== action.cardId);
    player.discard.push(action.cardId);
    next.actionCount++;
    player.lastActionAt = next.actionCount;
    next.lastAction = { player: next.activePlayer, cardId: action.cardId, delta: exchangeDelta(action) };
    next.passes = 0;
    next.phase = 'summon';
    pushLog(next, 'play', player.name + ' plays ' + CARDS[action.cardId].name + '.', { player: player.id, cardId: action.cardId, detail: action.label });
    if (!R.some(r => total(next.regions[r].followers) > 0)) {
      pushLog(next, 'notice', 'No followers remain on the board to summon.');
      finishTurn(next);
    }
  }
  assertInvariants(next);
  return next;
}

/** Structural and conservation checks; guards every field consumed by the UI. */
export function assertInvariants(state) {
  const fail = message => { throw new Error('Invalid game: ' + message); };
  const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  const record = (value, allowed, required = allowed) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype
      || Object.keys(value).some(key => !allowed.includes(key))
      || required.some(key => !Object.hasOwn(value, key))) fail('object shape');
  };
  const string = (value, max, min = 0) => typeof value === 'string' && value.length >= min && value.length <= max;
  const cardExists = id => typeof id === 'string' && Object.hasOwn(CARDS, id);
  const permutation = (value, allowed) => Array.isArray(value) && value.length === allowed.length
    && new Set(value).size === allowed.length && value.every(v => allowed.includes(v));
  const checkResult = result => {
    record(result, ['type', 'winners', 'faction', 'ranking', 'reason']);
    if (!['invasion', 'coronation'].includes(result.type)
      || !Array.isArray(result.winners) || result.winners.length < 1 || result.winners.length > state.players.length
      || new Set(result.winners).size !== result.winners.length
      || result.winners.some(id => !state.players.some(p => p.id === id))
      || !permutation(result.ranking, F) || !string(result.reason, 200)
      || (result.type === 'invasion' ? result.faction !== null : result.faction !== result.ranking[0])) fail('result shape');
  };
  record(state, ['version', 'seed', 'players', 'regions', 'supply', 'order', 'locked', 'round',
    'activePlayer', 'phase', 'passes', 'revision', 'actionCount', 'lastAction', 'result', 'log', ...(state?.version === 2 ? ['teams'] : [])]);
  if (![1, 2].includes(state.version) || !Array.isArray(state.players) || !integer(state.players.length, 2, state.version === 1 ? 2 : 4)) fail('unsupported state');
  const count = state.players.length, factionTotal = count === 2 ? 16 : 18;
  if (state.version === 2 && (typeof state.teams !== 'boolean' || (state.teams && count !== 4))) fail('team setup');
  if (!string(state.seed, 128)) fail('seed');
  if (!['action', 'summon', 'ended'].includes(state.phase)) fail('phase');
  if (!integer(state.activePlayer, 0, count - 1)) fail('active player');
  if (!integer(state.round, 0, 8)) fail('round');
  if (!integer(state.revision, 0, 256)) fail('revision');
  if (!integer(state.actionCount, 0, 8 * count) || state.revision < state.actionCount) fail('action count');
  if (!integer(state.passes, 0, count - 1) || (state.phase !== 'action' && state.passes !== 0)) fail('pass count');
  if (!permutation(state.order, R)) fail('region order');
  if (!Array.isArray(state.locked) || new Set(state.locked).size !== state.locked.length
    || state.locked.some(r => !R.includes(r)) || state.locked.length > count) fail('negotiation locks');
  record(state.regions, R);
  for (const id of R) record(state.regions[id], ['followers', 'control']);
  for (const p of state.players) record(p, ['id', 'name', 'court', 'hand', 'discard', 'lastActionAt']);
  const counts = [state.supply, ...state.players.map(p => p.court), ...R.map(r => state.regions[r].followers)];
  for (const count of counts) {
    record(count, F);
    for (const f of F) if (!integer(count[f], 0, factionTotal)) fail('negative or invalid follower count');
  }
  for (const f of F) if (counts.reduce((n, c) => n + c[f], 0) !== factionTotal) fail('follower conservation');
  for (let i = 0; i < state.order.length; i++) {
    const region = state.regions[state.order[i]];
    if (![null, ...F, 'unstable'].includes(region.control)) fail('region control');
    if ((i < state.round) !== (region.control !== null)) fail('resolved region order');
    if (region.control !== null && total(region.followers) !== 0) fail('followers in a resolved region');
  }
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    if (p.id !== 'p' + (i + 1) || !string(p.name, 40, 1)) fail('player identity');
    if (!Array.isArray(p.hand) || !Array.isArray(p.discard)) fail('cards');
    const cards = [...p.hand, ...p.discard];
    if (cards.length !== 8 || new Set(cards).size !== 8 || cards.some(c => !cardExists(c))) fail('card inventory');
    if (!integer(p.lastActionAt, p.discard.length, state.actionCount)
      || (p.discard.length === 0) !== (p.lastActionAt === 0)) fail('action sequence');
  }
  if (state.actionCount !== state.players.reduce((n, p) => n + p.discard.length, 0)) fail('action count');
  const actionTimes = state.players.map(p => p.lastActionAt).filter(Boolean);
  if (new Set(actionTimes).size !== actionTimes.length) fail('duplicate action sequence');
  if (state.lastAction === null) {
    if (state.actionCount !== 0) fail('missing last action');
  } else {
    record(state.lastAction, ['player', 'cardId', 'delta']);
    const last = state.lastAction;
    if (!integer(last.player, 0, count - 1) || !cardExists(last.cardId)
      || state.players[last.player].lastActionAt !== state.actionCount
      || state.players[last.player].discard.at(-1) !== last.cardId) fail('last action');
    const deltaKeys = R.flatMap(r => F.map(f => r + ':' + f));
    record(last.delta, deltaKeys, []);
    if (Object.keys(last.delta).length > 6
      || Object.values(last.delta).some(n => !integer(n, -2, 2) || n === 0)) fail('exchange delta');
    for (const f of F) if (R.reduce((n, r) => n + (last.delta[r + ':' + f] ?? 0), 0) !== 0) fail('exchange conservation');
    if (!['manoeuvre', 'outmanoeuvre'].includes(last.cardId) && Object.keys(last.delta).length) fail('unexpected exchange delta');
  }
  if (state.phase === 'summon' && (!R.some(r => total(state.regions[r].followers) > 0)
    || state.players[state.activePlayer].lastActionAt !== state.actionCount || state.actionCount === 0)) fail('summon phase');
  const instability = R.filter(r => state.regions[r].control === 'unstable').length;
  const terminal = instability === 3 || state.round === 8;
  if (instability > 3 || (state.phase === 'ended') !== terminal
    || (state.phase === 'ended') !== (state.result !== null)) fail('terminal state');
  if (state.result !== null) {
    checkResult(state.result);
    if (state.result.type !== (instability === 3 ? 'invasion' : 'coronation')) fail('ending type');
    const expected = { ...state, log: [] };
    scoreEnd(expected, state.result.type);
    if (JSON.stringify(expected.result) !== JSON.stringify(state.result)) fail('winner does not match board');
  }
  if (!Array.isArray(state.log) || state.log.length > 256) fail('log size');
  let previousRevision = 0;
  for (const entry of state.log) {
    record(entry, ['revision', 'type', 'text', 'player', 'region', 'faction', 'cardId', 'detail', 'control', 'result'],
      ['revision', 'type', 'text']);
    if (!integer(entry.revision, Math.max(1, previousRevision), state.revision)
      || !['play', 'pass', 'summon', 'resolve', 'notice', 'end'].includes(entry.type)
      || !string(entry.text, 512) || (entry.detail !== undefined && !string(entry.detail, 2048))
      || (entry.player !== undefined && !state.players.some(p => p.id === entry.player))
      || (entry.region !== undefined && !R.includes(entry.region))
      || (entry.faction !== undefined && !F.includes(entry.faction))
      || (entry.cardId !== undefined && !cardExists(entry.cardId))
      || (entry.control !== undefined && ![...F, 'unstable'].includes(entry.control))) fail('log entry');
    if (entry.result !== undefined) checkResult(entry.result);
    previousRevision = entry.revision;
  }
  return true;
}
export function serializeGame(state) { assertInvariants(state); return JSON.stringify(state); }
export function deserializeGame(json) {
  if (typeof json !== 'string' || json.length > 131072) throw new Error('Invalid game: snapshot is too large.');
  const state = JSON.parse(json);
  assertInvariants(state);
  return state;
}

/** A small, deterministic practice opponent. It is intentionally not a solver. */
export function chooseAIAction(state) {
  const legal = getLegalActions(state);
  if (!legal.length) return null;
  const playerIndex = state.activePlayer;
  const mine = state.players[playerIndex];
  function heuristic(position) {
    if (position.result) return position.result.winners.includes(mine.id) ? 10000 : -10000;
    const strength = Object.fromEntries(F.map(f => [f, 0]));
    for (const id of R) {
      const region = position.regions[id];
      if (F.includes(region.control)) strength[region.control] += 2.3;
      else if (region.control === null) {
        const max = Math.max(...F.map(f => region.followers[f]));
        const leaders = F.filter(f => region.followers[f] === max);
        if (max && leaders.length === 1) strength[leaders[0]] += 0.9;
      }
    }
    const leader = [...F].sort((a, b) => strength[b] - strength[a])[0];
    const allies = position.players.filter((_, i) => i === playerIndex || (position.teams && i % 2 === playerIndex % 2));
    const opponents = position.players.filter(p => !allies.includes(p));
    const a = position.players[playerIndex].court;
    const b = Object.fromEntries(F.map(f => [f, Math.max(...opponents.map(p => p.court[f]))]));
    const sets = Math.min(...F.map(f => a[f])) - Math.min(...F.map(f => b[f]));
    return F.reduce((n, f) => n + (a[f] - b[f]) * (0.4 + strength[f] * 0.35), 0)
      + (a[leader] - b[leader]) * 1.8 + sets * (getStandings(position).instability >= 2 ? 4 : 0.8);
  }
  if (state.phase === 'summon') {
    return legal.reduce((best, action) => {
      const score = heuristic(applyAction(state, action));
      return score > best.score ? { action, score } : best;
    }, { action: legal[0], score: -Infinity }).action;
  }
  // Preserve later interventions. Resolve a contest if its projected ending wins now.
  const pass = legal.find(a => a.type === 'pass');
  if (state.passes) {
    const after = applyAction(state, pass);
    if (after.result?.winners.includes(mine.id)) return pass;
  }
  const random = seededRandom(state.seed + ':' + state.revision);
  const selected = legal.length > 120
    ? [pass, ...shuffle(legal.filter(a => a.type !== 'pass'), random).slice(0, 119)]
    : legal;
  const baseline = heuristic(state);
  let best = { action: pass, score: baseline + (mine.hand.length <= 8 - state.round ? 2.2 : 0.3) };
  for (const action of selected) {
    if (action.type === 'pass') continue;
    const next = applyAction(state, action);
    let score = heuristic(next);
    if (next.phase === 'summon') {
      let bestSummon = -Infinity;
      for (const summon of getLegalActions(next)) bestSummon = Math.max(bestSummon, heuristic(applyAction(next, summon)));
      score = bestSummon;
    }
    score -= 0.65; // A remaining card has option value.
    if (score > best.score) best = { action, score };
  }
  return best.action;
}
