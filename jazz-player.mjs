// SPDX-License-Identifier: GPL-3.0-only
import { DJ_NOTES, DJ_STYLES, DJRandom, djClamp, djMakeBank } from './jazz-core.mjs?v=2';
import { djShuffleSettings } from './jazz-settings.mjs';
import { createJazzCastUI } from './jazz-cast.mjs';
import { createJazzBandUI } from './jazz-band-ui.mjs';
import { createJazzNamingUI } from './jazz-name-ui.mjs?v=2';
import { parseJazzDotVoice } from './jazz-dot-voices.mjs';
import { JAZZ_DEFAULT_SETTINGS, validateJazzArrangement } from './jazz-radio-contract.mjs';
import { chordReceipt, downloadReceipt, encodeJazzWave, loadLearnedProgressions, readLegacyProgressions, rememberNamedProgression, savePassage, showPassages, syncPassage } from './jazz-library.mjs?v=2';
import { jazzSiteConnected } from './jazz-site.mjs?v=2';
import { tickAt } from './core.mjs';

(() => {
  const $ = id => document.getElementById(id), storageKey = 'doodle-jazz-browser-v1';
  const parts = ['piano', 'bass', 'drums'];
  const defaults = { ...JAZZ_DEFAULT_SETTINGS, volume: 45, muted: false, night: false, neverStop: false,
    voice: false, trackMutes: { piano: false, bass: false, drums: false } };
  const prefs = { ...defaults, trackMutes: { ...defaults.trackMutes } };
  let favoriteProgressions = readLegacyProgressions();
  let assignments = {};
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey));
    if (stored && typeof stored === 'object') {
      if (Object.hasOwn(DJ_STYLES, stored.style)) prefs.style = stored.style;
      for (const [id, lo, hi] of [['tempo',55,180],['swing',50,72],['volume',0,100],['room',0,100],['piano',0,100],['bass',0,100],['drums',0,100]]) {
        if (Number.isFinite(stored[id])) prefs[id] = djClamp(stored[id], lo, hi);
      }
      for (const id of ['muted', 'night', 'neverStop', 'voice']) if (typeof stored[id] === 'boolean') prefs[id] = stored[id];
      for (const id of parts) if (typeof stored.trackMutes?.[id] === 'boolean') prefs.trackMutes[id] = stored.trackMutes[id];
      Object.assign(prefs, validateJazzArrangement(stored));
    }
  } catch (_) { /* Playback also works when browser storage is unavailable. */ }
  try {
    const stored = JSON.parse(localStorage.getItem('jazz-player-voices'));
    if (stored) for (const part of parts) if (stored[part]) assignments[part] = parseJazzDotVoice(stored[part]);
  } catch {}
  const save = () => { try { localStorage.setItem(storageKey, JSON.stringify(prefs)); } catch {} };
  let context = null, node = null, master = null, wet = null, analyser = null, bank = null;
  let state = 'idle', busy = false, sessionToken = 0, seed = freshSeed(), meterData;
  let pendingChange = false;
  let lastInfo = null;
  let pendingShuffle = null, previousSettings = null;
  let nextShuffleAt = 3600, capturePending = false, chordHistory = [];
  let voiceBusy = false, lastVoiceAt = null, voiceError = null;
  const snapshots = new Map();
  const naming = createJazzNamingUI({
    getPlayback: () => ({ session: sessionToken, state, info: state === 'playing' ? lastInfo : null }),
    getSnapshot: () => new Promise((resolve, reject) => {
      if (!node || state !== 'playing') { reject(new Error('Play Jazz before naming this set.')); return; }
      const id = crypto.randomUUID();
      const timeout = setTimeout(() => {
        snapshots.delete(id);
        reject(new Error('Let the trio play for a moment, then try again.'));
      }, 3000);
      snapshots.set(id, { resolve, reject, timeout });
      node.port.postMessage({ nameSnapshot: id });
    }),
    applyResult(id, result, info) {
      node?.port.postMessage({ jazzPart: { requestId: id, result, targetSet: info.set, targetSeed: info.seed } });
    },
    async rememberResult(id, musicalContext, result) {
      learn(await rememberNamedProgression(id, musicalContext, result));
    }
  });
  const casting = createJazzCastUI({ getPlayback: () => state, getSource: () => {
    if (!context || !analyser || state !== 'playing') throw new Error('Play Jazz before casting.');
    const sourceNode = analyser, destination = context.createMediaStreamDestination();
    sourceNode.connect(destination);
    return { stream: destination.stream, release() { try { sourceNode.disconnect(destination); } catch {} } };
  } });
  const getStation = () => ({
    running: state === 'playing',
    info: lastInfo,
    voice: prefs.voice,
    learning: { patterns: favoriteProgressions.length, likes: favoriteProgressions.reduce((sum, entry) => sum + entry.weight, 0) },
    playerVoices: { parts: assignments },
    voiceStatus: { busy: voiceBusy, currentStage: voiceBusy, lastSuccessAt: lastVoiceAt, error: voiceError }
  });
  const band = createJazzBandUI({
    getSettings: () => prefs,
    getStation,
    changeSettings(patch) {
      Object.assign(prefs, validateJazzArrangement({ ...prefs, ...patch }));
      paintPrefs();
      save();
      composition(patch);
    },
    request: async () => ({ assignments }),
    async action(name, data) {
      if (name === 'voice-test') {
        announce('You are listening to Doodle Jazz. The Doodle Clock color is ' + spokenColor());
        return;
      }
      if (name === 'player-voice') {
        const next = { ...assignments, [data.part]: data.voice ? parseJazzDotVoice(data.voice) : null };
        const nextBank = await prepareBank(next);
        try { localStorage.setItem('jazz-player-voices', JSON.stringify(next)); }
        catch { throw new Error('Browser storage is unavailable. The original voice assignment was kept.'); }
        assignments = next;
        bank = nextBank;
        node?.port.postMessage({ bank });
      }
    }
  });
  function prepareBank(voices) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./jazz-voice-worker.mjs', import.meta.url), { type: 'module' });
      const timer = setTimeout(() => finish(null, 'The sound took too long to prepare. Try a simpler sound.'), 20000);
      function finish(result, error) {
        clearTimeout(timer);
        worker.terminate();
        if (error) reject(new Error(error));
        else resolve(result);
      }
      worker.onmessage = ({ data }) => finish(data.bank, data.error);
      worker.onerror = () => finish(null, 'This browser could not prepare the Dot Wave sound.');
      worker.postMessage(voices);
    });
  }
  function paintBand() {
    band.paint(getStation(), prefs, state === 'starting');
  }
  function learn(progressions) {
    favoriteProgressions = progressions;
    node?.port.postMessage({ composition: { favoriteProgressions } });
    paintBand();
  }
  function spokenColor() { return tickAt().color.slice(1).split('').join(' '); }
  function paintClock() {
    const { color } = tickAt();
    $('clock-swatch').style.backgroundColor = color;
    $('clock-color').textContent = color;
  }
  function announce(text) {
    if (!prefs.voice || prefs.muted || !prefs.volume || !('speechSynthesis' in window)) return;
    const spokenVoice = speechSynthesis.getVoices().find(voice => voice.localService && /^en\b/i.test(voice.lang));
    if (!spokenVoice) {
      voiceError = 'This browser has no installed English speaking voice.';
      paintBand();
      return;
    }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = spokenVoice;
    utterance.volume = prefs.volume / 100;
    utterance.rate = 0.92;
    voiceBusy = true;
    voiceError = null;
    utterance.onend = () => { voiceBusy = false; lastVoiceAt = Date.now(); paintBand(); };
    utterance.onerror = event => {
      voiceBusy = false;
      if (!['canceled', 'interrupted'].includes(event.error)) voiceError = 'The browser could not play this voice.';
      paintBand();
    };
    speechSynthesis.speak(utterance);
    paintBand();
  }
  function paintKeepsakes() {
    const haveChord = state === 'playing' && chordHistory.length > 0;
    $('dig-this').disabled = !haveChord || chordHistory.length < 5 || capturePending;
    $('chord-receipt').disabled = !haveChord;
    $('chord-trail').textContent = chordHistory.map(value => value.chord).join(' · ');
  }
  async function keepPassage({ chords, samples, sampleRate }) {
    const receipt = chordReceipt(chords, sampleRate);
    const audio = encodeJazzWave(samples, sampleRate);
    try {
      const anchor = chords[4];
      const matches = chord => !chord.beatOnly && chord.style === anchor.style && chord.tonic === anchor.tonic && chord.set === anchor.set;
      let from = 4, to = 5;
      while (from > 0 && matches(chords[from - 1])) from--;
      while (to < chords.length && matches(chords[to])) to++;
      const candidate = anchor.beatOnly ? null : {
        style: anchor.style, tonic: anchor.tonic,
        chords: chords.slice(from, to).map(({ root, quality }) => ({ root, quality }))
      };
      const { entry, progressions } = await savePassage(receipt, audio, candidate);
      learn(progressions);
      const status = $('dig-status');
      status.textContent = candidate ? 'Phrase saved. The band will bring this progression back.' : 'Beat saved in your shelf.';
      void showPassages();
      if (candidate && jazzSiteConnected) {
        void syncPassage(entry).then(learned => {
          status.textContent = learned ? 'Phrase saved and signed on Doodlechain.' : 'Doodlechain signed the phrase. Retry band memory in your shelf.';
          void showPassages();
        }, () => { status.textContent = 'Phrase saved. Use Save to Doodlechain in your shelf to retry signing.'; });
      }
    } catch (error) {
      $('dig-status').textContent = error.message || 'This passage could not be saved in your browser.';
    } finally {
      capturePending = false;
      paintKeepsakes();
      paintBand();
    }
  }
  function freshSeed() { const n = new Uint32Array(1); crypto.getRandomValues(n); return n[0] || 1; }
  function notice(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
  function paintState(next) {
    state = next;
    const playing = next === 'playing';
    document.body.classList.toggle('playing', playing);
    document.body.dataset.audioState = next;
    $('play-text').textContent = playing ? 'Pause jazz' : next === 'starting' ? 'Warming up…' : next === 'paused' ? 'Resume jazz' : 'Play jazz';
    $('play').setAttribute('aria-label', $('play-text').textContent);
    $('play-icon').innerHTML = playing ? '<path d="M5 3h3v14H5Zm7 0h3v14h-3Z"/>' : '<path d="M5 2.7L17 10 5 17.3Z"/>';
    $('play').disabled = next === 'starting' || playing && prefs.neverStop;
    $('stop').disabled = next === 'idle' || prefs.neverStop;
    $('live-label').textContent = playing ? 'ON & ON' : next === 'paused' ? 'TAKING FIVE' : next === 'starting' ? 'TUNING UP' : 'TAKE A SEAT';
    if (!playing) { $('signal').value = 0; document.querySelectorAll('.beat-dots i').forEach(e => e.classList.remove('active')); }
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : next === 'paused' ? 'paused' : 'none';
    naming.playbackChanged();
    paintBand();
    paintKeepsakes();
    casting.playbackChanged();
  }
  function paintPrefs() {
    for (const id of ['volume', 'tempo', 'swing', 'room', 'piano', 'bass', 'drums']) $(id).value = prefs[id];
    for (const id of ['volume', 'swing', 'room']) $(id + '-value').textContent = prefs[id] + '%';
    $('tempo-value').textContent = prefs.tempo;
    $('tempo').setAttribute('aria-valuetext', prefs.tempo + ' beats per minute');
    document.documentElement.classList.toggle('night', prefs.night);
    $('night').setAttribute('aria-pressed', prefs.night);
    $('night').setAttribute('aria-label', prefs.night ? 'Brighten the room' : 'Dim the room');
    $('mute').setAttribute('aria-pressed', prefs.muted);
    $('mute').setAttribute('aria-label', prefs.muted ? 'Unmute jazz' : 'Mute jazz');
    document.querySelectorAll('[data-style]').forEach(e => e.setAttribute('aria-pressed', e.dataset.style === prefs.style));
    $('never-stop').setAttribute('aria-pressed', prefs.neverStop);
    $('never-stop-status').textContent = prefs.neverStop ? 'Playback locked · the trio shuffles every hour.' : '';
    $('voice-updates').checked = prefs.voice;
    paintBand();
    document.querySelectorAll('[data-mute]').forEach(e => {
      const role = e.dataset.mute, muted = prefs.trackMutes[role];
      e.setAttribute('aria-pressed', muted); e.setAttribute('aria-label', (muted ? 'Unmute ' : 'Mute ') + role);
      e.title = e.getAttribute('aria-label'); e.textContent = muted ? '+' : '−';
    });
    if (!context) {
      $('track-name').textContent = DJ_STYLES[prefs.style].name;
      $('track-info').textContent = 'Piano, upright bass & brushes';
      $('chord').textContent = DJ_NOTES[DJ_STYLES[prefs.style].tonic] + (prefs.style === 'bossa' ? 'm9' : prefs.style === 'blues' ? '9' : 'maj9');
    }
  }
  function sendLevels() {
    const levels = {};
    for (const role of ['piano', 'bass', 'drums']) levels[role] = prefs.trackMutes[role] ? 0 : prefs[role] / 100;
    node?.port.postMessage({ levels });
  }
  function masterVolume() {
    if (context && master) master.gain.setTargetAtTime(prefs.muted ? 0 : Math.pow(prefs.volume / 100, 1.7) * 1.25, context.currentTime, 0.025);
    if (prefs.muted || !prefs.volume) window.speechSynthesis?.cancel();
  }
  function composition(change) {
    node?.port.postMessage({ composition: change });
    if (node) { pendingChange = true; notice('The trio will pick up your changes on the next bar.'); }
  }
  function makeRoom(ctx) {
    const length = Math.floor(ctx.sampleRate * 1.05), impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    const rng = new DJRandom(31415);
    for (let channel = 0; channel < 2; channel++) {
      const samples = impulse.getChannelData(channel); let smooth = 0;
      for (let i = 0; i < length; i++) {
        smooth += ((rng.next() * 2 - 1) - smooth) * 0.45;
        samples[i] = smooth * Math.pow(1 - i / length, 3.5) * (i < ctx.sampleRate * 0.015 ? i / (ctx.sampleRate * 0.015) : 1);
      }
    }
    const convolver = ctx.createConvolver(); convolver.buffer = impulse; return convolver;
  }
  function receive(info, token) {
    if (token !== sessionToken || !context) return;
    if (info.nameSnapshot) {
      const pending = snapshots.get(info.nameSnapshot);
      if (pending) {
        clearTimeout(pending.timeout);
        snapshots.delete(info.nameSnapshot);
        if (info.context) pending.resolve(info.context);
        else pending.reject(new Error('Let the trio play for a moment, then try again.'));
      }
      return;
    }
    if (info.partApplied || info.partRejected) { naming.receive(info); return; }
    if (info.sceneApplied) {
      if (info.sceneApplied === pendingShuffle) {
        pendingShuffle = null; pendingChange = false;
        wet?.gain.setTargetAtTime(prefs.room / 100 * 0.45, context.currentTime, 0.05);
        notice('The trio has picked up your new settings.');
        announce('The trio shuffled. ' + DJ_STYLES[prefs.style].name + ', ' + prefs.tempo + ' beats per minute. The Doodle Clock color is ' + spokenColor());
      }
      return;
    }
    if (info.passage) { void keepPassage(info.passage); return; }
    if (info.captureError) {
      capturePending = false;
      $('dig-status').textContent = info.captureError;
      paintKeepsakes();
      return;
    }
    if (!Number.isInteger(info.chordIndex)) return;
    naming.receive(info);
    const previouslyPlaying = lastInfo;
    lastInfo = info;
    if (!previouslyPlaying || previouslyPlaying.set !== info.set) naming.playbackChanged();
    if (chordHistory.at(-1)?.index !== info.chordIndex) {
      chordHistory.push({
        index: info.chordIndex, chord: info.chord, root: info.chordRoot, quality: info.chordQuality,
        style: info.style, key: info.key, frame: Math.round(info.seconds * context.sampleRate)
      });
      if (chordHistory.length > 8) chordHistory.shift();
      paintKeepsakes();
    }
    if (prefs.neverStop && info.seconds >= nextShuffleAt) {
      nextShuffleAt = info.seconds + 3600;
      $('shuffle-settings').click();
    }
    if (pendingChange && info.beat === 0 && info.style === prefs.style && info.tempo === prefs.tempo && Math.abs(info.swing - prefs.swing / 100) < 0.001) {
      pendingChange = false;
      notice('The trio is finding a new way. Stay awhile.');
    }
    $('chord').textContent = info.beatOnly ? 'BEAT' : info.chord;
    $('track-name').textContent = info.namedTitle || DJ_STYLES[info.style].name + ' · ' + info.key;
    $('track-info').textContent = (info.fromFavorite ? 'Saved progression · ' : '') + info.phase + ' / ' + info.tempo + ' BPM';
    $('position').textContent = 'BAR ' + info.bar + '/' + info.bars + ' · CHORUS ' + info.chorus;
    const s = Math.floor(info.seconds), h = Math.floor(s / 3600);
    $('elapsed').textContent = (h ? h + ':' : '') + String(Math.floor(s / 60) % 60).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    if (document.querySelector('.beat-dots').children.length !== info.beatsPerBar) paintBand();
    document.querySelectorAll('.beat-dots i').forEach((e, i) => e.classList.toggle('active', state === 'playing' && i === info.beat));
  }
  async function play() {
    if (busy || state === 'playing') return;
    busy = true;
    const token = sessionToken;
    try {
      if (context) {
        await context.resume();
        if (token !== sessionToken) return;
        if (context.state !== 'running') throw new Error('Playback was interrupted. Press Resume jazz to try again.');
        paintState('playing'); notice('Settle in. The music keeps going until you stop it.');
        return;
      }
      paintState('starting'); notice('Getting the trio together…');
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw new Error('Open Doodle Jazz in a current version of Chrome, Edge, Firefox or Safari.');
      const ctx = new Audio({ latencyHint: 'playback' }); context = ctx;
      // Resume directly from the Play gesture before any asynchronous preparation.
      await ctx.resume();
      if (token !== sessionToken) return;
      if (!ctx.audioWorklet) throw new Error('Open the HTTPS address for Doodle Jazz, then press Play.');
      await ctx.audioWorklet.addModule(new URL('./jazz-worklet.mjs?v=2', import.meta.url));
      if (token !== sessionToken) return;
      if (!bank && parts.some(part => assignments[part])) {
        try { bank = await prepareBank(assignments); }
        catch (error) { $('dot-voice-status').textContent = error.message + ' Playing the original trio voices.'; }
      }
      if (token !== sessionToken) return;
      bank ||= djMakeBank();
      node = new AudioWorkletNode(ctx, 'doodle-jazz', { numberOfInputs: 0, numberOfOutputs: 1,
        outputChannelCount: [2], processorOptions: { bank, config: {
          ...validateJazzArrangement(prefs), seed, style: prefs.style, tempo: prefs.tempo, swing: prefs.swing / 100, favoriteProgressions
        } } });
      node.port.onmessage = e => receive(e.data, token);
      node.onprocessorerror = () => { if (token === sessionToken) { stop(); notice('The trio was interrupted. Press Play jazz to start a fresh session.', true); } };
      master = ctx.createGain(); master.gain.value = 0;
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -12; compressor.knee.value = 10; compressor.ratio.value = 3;
      compressor.attack.value = 0.006; compressor.release.value = 0.18;
      analyser = ctx.createAnalyser(); analyser.fftSize = 512; meterData = new Float32Array(analyser.fftSize);
      const room = makeRoom(ctx); wet = ctx.createGain(); wet.gain.value = prefs.room / 100 * 0.45;
      const dry = ctx.createGain(); dry.gain.value = 0.92;
      node.connect(dry).connect(compressor); node.connect(room).connect(wet).connect(compressor);
      compressor.connect(analyser).connect(master).connect(ctx.destination);
      sendLevels(); masterVolume();
      ctx.onstatechange = () => {
        if (token !== sessionToken || ctx !== context) return;
        if (state === 'playing' && ctx.state !== 'running') {
          paintState('paused');
          notice('Playback paused. Press Resume jazz when you are ready.');
        }
      };
      if ('mediaSession' in navigator) {
        if ('MediaMetadata' in window) navigator.mediaSession.metadata = new MediaMetadata({ title: 'Doodle Jazz', artist: 'Doodleverse', album: 'The everlasting trio' });
      }
      paintState('playing'); notice('Settle in. The music keeps going until you stop it.');
    } catch (error) {
      if (token === sessionToken) { stop(); notice(error.message || 'Could not start playback. Reload Doodle Jazz, then press Play.', true); }
    } finally { busy = false; }
  }
  async function pause() {
    if (busy || !context || state !== 'playing' || prefs.neverStop) return;
    busy = true;
    try {
      const ctx = context; await ctx.suspend();
      if (ctx === context) { paintState('paused'); notice('Taking five. Resume whenever you like.'); }
    } catch (_) { notice('Could not pause. Use Stop to end this session.', true); }
    finally { busy = false; }
  }
  function stop() {
    sessionToken++;
    void casting.stop(); pendingShuffle = null;
    lastInfo = null;
    for (const pending of snapshots.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Play Jazz before naming this set.'));
    }
    snapshots.clear();
    nextShuffleAt = 3600;
    chordHistory = [];
    capturePending = false;
    $('dig-status').textContent = 'Let four chords play, then save a moment you love.';
    window.speechSynthesis?.cancel();
    const old = context;
    if (node) { node.port.onmessage = null; node.port.close(); node.disconnect(); }
    context = node = master = wet = analyser = null;
    pendingChange = false;
    if (old && old.state !== 'closed') { old.onstatechange = null; old.close().catch(() => {}); }
    paintState('idle'); paintPrefs(); $('elapsed').textContent = '00:00'; $('position').textContent = 'THE ROOM IS YOURS';
    notice('The room is quiet. Come back anytime.');
  }
  $('play').addEventListener('click', () => state === 'playing' ? pause() : play());
  const stopPlayback = () => { if (!prefs.neverStop) stop(); };
  $('stop').addEventListener('click', stopPlayback);
  $('never-stop').addEventListener('click', () => {
    prefs.neverStop = !prefs.neverStop;
    nextShuffleAt = (lastInfo?.seconds || 0) + 3600;
    paintPrefs();
    paintState(state);
    save();
    if (prefs.neverStop && state !== 'playing') void play();
  });
  $('voice-updates').addEventListener('change', () => {
    prefs.voice = $('voice-updates').checked;
    save();
    if (prefs.voice) announce('The Doodle Jazz announcer is on. The Doodle Clock color is ' + spokenColor());
    else window.speechSynthesis?.cancel();
    paintBand();
  });
  $('dig-this').addEventListener('click', () => {
    if (!node || capturePending || state !== 'playing') return;
    capturePending = true;
    $('dig-status').textContent = 'Saving this passage. Keep listening for the last few chords.';
    paintKeepsakes();
    node.port.postMessage({ capture: true });
  });
  $('chord-receipt').addEventListener('click', () => {
    if (context && chordHistory.length) downloadReceipt(chordReceipt(chordHistory, context.sampleRate));
  });
  function newSet() {
    seed = freshSeed();
    if (node) composition({ newSet: true, seed });
    else notice('A fresh improvisation is ready. Press Play jazz.');
  }
  $('new-set').addEventListener('click', newSet);
  const musicalSettings = () => Object.fromEntries(['style', 'tempo', 'swing', 'room', 'piano', 'bass', 'drums'].map(key => [key, prefs[key]]));
  function applySettings(settings, label) {
    for (const key of ['style', 'tempo', 'swing', 'room', 'piano', 'bass', 'drums']) prefs[key] = settings[key];
    paintPrefs(); save(); $('shuffle-info').textContent = label + ' · ' + prefs.tempo + ' BPM';
    if (node) {
      const levels = Object.fromEntries(['piano', 'bass', 'drums'].map(role => [role, prefs.trackMutes[role] ? 0 : prefs[role] / 100]));
      pendingShuffle = crypto.randomUUID(); pendingChange = true;
      node.port.postMessage({ scene: { id: pendingShuffle, composition: { style: prefs.style, tempo: prefs.tempo, swing: prefs.swing / 100 }, levels } });
      notice(label + ' will join on the next bar.');
    } else notice(label + ' is ready. Press Play jazz.');
  }
  $('shuffle-settings').addEventListener('click', () => {
    previousSettings = musicalSettings();
    const shuffled = djShuffleSettings(prefs, freshSeed()); applySettings(shuffled, shuffled.label);
    $('undo-shuffle').hidden = false;
  });
  $('undo-shuffle').addEventListener('click', () => {
    if (!previousSettings) return;
    applySettings(previousSettings, 'Your previous settings'); previousSettings = null; $('undo-shuffle').hidden = true;
  });
  $('mute').addEventListener('click', () => { prefs.muted = !prefs.muted; masterVolume(); paintPrefs(); save(); });
  $('night').addEventListener('click', () => { prefs.night = !prefs.night; paintPrefs(); save(); });
  for (const id of ['volume', 'tempo', 'swing', 'room', 'piano', 'bass', 'drums']) $(id).addEventListener('input', () => {
    prefs[id] = Number($(id).value); paintPrefs(); save();
    if (id === 'volume') masterVolume();
    else if (id === 'room' && context) wet?.gain.setTargetAtTime(prefs.room / 100 * 0.45, context.currentTime, 0.05);
    else if (id === 'tempo') composition({ tempo: prefs.tempo });
    else if (id === 'swing') composition({ swing: prefs.swing / 100 });
    else sendLevels();
  });
  document.querySelectorAll('[data-style]').forEach(button => button.addEventListener('click', () => {
    prefs.style = button.dataset.style;
    prefs.tempo = DJ_STYLES[prefs.style].tempo; prefs.swing = Math.round(DJ_STYLES[prefs.style].swing * 100);
    paintPrefs(); save(); composition({ style: prefs.style, tempo: prefs.tempo, swing: prefs.swing / 100 });
    if (!node) notice(DJ_STYLES[prefs.style].name + ' is ready. Press Play jazz.');
  }));
  document.querySelectorAll('[data-mute]').forEach(button => button.addEventListener('click', () => {
    const role = button.dataset.mute; prefs.trackMutes[role] = !prefs.trackMutes[role];
    sendLevels(); paintPrefs(); save();
  }));
  window.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.repeat || /INPUT|TEXTAREA|SELECT|BUTTON|SUMMARY/.test(event.target.tagName) || event.target.isContentEditable) return;
    if (event.code === 'Space') { event.preventDefault(); state === 'playing' ? pause() : play(); }
    else if (event.key.toLowerCase() === 'm') $('mute').click();
    else if (event.key.toLowerCase() === 'n') newSet();
  });
  if ('mediaSession' in navigator) for (const [action, handler] of [['play', play], ['pause', pause], ['stop', stopPlayback], ['nexttrack', newSet]]) {
    try { navigator.mediaSession.setActionHandler(action, handler); } catch (_) {}
  }
  window.addEventListener('pagehide', () => { naming.dispose(); stop(); });
  window.addEventListener('pageshow', event => { if (event.persisted) naming.resume(); });
  function meterTick() {
    if (state === 'playing' && analyser && !document.hidden) {
      analyser.getFloatTimeDomainData(meterData);
      let square = 0; for (const sample of meterData) square += sample * sample;
      const rms = Math.sqrt(square / meterData.length) * master.gain.value;
      $('signal').value = Math.min(1, rms * 9);
      $('signal').setAttribute('aria-valuetext', rms < 0.00001 ? 'Quiet' : Math.round(20 * Math.log10(rms)) + ' decibels');
    }
    requestAnimationFrame(meterTick);
  }
  let path = '';
  for (let i = 0; i <= 2400; i++) {
    const t = i / 2400 * Math.PI * 14;
    const x = 200 + 109 * Math.cos(t) + 35 * Math.cos(23 / 7 * t);
    const y = 200 + 109 * Math.sin(t) - 35 * Math.sin(23 / 7 * t);
    path += (i ? 'L' : 'M') + x.toFixed(2) + ',' + y.toFixed(2);
  }
  $('spirograph').setAttribute('d', path);
  $('radio-tools').hidden = false;
  $('chord-library').hidden = false;
  paintClock();
  setInterval(paintClock, 1000);
  void loadLearnedProgressions().then(learn, () => {});
  void showPassages();
  paintPrefs(); paintState('idle'); requestAnimationFrame(meterTick);
})();
