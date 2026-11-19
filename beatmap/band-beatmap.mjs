// SPDX-License-Identifier: GPL-3.0-only
export const BEATMAP_RATE = 24000;
export const BEATMAP_BYTE_LIMIT = 48 * 1024 * 1024;

export function validateBandBeatmap(value) {
  if (!value || typeof value.name !== 'string' || !value.name.length || value.name.length > 48 ||
      typeof value.loop !== 'boolean' || !Array.isArray(value.samples) || value.samples.length > 100 ||
      !Array.isArray(value.bars) || !value.bars.length || value.bars.length > 8 ||
      !Array.isArray(value.order) || !value.order.length || value.order.length > 64 ||
      !value.order.every(index => Number.isInteger(index) && index >= 0 && index < value.bars.length)) {
    throw new Error('This beatMAP could not be prepared for the band.');
  }
  if (value.stepOffsets !== undefined) {
    const steps = value.stepOffsets;
    if (!Array.isArray(steps) || steps[0] !== 0 || steps.length > 20 ||
        !Array.from(steps).every((step, index) => Number.isFinite(step) && step < 1 && (index === 0 || step > steps[index - 1]))) {
      throw new Error('Invalid beatMAP step timing.');
    }
  }
  let bytes = 0;
  for (const sample of value.samples) {
    if (!(sample instanceof Float32Array) || sample.length < 2 || sample.length > BEATMAP_RATE * 12) {
      throw new Error('Invalid beatMAP drum sound.');
    }
    bytes += sample.byteLength;
    if (bytes > BEATMAP_BYTE_LIMIT) throw new Error('This beatMAP exceeds the band’s sample limit.');
  }
  for (const bar of value.bars) {
    if (!Array.isArray(bar) || bar.length > 780 || !bar.every(event =>
      Number.isFinite(event.at) && event.at >= 0 && event.at < 1 &&
      Number.isInteger(event.sample) && Object.hasOwn(value.samples, event.sample) &&
      Number.isFinite(event.level) && event.level >= 0 && event.level <= 1)) {
      throw new Error('Invalid beatMAP measure.');
    }
  }
  return value;
}
