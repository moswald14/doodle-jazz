// SPDX-License-Identifier: GPL-3.0-only
import './effects-dsp.js';
import './amp-tone.js';
import './studio-dsp.js';
import './wave-library.js';
import './drum-dsp.js?v=5';
import './drum-program.js';
import './midi-io.js';
import { BEATMAP_BYTE_LIMIT, BEATMAP_RATE, validateBandBeatmap } from './band-beatmap.mjs?v=6';

const { DrumDSP, DrumProgram, MidiIO, WaveLibrary } = globalThis;
const drumNotes = { kick: 36, snare: 38, hat: 42, perc: 45,
  'pad-1': 36, 'pad-2': 38, 'pad-3': 42, 'pad-4': 45, 'pad-5': 47, 'pad-6': 46, 'pad-7': 35, 'pad-8': 37, 'pad-9': 50 };

function plan(project, program) {
  const pattern = DrumDSP.validatePattern(project.pattern);
  const waves = WaveLibrary.validateBundle({ kind: 'dot-wave-library', version: 1, waves: project.library });
  if (typeof project.name !== 'string' || !project.name.trim() || project.name.length > 48 ||
      !Number.isFinite(project.drumVolume) || project.drumVolume < 0 || project.drumVolume > 1) {
    throw new Error('Invalid editable beatMAP.');
  }
  const order = program ? DrumProgram.compile(project.program.source, pattern.bars).map(item => item.measure - 1)
    : Array.from({ length: pattern.bars }, (_, index) => index);
  const stepCount = DrumDSP.stepsPerBar(pattern.meter);
  const seconds = stepCount / 4 * 60 / pattern.bpm;
  let offset = 0;
  const grid = Array.from({ length: stepCount }, (_, step) => {
    const span = DrumDSP.stepSeconds(pattern.bpm, pattern.swing, step);
    const timing = { offset, span };
    offset += span;
    return timing;
  });
  const tracks = DrumDSP.allTracks(pattern).filter(track => !track.mute && track.level > 0);
  const bars = Array.from({ length: pattern.bars }, (_, measure) => {
    const events = [];
    for (const [i, { offset, span }] of grid.entries()) {
      const step = measure * stepCount + i;
      for (const track of tracks) {
        if (!track.steps[step]) continue;
        for (const hit of DrumDSP.hitEvents(track, step, span)) {
          events.push({ ...hit, at: (offset + hit.offset) / seconds });
        }
      }
    }
    return events.sort((left, right) => left.at - right.at);
  });
  return { pattern, waves, order, seconds, bars, stepOffsets: grid.map(step => step.offset / seconds) };
}

function synthesize(waves, bars, rate, gain, chip) {
  const byWave = new Map(waves.map(wave => [wave.id, wave]));
  const signals = new Map();
  const bySound = new Map();
  const samples = [];
  let bytes = 0;
  const prepared = bars.map(bar => bar.map(({ track, at, velocity }) => {
    const key = JSON.stringify([track.id, track.waveId, track.pitch, track.decay, track.sweep, track.noise, track.tone, track.level]);
    if (!bySound.has(key)) {
      const wave = byWave.get(track.waveId);
      if (!wave) throw new Error('The beatMAP is missing a drum waveform.');
      if (!signals.has(track.waveId)) signals.set(track.waveId, WaveLibrary.signal(wave));
      const pcm = DrumDSP.renderHit(signals.get(track.waveId), track, rate);
      if (chip) for (let i = 0; i < pcm.length; i++) pcm[i] = Math.round(pcm[i] * 128) / 128;
      bytes += pcm.byteLength;
      if (bytes > BEATMAP_BYTE_LIMIT) throw new Error('This beatMAP exceeds the sample limit.');
      bySound.set(key, samples.length);
      samples.push(pcm);
    }
    return { at, sample: bySound.get(key), level: velocity * gain };
  }));
  return { bars: prepared, samples };
}

export function prepareForBand(project, program) {
  project ??= { ...DrumDSP.defaultKit(), library: WaveLibrary.stockWaves() };
  const { waves, order, bars, stepOffsets } = plan(project, program);
  const chip = program && project.editor?.chip === true;
  const usable = synthesize(waves, bars, BEATMAP_RATE, project.drumVolume, chip);
  return validateBandBeatmap({ name: project.name, loop: !program || project.program.loop === true, order, stepOffsets, ...usable });
}

export function renderProgram(project, gain) {
  const { waves, order, bars, seconds } = plan(project, true);
  const rate = 22050;
  const prepared = synthesize(waves, bars, rate, gain, false);
  const longestHit = prepared.samples.reduce((size, hit) => Math.max(size, hit.length), 0);
  const renderedBars = prepared.bars.map(events => {
    const measure = new Float32Array(Math.ceil(seconds * rate) + longestHit);
    for (const event of events) {
      const pcm = prepared.samples[event.sample];
      const frame = Math.round(event.at * seconds * rate);
      for (let i = 0; i < pcm.length; i++) measure[frame + i] += pcm[i] * event.level;
    }
    return measure;
  });
  const samples = new Float32Array(Math.round(order.length * seconds * rate));
  for (const [index, bar] of order.entries()) {
    const measure = renderedBars[bar];
    const start = Math.round(index * seconds * rate);
    for (let i = 0; i < measure.length; i++) samples[(start + i) % samples.length] += measure[i];
  }
  let peak = 0.98;
  for (const value of samples) peak = Math.max(peak, Math.abs(value));
  const scale = 0.98 / peak;
  if (scale < 1) for (let i = 0; i < samples.length; i++) samples[i] *= scale;
  return { samples, rate, duration: samples.length / rate };
}

export function exportProgramMidi(project) {
  const { pattern, order, bars, seconds } = plan(project, true);
  const quarter = 60 / pattern.bpm;
  const notes = order.flatMap((bar, index) => bars[bar].map(({ track, at, gate, velocity }) => ({
    midi: drumNotes[track.id],
    start: (index + at) * seconds / quarter,
    duration: gate / quarter,
    velocity
  })));
  return MidiIO.encode({ bpm: pattern.bpm, meter: pattern.meter, duration: order.length * seconds / quarter,
    tracks: [{ name: project.name, channel: 9, notes }] }, { format: 0 });
}
