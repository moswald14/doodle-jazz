// SPDX-License-Identifier: GPL-3.0-only
import { prepareForBand, renderProgram, exportProgramMidi } from './render.mjs?v=7';

self.onmessage = ({ data }) => {
  try {
    let result, transfers;
    if (data.action === 'band') {
      result = prepareForBand(data.project, data.program);
      transfers = result.samples.map(pcm => pcm.buffer);
    } else if (data.action === 'program') {
      result = renderProgram(data.project, data.gain);
      transfers = [result.samples.buffer];
    } else if (data.action === 'midi') {
      result = exportProgramMidi(data.project);
      transfers = [result];
    } else {
      throw new Error('Unknown beatMAP action.');
    }
    self.postMessage({ result }, transfers);
  } catch (error) {
    self.postMessage({ error: error.message || 'The beatMAP could not be prepared.' });
  }
};
