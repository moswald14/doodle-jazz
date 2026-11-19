// SPDX-License-Identifier: GPL-3.0-only
import { DJRenderer } from './jazz-core.mjs?v=5';
import { JAZZ_CLIP_MAX_SECONDS } from './jazz-radio-contract.mjs';

class DoodleJazzProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { bank, config, beatmap = null, beatmapRevision = 0 } = options.processorOptions;
    this.renderer = new DJRenderer(sampleRate, bank, config, info => this.update(info));
    this.ring = new Int16Array(Math.ceil(sampleRate * JAZZ_CLIP_MAX_SECONDS) * 2);
    this.written = 0;
    this.chords = [];
    this.capture = null;
    if (beatmap) this.renderer.configure({ beatmap, beatmapRevision });
    this.port.onmessage = ({ data }) => {
      if (data.capture) this.beginCapture();
      else this.renderer.configure(data);
    };
  }
  update(info) {
    if (info.nameSnapshot && info.context) {
      const { set, style, tonic } = info.context;
      const progression = this.chords.filter(chord => chord.set === set && chord.style === style && chord.tonic === tonic)
        .map(({ root, quality }) => ({ root, quality }));
      if (progression.length) info.context.progression = progression;
    }
    if (Number.isInteger(info.chordIndex) && this.chords.at(-1)?.index !== info.chordIndex) {
      const chord = {
        index: info.chordIndex, frame: Math.round(info.seconds * sampleRate), chord: info.chord,
        style: info.style, key: info.key, tonic: info.tonic, beatOnly: info.beatOnly, set: info.set,
        root: info.chordRoot, quality: info.chordQuality
      };
      this.chords.push(chord);
      if (this.chords.length > 8) this.chords.shift();
      if (this.capture && this.capture.end === undefined) {
        if (this.capture.chords.length < 8) this.capture.chords.push(chord);
        else this.capture.end = chord.frame * 2;
      }
    }
    this.port.postMessage(info);
  }
  beginCapture() {
    if (this.capture) return;
    if (this.chords.length < 5) {
      this.port.postMessage({ captureError: 'Let four chords finish, then try again.' });
      return;
    }
    const chords = this.chords.slice(-5);
    this.capture = { chords, start: chords[0].frame * 2, copied: 0 };
  }
  finishCapture() {
    const capture = this.capture;
    if (!capture || capture.end === undefined) return;
    if (this.written - capture.start - capture.copied > this.ring.length) {
      this.capture = null;
      this.port.postMessage({ captureError: 'This passage ran long. Try again on a new chord.' });
      return;
    }
    capture.samples ??= new Int16Array(capture.end - capture.start);
    // Spread the copy over several renders to keep the playback thread responsive.
    const offset = (capture.start + capture.copied) % this.ring.length;
    const count = Math.min(8192, capture.samples.length - capture.copied, this.ring.length - offset);
    capture.samples.set(this.ring.subarray(offset, offset + count), capture.copied);
    capture.copied += count;
    if (capture.copied !== capture.samples.length) return;
    this.capture = null;
    this.port.postMessage({ passage: { chords: capture.chords, samples: capture.samples, sampleRate } }, [capture.samples.buffer]);
  }
  process(inputs, outputs) {
    const output = outputs[0];
    if (output && output.length >= 2) {
      const [left, right] = output;
      this.renderer.render(left, right);
      for (let i = 0; i < left.length; i++) {
        const at = (this.written + i * 2) % this.ring.length;
        this.ring[at] = Math.round(left[i] * 32767);
        this.ring[at + 1] = Math.round(right[i] * 32767);
      }
      this.written += left.length * 2;
      this.finishCapture();
    }
    return true;
  }
}
registerProcessor('doodle-jazz', DoodleJazzProcessor);
