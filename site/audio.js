/**
 * Original procedural coastal soundtrack and tabletop sound effects.
 * No samples, downloads, third-party dependencies, or reference melodies.
 *
 * Integration:
 *   const sound = createAudio({ onChange: state => renderAudioControls(state) });
 *   // Invoke unlock directly from a pointer/keyboard handler, never on page load.
 *   await sound.unlock();
 *   sound.setMusic(true); // Explicit opt-in. Saved preference alone cannot autoplay.
 *   sound.play('card');
 *   // On teardown: await sound.dispose();
 *
 * Music: 24 bars at 80 BPM (72 seconds), four composed six-bar phrases in
 * D Dorian. Plucked strings use a small Karplus-Strong model, the flute has
 * breath and delayed vibrato, and harmony/surf provide a quiet continuous bed.
 */
const STORAGE_KEY = 'kingisdead.audio.v1';
const BPM = 80;
const BEAT = 60 / BPM;
const LOOP_SECONDS = 24 * 4 * BEAT;
const MAX_VOICES = 32;
const CUES = new Set(['select', 'card', 'recruit', 'pass', 'resolve', 'win']);
const frequency = midi => 440 * 2 ** ((midi - 69) / 12);
const clamp = value => Math.max(0, Math.min(1, value));

function randomFrom(seed) {
  let n = seed >>> 0;
  return () => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return n / 4294967296;
  };
}

function compose() {
  // Bass plus close upper voices. Inversions keep the harmony moving gently.
  const voicings = [
    [38, 53, 57, 64], [41, 53, 57, 62], [36, 52, 55, 62],
    [43, 50, 55, 59], [38, 53, 57, 64], [45, 52, 55, 60],
    [38, 50, 57, 65], [36, 52, 55, 62], [43, 50, 59, 64],
    [41, 53, 57, 60], [40, 52, 55, 62], [38, 53, 57, 62],
    [41, 52, 57, 60], [36, 52, 55, 62], [43, 50, 55, 59],
    [38, 53, 57, 64], [45, 52, 55, 60], [43, 50, 55, 64],
    [38, 53, 57, 62], [41, 53, 57, 62], [36, 52, 55, 62],
    [43, 50, 55, 59], [45, 52, 55, 60], [38, 50, 57, 64],
  ];
  // [beat within bar, pitch, length in beats]. Deliberate rests are part of
  // the melody; the last breath falls away before the first phrase returns.
  const melody = [
    [[1.5, 69, 1.25]], [[0, 72, 1.5], [2.25, 69, 1.25]],
    [[.5, 67, 2.5]], [[1, 64, 2]],
    [[.5, 65, 1], [2, 64, .75], [3, 62, .75]], [],
    [[1, 74, 1.5], [3, 72, .75]], [[0, 69, 2]],
    [[1, 71, 1], [2.5, 69, 1]], [[.5, 67, 1.25], [2.5, 65, 1]],
    [[1, 64, 2]], [[0, 62, 2.75]],
    [[1.5, 69, .75], [2.5, 72, 1]], [[.5, 74, 2]],
    [[0, 71, 1.5], [2.5, 67, 1]], [[1, 69, 2]],
    [[.5, 67, 1.25], [2.5, 64, 1]], [],
    [[.5, 65, 1], [2, 69, 1.5]], [[1, 72, 2]],
    [[.5, 67, 1.5], [2.5, 64, 1]], [[1, 62, 1], [2.5, 64, 1]],
    [[0, 65, 1.5], [2, 64, 1]], [[.5, 62, 2.5]],
  ];
  const events = [];
  const add = (instrument, beat, midi, length, level) => events.push({
    instrument, at: beat * BEAT, midi, duration: length * BEAT, level,
  });
  voicings.forEach((chord, bar) => {
    const at = bar * 4;
    const phrase = Math.floor(bar / 6);
    const swell = [0.85, 1, 0.94, 0.88][phrase];
    // Slow harmony has changing inversions, not an endlessly repeated arp.
    chord.slice(1).forEach((midi, i) => add('harmony', at + i * .018, midi - 12, 4.5, .022 * swell));
    add('string', at + .035, chord[0], 3.7, .115 * swell);
    const pattern = bar % 3;
    if (pattern === 0) {
      add('string', at + 1.35, chord[1], 1.75, .073);
      add('string', at + 2.55, chord[3], 1.3, .067);
      add('string', at + 3.3, chord[2], .65, .048);
    } else if (pattern === 1) {
      add('string', at + .82, chord[2], 2.3, .069);
      add('string', at + 2.1, chord[1], 1.8, .063);
      add('string', at + 2.15, chord[3], 1.7, .047);
    } else {
      add('string', at + 1.05, chord[3], 2.6, .066);
      add('string', at + 2.8, chord[2], 1.1, .061);
    }
    // Occasional quiet, rolled cadences distinguish the phrase endings.
    if (bar % 6 === 5) {
      chord.slice(1).forEach((midi, i) => add('string', at + 3 + i * .075, midi, .9, .039));
    }
    melody[bar].forEach(([beat, midi, length]) => add('flute', at + beat + .035, midi, length, .084 * swell));
  });
  return events.sort((a, b) => a.at - b.at);
}
const COMPOSITION = compose();

export function createAudio({ onChange = () => {} } = {}) {
  const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
  const documentRef = globalThis.document;
  let preferences = { music: false, sfx: true, volume: .35 };
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      if (typeof saved.music === 'boolean') preferences.music = saved.music;
      if (typeof saved.sfx === 'boolean') preferences.sfx = saved.sfx;
      if (typeof saved.volume === 'number' && Number.isFinite(saved.volume)) preferences.volume = clamp(saved.volume);
    }
  } catch { /* Storage may be blocked or an older preference malformed. */ }

  let context = null, master = null, musicBus = null, effectsBus = null;
  let noise = null, fluteWave = null;
  let unlocked = false, disposed = false, blocked = false;
  let unlockPromise = null, resumePromise = null;
  let scheduler = null, suspendTimer = null, shutdownTimer = null;
  let musicRunning = false, musicOrigin = 0, resumeOffset = 0, cursor = 0, cycle = 0;
  let nextVoice = 0;
  const voices = new Map();
  const stringBuffers = new Map();
  const graphNodes = [];
  const lastCue = new Map();
  const resumeWaits = new Map();
  const hidden = () => documentRef?.hidden === true;
  const enabled = () => preferences.volume > 0 && (preferences.music || preferences.sfx);

  function getState() {
    const supported = typeof Context === 'function';
    return {
      ...preferences, supported, unlocked,
      playing: musicRunning && context?.state === 'running' && !hidden(),
      status: disposed ? 'disposed' : !supported ? 'unsupported' : blocked ? 'blocked'
        : !unlocked ? 'locked' : hidden() || context?.state === 'suspended' ? 'suspended'
        : musicRunning ? 'playing' : 'ready',
    };
  }
  function notify() {
    try { onChange(getState()); } catch { /* A UI callback cannot break audio. */ }
  }
  function persist() {
    try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(preferences)); } catch {}
  }
  function ramp(parameter, value, seconds = .045) {
    if (!context || !parameter) return;
    const now = context.currentTime;
    try {
      if (parameter.cancelAndHoldAtTime) parameter.cancelAndHoldAtTime(now);
      else {
        const current = parameter.value;
        parameter.cancelScheduledValues(now);
        parameter.setValueAtTime(current, now);
      }
      parameter.linearRampToValueAtTime(value, now + seconds);
    } catch { /* A closing or interrupted context may reject automation. */ }
  }
  function disconnect(node) {
    try { node.disconnect(); } catch {}
  }
  function removeVoice(voice) {
    if (!voices.has(voice.id)) return;
    voices.delete(voice.id);
    for (const source of voice.sources) source.onended = null;
    for (const node of voice.nodes) disconnect(node);
  }
  function stopVoice(voice, fade = .045) {
    if (!context || voice.stopping) return;
    voice.stopping = true;
    const end = context.currentTime + fade;
    ramp(voice.gain.gain, 0, fade);
    voice.end = Math.min(voice.end, end);
    for (const source of voice.sources) {
      try { source.stop(end + .008); } catch {}
    }
  }
  function pruneVoices() {
    if (!context) return;
    for (const voice of voices.values()) {
      if (voice.end < context.currentTime - .1) removeVoice(voice);
    }
  }
  function voice(kind, at, duration, level, attack = .008, release = .07, decays = false) {
    if (!context || disposed || context.state !== 'running') return null;
    pruneVoices();
    if (voices.size >= MAX_VOICES) return null; // Drop excess notes without clicks.
    at = Math.max(at, context.currentTime + .002);
    duration = Math.max(.04, duration);
    const gain = context.createGain();
    gain.connect(kind === 'music' ? musicBus : effectsBus);
    const end = at + duration;
    attack = Math.min(attack, duration * .25);
    release = Math.min(release, duration * .45);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + attack);
    if (decays) {
      gain.gain.exponentialRampToValueAtTime(.0001, end - .003);
    } else {
      gain.gain.setValueAtTime(level, end - release);
    }
    gain.gain.linearRampToValueAtTime(0, end);
    const item = { id: ++nextVoice, kind, gain, at, end, nodes: [gain], sources: [], stopping: false };
    voices.set(item.id, item);
    return item;
  }
  function sourceFor(item, source, destination = item.gain) {
    source.connect(destination);
    item.nodes.push(source);
    item.sources.push(source);
    source.onended = () => {
      // Every source is stopped at the same end; an exhausted string buffer can
      // finish naturally before its scheduled stop and is also safe to remove.
      if (item.sources.every(s => s === source || s._kingEnded)) removeVoice(item);
      source._kingEnded = true;
    };
    source.start(item.at);
    source.stop(item.end + .012);
    return source;
  }
  function oscillator(item, type, hz, gainLevel = 1, cents = 0) {
    const oscillator = context.createOscillator();
    const level = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(hz, item.at);
    oscillator.detune.setValueAtTime(cents, item.at);
    level.gain.value = gainLevel;
    level.connect(item.gain);
    item.nodes.push(level);
    sourceFor(item, oscillator, level);
    return oscillator;
  }

  function makeNoise() {
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * 2), context.sampleRate);
    const data = buffer.getChannelData(0), random = randomFrom(0x5ea71de);
    for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1;
    return buffer;
  }
  function stringBuffer(midi) {
    const key = Math.round(midi);
    if (stringBuffers.has(key)) return stringBuffers.get(key);
    const hz = frequency(key), period = Math.max(8, Math.round(context.sampleRate / hz - .5));
    const line = new Float32Array(period), random = randomFrom(key * 9173 + 17);
    let mean = 0;
    for (let i = 0; i < period; i++) { line[i] = (random() * 2 - 1) * .7; mean += line[i]; }
    mean /= period;
    for (let i = 0; i < period; i++) line[i] -= mean;
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * 2.6), context.sampleRate);
    const samples = buffer.getChannelData(0);
    const damping = .994;
    let index = 0;
    for (let i = 0; i < samples.length; i++) {
      const next = (index + 1) % period;
      const sample = (line[index] + line[next]) * .5 * damping;
      line[index] = sample;
      samples[i] = sample;
      index = next;
    }
    const result = { buffer, tuning: hz / (context.sampleRate / (period + .5)) };
    if (stringBuffers.size >= 32) stringBuffers.delete(stringBuffers.keys().next().value);
    stringBuffers.set(key, result);
    return result;
  }
  function pluck(kind, at, midi, duration, level) {
    const item = voice(kind, at, Math.min(duration, 2.5), level, .004, .06);
    if (!item) return;
    const instrument = stringBuffer(midi);
    const source = context.createBufferSource();
    source.buffer = instrument.buffer;
    source.playbackRate.value = instrument.tuning * 2 ** ((midi - Math.round(midi)) / 12);
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3600, item.at);
    filter.frequency.exponentialRampToValueAtTime(950, item.end);
    filter.Q.value = .3;
    filter.connect(item.gain);
    item.nodes.push(filter);
    sourceFor(item, source, filter);
  }
  function harmony(at, midi, duration, level) {
    const item = voice('music', at, duration, level, .45, .7);
    if (!item) return;
    oscillator(item, 'triangle', frequency(midi), .75, -2.5);
    oscillator(item, 'sine', frequency(midi), .23, 2.5);
    oscillator(item, 'sine', frequency(midi) * 2, .055);
  }
  function breath(kind, at, duration, level, center = 900) {
    const item = voice(kind, at, duration, level, .008, .06, true);
    if (!item) return;
    const source = context.createBufferSource(), filter = context.createBiquadFilter();
    source.buffer = noise;
    filter.type = 'bandpass';
    filter.frequency.value = center;
    filter.Q.value = .55;
    filter.connect(item.gain);
    item.nodes.push(filter);
    sourceFor(item, source, filter);
  }
  function flute(at, midi, duration, level) {
    const item = voice('music', at, duration, level, .09, .16);
    if (!item) return;
    const tone = context.createOscillator(), vibrato = context.createOscillator();
    const depth = context.createGain();
    tone.setPeriodicWave(fluteWave);
    tone.frequency.value = frequency(midi);
    vibrato.frequency.value = 4.7;
    depth.gain.setValueAtTime(0, item.at);
    depth.gain.linearRampToValueAtTime(4.5, Math.min(item.at + .4, item.end));
    depth.connect(tone.detune);
    item.nodes.push(depth);
    sourceFor(item, vibrato, depth);
    sourceFor(item, tone);
    // Low, filtered breath is quiet enough to stay behind the pitched voice.
    breath('music', item.at + .02, Math.min(duration, .42), level * .09, 1400);
  }
  function wood(at, hz, level, duration = .13) {
    const item = voice('sfx', at, duration, level, .002, .045, true);
    if (!item) return;
    oscillator(item, 'sine', hz, .35);
    const source = context.createBufferSource(), filter = context.createBiquadFilter();
    source.buffer = noise;
    filter.type = 'bandpass';
    filter.frequency.value = hz * 2.4;
    filter.Q.value = 1.8;
    filter.connect(item.gain);
    item.nodes.push(filter);
    sourceFor(item, source, filter);
  }
  function ocean(at) {
    // A shared looped noise buffer, gently filtered and swelled, rather than a
    // large recording or dozens of independently scheduled ambient voices.
    const item = voice('music', at, 3600, .011, .8, .8);
    if (!item) return;
    const source = context.createBufferSource(), filter = context.createBiquadFilter();
    const swell = context.createOscillator(), depth = context.createGain(), motion = context.createGain();
    source.buffer = noise;
    source.loop = true;
    filter.type = 'lowpass';
    filter.frequency.value = 720;
    filter.Q.value = .3;
    filter.connect(motion);
    motion.connect(item.gain);
    motion.gain.value = .7;
    swell.frequency.value = 1 / 11;
    depth.gain.value = .27;
    depth.connect(motion.gain);
    item.nodes.push(filter, depth, motion);
    sourceFor(item, source, filter);
    sourceFor(item, swell, depth);
  }

  function initialize() {
    context = new Context();
    master = context.createGain();
    musicBus = context.createGain();
    effectsBus = context.createGain();
    const compressor = context.createDynamicsCompressor();
    const reverb = context.createConvolver(), wet = context.createGain();
    compressor.threshold.value = -18;
    compressor.knee.value = 16;
    compressor.ratio.value = 2.5;
    compressor.attack.value = .012;
    compressor.release.value = .22;
    master.gain.value = preferences.volume;
    musicBus.gain.value = 0;
    effectsBus.gain.value = preferences.sfx ? .75 : 0;
    wet.gain.value = .19;
    musicBus.connect(compressor);
    musicBus.connect(reverb);
    reverb.connect(wet);
    wet.connect(compressor);
    effectsBus.connect(compressor);
    compressor.connect(master);
    master.connect(context.destination);
    graphNodes.push(musicBus, effectsBus, compressor, reverb, wet, master);

    const impulse = context.createBuffer(2, Math.ceil(context.sampleRate * 1.65), context.sampleRate);
    const random = randomFrom(0x1a3ba5);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < data.length; i++) {
        // A small room/wooden hall: diffuse and dark, with no huge wash.
        const fade = (1 - i / data.length) ** 3.2;
        data[i] = (random() * 2 - 1) * fade * .24;
      }
    }
    reverb.buffer = impulse;
    noise = makeNoise();
    fluteWave = context.createPeriodicWave(
      new Float32Array(5), new Float32Array([0, 1, .17, .038, .012]),
    );
    context.onstatechange = () => {
      if (disposed) return;
      if (context.state === 'running') blocked = false;
      if (context.state !== 'running') stopMusic();
      notify();
    };
  }

  function pump() {
    if (!musicRunning || !context || context.state !== 'running' || hidden()) return;
    pruneVoices();
    const now = context.currentTime, horizon = now + .32;
    let guard = 0;
    while (guard++ < 80) {
      const event = COMPOSITION[cursor];
      const at = musicOrigin + cycle * LOOP_SECONDS + event.at;
      if (at > horizon) break;
      if (at >= now - .04) {
        if (event.instrument === 'string') pluck('music', at, event.midi, event.duration, event.level);
        else if (event.instrument === 'flute') flute(at, event.midi, event.duration, event.level);
        else harmony(at, event.midi, event.duration, event.level);
      }
      if (++cursor === COMPOSITION.length) { cursor = 0; cycle++; }
    }
  }
  function safePump() {
    try { pump(); }
    catch {
      stopMusic();
      blocked = true;
      notify();
    }
  }
  function startMusic() {
    if (musicRunning || !context || context.state !== 'running' || !unlocked
      || hidden() || !preferences.music || preferences.volume === 0) return;
    musicRunning = true;
    musicOrigin = context.currentTime + .08 - resumeOffset;
    cycle = 0;
    cursor = COMPOSITION.findIndex(event => event.at >= resumeOffset);
    if (cursor < 0) { cursor = 0; cycle = 1; }
    ramp(musicBus.gain, .65, .5);
    ocean(context.currentTime + .02);
    safePump();
    if (musicRunning) scheduler = setInterval(safePump, 100);
  }
  function stopMusic() {
    if (!context) return;
    if (musicRunning) resumeOffset = Math.max(0, context.currentTime - musicOrigin) % LOOP_SECONDS;
    musicRunning = false;
    clearInterval(scheduler);
    scheduler = null;
    ramp(musicBus?.gain, 0, .065);
    for (const item of voices.values()) if (item.kind === 'music') stopVoice(item, .06);
  }
  function requestResume(instance) {
    return new Promise((resolve, reject) => {
      // Some blocked/embedded browsers leave resume() pending rather than
      // rejecting it. Keep a failed unlock bounded and safe to retry.
      const timer = setTimeout(() => finish(new Error('Audio resume was blocked.')), 1500);
      const finish = error => {
        if (!resumeWaits.has(timer)) return;
        clearTimeout(timer);
        resumeWaits.delete(timer);
        if (error) reject(error); else resolve();
      };
      resumeWaits.set(timer, finish);
      try { Promise.resolve(instance.resume()).then(() => finish(), finish); }
      catch (error) { finish(error); }
    });
  }
  async function resumeExisting() {
    if (!context || disposed || !unlocked || hidden() || !enabled()) return false;
    if (resumePromise) return resumePromise;
    const instance = context;
    const pending = (async () => {
      try {
        if (instance.state !== 'running') await requestResume(instance);
        if (disposed || instance !== context || hidden() || !enabled()) return false;
        blocked = instance.state !== 'running';
        if (!blocked) startMusic();
        notify();
        return !blocked;
      } catch {
        if (!disposed) { stopMusic(); blocked = true; notify(); }
        return false;
      }
    })();
    resumePromise = pending;
    void pending.then(() => { if (resumePromise === pending) resumePromise = null; });
    return pending;
  }
  function sync() {
    if (disposed || !context || !unlocked) return;
    clearTimeout(suspendTimer);
    suspendTimer = null;
    ramp(master.gain, preferences.volume);
    ramp(effectsBus.gain, preferences.sfx ? .75 : 0);
    if (!preferences.sfx) for (const item of voices.values()) if (item.kind === 'sfx') stopVoice(item);
    if (hidden() || !enabled()) {
      stopMusic();
      for (const item of voices.values()) stopVoice(item, .055);
      // Fade before suspension; the continuation rechecks current preferences.
      suspendTimer = setTimeout(() => {
        suspendTimer = null;
        if (!disposed && context && (hidden() || !enabled())) {
          Promise.resolve(context.suspend()).catch(() => {}).then(() => {
            // A fast tab switch may reverse visibility while suspend is still
            // pending. Reconcile that completed operation with current intent.
            if (!disposed && unlocked && !hidden() && enabled()) void resumeExisting();
            notify();
          });
        }
      }, 80);
    } else {
      if (!preferences.music) stopMusic();
      // A preference can change during the same click that unlocked audio.
      // Reconcile immediately instead of waiting on an already-resolved resume.
      if (context.state === 'running') { blocked = false; startMusic(); }
      else void resumeExisting();
    }
  }
  async function unlock() {
    if (disposed || typeof Context !== 'function' || hidden()) { notify(); return false; }
    if (unlockPromise) return unlockPromise;
    const pending = (async () => {
      try {
        if (!context || context.state === 'closed') initialize();
        // This call happens directly in the explicit gesture's call stack.
        if (context.state !== 'running') await requestResume(context);
        if (disposed) return false;
        unlocked = context.state === 'running';
        blocked = !unlocked;
        if (unlocked) sync();
        notify();
        return unlocked;
      } catch {
        blocked = true;
        notify();
        return false;
      }
    })();
    unlockPromise = pending;
    void pending.then(() => { if (unlockPromise === pending) unlockPromise = null; });
    return pending;
  }
  function setMusic(value) {
    if (disposed) return getState();
    preferences.music = value === true;
    persist(); sync(); notify();
    return getState();
  }
  function setSfx(value) {
    if (disposed) return getState();
    preferences.sfx = value === true;
    persist(); sync(); notify();
    return getState();
  }
  function setVolume(value) {
    if (disposed || !Number.isFinite(Number(value))) return getState();
    preferences.volume = clamp(Number(value));
    persist(); sync(); notify();
    return getState();
  }
  function play(cue) {
    if (!CUES.has(cue) || disposed || !unlocked || !preferences.sfx
      || preferences.volume === 0 || hidden() || context?.state !== 'running') return false;
    const at = context.currentTime + .008;
    const gap = cue === 'win' ? 1.5 : .04;
    if (at - (lastCue.get(cue) ?? -Infinity) < gap) return false;
    lastCue.set(cue, at);
    try {
      if (cue === 'select') pluck('sfx', at, 69, .15, .12);
      else if (cue === 'card') {
        breath('sfx', at, .14, .067, 1700);
        wood(at + .024, 260, .065, .11);
      } else if (cue === 'recruit') {
        pluck('sfx', at, 62, .3, .15);
        pluck('sfx', at + .09, 69, .34, .105);
      } else if (cue === 'pass') {
        breath('sfx', at, .18, .045, 460);
        pluck('sfx', at + .018, 50, .19, .09);
      } else if (cue === 'resolve') {
        [50, 57, 62].forEach((midi, i) => pluck('sfx', at + i * .055, midi, .65, .12 - i * .015));
      } else if (cue === 'win') {
        [62, 65, 69, 74].forEach((midi, i) => pluck('sfx', at + i * .18, midi, 1.3, .13 - i * .012));
        [50, 57].forEach((midi, i) => pluck('sfx', at + .62 + i * .04, midi, 1.8, .11));
      }
      return true;
    } catch {
      // SFX must never prevent a game command from completing.
      return false;
    }
  }
  function onVisibility() {
    if (!unlocked || disposed) return;
    sync();
    notify();
  }
  documentRef?.addEventListener?.('visibilitychange', onVisibility);

  async function dispose() {
    if (disposed) return;
    disposed = true;
    documentRef?.removeEventListener?.('visibilitychange', onVisibility);
    clearInterval(scheduler);
    clearTimeout(suspendTimer);
    clearTimeout(shutdownTimer);
    scheduler = null;
    musicRunning = false;
    for (const finish of [...resumeWaits.values()]) finish(new Error('Audio disposed.'));
    const instance = context;
    if (instance) {
      instance.onstatechange = null;
      ramp(master?.gain, 0, .035);
      for (const item of voices.values()) stopVoice(item, .03);
      // Awaitable cleanup permits a short release rather than a hard cut.
      if (instance.state === 'running') await new Promise(resolve => {
        shutdownTimer = setTimeout(resolve, 45);
      });
      for (const item of [...voices.values()]) removeVoice(item);
      for (const node of graphNodes) disconnect(node);
      try { await instance.close(); } catch {}
    }
    clearTimeout(shutdownTimer);
    shutdownTimer = null;
    stringBuffers.clear();
    lastCue.clear();
    noise = null;
    fluteWave = null;
    context = null;
    graphNodes.length = 0;
    notify();
  }
  return { unlock, setMusic, setSfx, setVolume, play, getState, dispose };
}
