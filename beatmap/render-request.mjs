// SPDX-License-Identifier: GPL-3.0-only
export function prepareBeatmap(message) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./render-worker.mjs?v=8', import.meta.url), { type: 'module' });
    const timeout = setTimeout(() => fail('The beatMAP took too long to prepare.'), 30000);
    function cleanup() {
      clearTimeout(timeout);
      worker.terminate();
    }
    function fail(message) {
      cleanup();
      reject(new Error(message));
    }
    worker.onerror = () => fail('This browser could not prepare beatMAP audio.');
    worker.onmessage = ({ data }) => {
      if (data.error) { fail(data.error); return; }
      cleanup();
      resolve(data.result);
    };
    worker.postMessage(message);
  });
}
