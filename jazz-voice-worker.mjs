// SPDX-License-Identifier: GPL-3.0-only
import { djMakeBank } from './jazz-core.mjs';
import { buildJazzDotBank } from './jazz-dot-voices.mjs';

self.onmessage = ({ data }) => {
  try {
    const bank = buildJazzDotBank(djMakeBank(), data);
    const buffers = Object.values(bank.drums).map(sample => sample.buffer);
    for (const part of ['piano', 'bass']) {
      for (const { data } of Object.values(bank[part])) buffers.push(data.buffer);
    }
    self.postMessage({ bank }, [...new Set(buffers)]);
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
