import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudio } from '../site/audio.js';

const STORAGE_KEY = 'kingisdead.audio.v1';
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

// Small Web Audio doubles exercise public lifecycle behavior, not signal
// processing. Tests run sequentially because the browser globals are shared.
function browser(t, { initialState = 'suspended', saved = null } = {}) {
  const originals = new Map(), contexts = [], listeners = new Set(), sounds = [];
  const timers = new Map(), storage = new Map(saved ? [[STORAGE_KEY, saved]] : []);
  let now = 0, timerId = 0;
  const env = { contexts, timers, listeners, storage, resumeMode: 'resolve' };
  function install(key, value) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  function schedule(fn, delay, interval = false) {
    const id = ++timerId;
    timers.set(id, { fn, at: now + delay, interval: interval ? delay : 0 });
    return id;
  }
  env.advance = async ms => {
    const target = now + ms;
    for (;;) {
      const entry = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!entry) break;
      const [id, timer] = entry;
      now = timer.at;
      if (timer.interval) timer.at += timer.interval; else timers.delete(id);
      timer.fn();
      await flush();
    }
    now = target;
    await flush();
  };
  install('setTimeout', (fn, ms = 0) => schedule(fn, ms));
  install('setInterval', (fn, ms) => schedule(fn, ms, true));
  install('clearTimeout', id => timers.delete(id));
  install('clearInterval', id => timers.delete(id));
  install('localStorage', { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) });
  install('document', {
    hidden: false,
    addEventListener: (_name, fn) => listeners.add(fn),
    removeEventListener: (_name, fn) => listeners.delete(fn),
  });
  env.visibility = hidden => {
    document.hidden = hidden;
    for (const listener of listeners) listener();
  };
  const parameter = () => ({
    value: 0, setValueAtTime() {}, linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {}, cancelAndHoldAtTime() {},
  });
  class Context {
    constructor() {
      this.state = initialState; this.sampleRate = 12000; this.currentTime = 0;
      this.destination = {}; this.nodes = []; this.started = 0; this.resumeCalls = 0;
      contexts.push(this);
    }
    node() {
      const node = {
        connections: new Set(),
        connect(target) { this.connections.add(target); },
        disconnect() { this.connections.clear(); },
        start: () => { this.started++; }, stop() {}, setPeriodicWave() {},
      };
      for (const key of ['gain', 'frequency', 'detune', 'playbackRate', 'Q', 'threshold', 'knee', 'ratio', 'attack', 'release']) node[key] = parameter();
      this.nodes.push(node);
      return node;
    }
    createGain() { return this.node(); }
    createOscillator() { return this.node(); }
    createBufferSource() { return this.node(); }
    createBiquadFilter() { return this.node(); }
    createDynamicsCompressor() { return this.node(); }
    createConvolver() { return this.node(); }
    createPeriodicWave() { return {}; }
    createBuffer(channels, length) {
      const samples = Array.from({ length: channels }, () => new Float32Array(length));
      return { getChannelData: channel => samples[channel] };
    }
    setState(state) { this.state = state; this.onstatechange?.(); }
    resume() {
      this.resumeCalls++;
      if (env.resumeMode === 'reject') return Promise.reject(new Error('Playback blocked'));
      if (env.resumeMode === 'pending') return new Promise(() => {});
      this.setState('running');
      return Promise.resolve();
    }
    suspend() { this.setState('suspended'); return Promise.resolve(); }
    close() { this.setState('closed'); return Promise.resolve(); }
  }
  install('AudioContext', Context);
  install('webkitAudioContext', undefined);
  env.create = options => { const sound = createAudio(options); sounds.push(sound); return sound; };
  env.dispose = async sound => { const done = sound.dispose(); await env.advance(60); await done; };
  t.after(async () => {
    try { for (const sound of sounds) await env.dispose(sound); }
    finally {
      for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    }
  });
  return env;
}

test('audio creates no context or sound before an explicit unlock', async t => {
  const env = browser(t), sound = env.create();
  assert.deepEqual([sound.getState().music, sound.getState().sfx, sound.getState().volume], [false, true, .35]);
  sound.setMusic(true); sound.setSfx(true); sound.setVolume(.6);
  env.visibility(true); env.visibility(false);
  assert.equal(sound.play('select'), false);
  assert.equal(env.contexts.length, 0);
  assert.equal(sound.getState().status, 'locked');
  assert.equal(await sound.unlock(), true);
  assert.equal(env.contexts.length, 1);
  assert.equal(sound.getState().playing, true);
});

test('preferences persist, clamp volume, and cannot autoplay a restored opt-in', t => {
  const env = browser(t), sound = env.create();
  sound.setMusic(true); sound.setSfx(false); sound.setVolume(2);
  assert.deepEqual(JSON.parse(env.storage.get(STORAGE_KEY)), { music: true, sfx: false, volume: 1 });
  const restored = env.create();
  assert.deepEqual([restored.getState().music, restored.getState().sfx, restored.getState().volume], [true, false, 1]);
  assert.equal(restored.getState().unlocked, false);
  assert.equal(env.contexts.length, 0);
  restored.setVolume('invalid');
  assert.equal(restored.getState().volume, 1);
});

for (const initialState of ['running', 'suspended']) {
  test(`the first click starts music with duplicate unlock handlers (${initialState} context)`, async t => {
    const env = browser(t, { initialState }), sound = env.create();
    // Capture handler and button handler run in the SAME event, with no await.
    const first = sound.unlock();
    const second = sound.unlock();
    sound.setMusic(true);
    if (initialState === 'running') assert.equal(sound.getState().playing, true);
    assert.deepEqual(await Promise.all([first, second]), [true, true]);
    assert.equal(env.contexts.length, 1);
    assert.equal(sound.getState().playing, true);
    assert.ok(env.contexts[0].started > 0);
  });
}

test('blocked playback returns false and can be retried by another gesture', async t => {
  const env = browser(t), sound = env.create();
  env.resumeMode = 'reject';
  assert.equal(await sound.unlock(), false);
  assert.equal(sound.getState().status, 'blocked');
  assert.equal(sound.play('card'), false);
  env.resumeMode = 'resolve';
  assert.equal(await sound.unlock(), true);
  assert.equal(sound.play('card'), true);
  assert.equal(env.contexts.length, 1);
});

test('a browser resume that never settles times out and disposal cancels a retry', async t => {
  const env = browser(t), sound = env.create();
  env.resumeMode = 'pending';
  const first = sound.unlock();
  await env.advance(1600);
  assert.equal(await first, false);
  assert.equal(sound.getState().status, 'blocked');
  const retry = sound.unlock();
  await env.dispose(sound);
  assert.equal(await retry, false);
  assert.equal(sound.getState().status, 'disposed');
  assert.equal(env.contexts[0].state, 'closed');
  assert.equal(env.timers.size, 0);
  assert.equal(env.listeners.size, 0);
});

test('visibility pauses and resumes unlocked music; disposal disconnects and cleans up', async t => {
  const env = browser(t), sound = env.create();
  sound.setMusic(true);
  await sound.unlock();
  const context = env.contexts[0];
  env.visibility(true);
  await env.advance(100);
  assert.equal(context.state, 'suspended');
  assert.equal(sound.getState().playing, false);
  assert.equal(sound.play('select'), false);
  assert.equal(env.timers.size, 0);
  env.visibility(false);
  await flush();
  assert.equal(context.state, 'running');
  assert.equal(sound.getState().playing, true);
  await env.dispose(sound);
  assert.equal(context.state, 'closed');
  assert.equal(sound.play('select'), false);
  assert.equal(env.timers.size, 0);
  assert.equal(env.listeners.size, 0);
  assert.ok(context.nodes.every(node => node.connections.size === 0));
});

test('switching back while suspend is pending resumes according to current visibility', async t => {
  const env = browser(t), sound = env.create();
  await sound.unlock();
  const context = env.contexts[0];
  let finishSuspend;
  context.suspend = () => new Promise(resolve => {
    finishSuspend = () => { context.setState('suspended'); resolve(); };
  });
  env.visibility(true);
  await env.advance(100);
  env.visibility(false);
  finishSuspend();
  await flush();
  assert.equal(context.state, 'running');
  assert.equal(sound.getState().status, 'ready');
});
