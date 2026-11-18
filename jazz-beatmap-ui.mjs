// SPDX-License-Identifier: GPL-3.0-only
import { prepareBeatmap } from './beatmap/render-request.mjs';

export function createJazzBeatmapUI({ choose, isPlaying }) {
  const $ = id => document.getElementById(id);
  const dialog = $('beatmap-dialog');
  const frame = $('beatmap-frame');
  const restore = $('beatmap-restore');
  const label = $('beatmap-status');
  let generation = 0;

  function tellEditor(message, busy = false) {
    frame.contentWindow?.postMessage({ type: 'doodle-jazz-beatmap-status', message, busy }, location.origin);
  }

  function clear(message = isPlaying() ? 'Band drums return on the next bar.' : 'Band drums selected.') {
    generation++;
    choose(null);
    restore.disabled = true;
    label.textContent = message;
    tellEditor(message);
  }

  $('beatmap-open').addEventListener('click', () => {
    if (!frame.hasAttribute('src')) frame.src = new URL('./beatmap/index.html', import.meta.url).href;
    if (!dialog.open) dialog.showModal();
  });
  restore.addEventListener('click', () => clear());
  dialog.addEventListener('close', () => {
    frame.contentWindow?.postMessage({ type: 'doodle-jazz-beatmap-close' }, location.origin);
  });

  window.addEventListener('message', async ({ source, origin, data }) => {
    if (!dialog.open || origin !== location.origin || source !== frame.contentWindow ||
        data?.type !== 'doodle-jazz-beatmap-apply' || !data.project || typeof data.program !== 'boolean') return;
    const ticket = ++generation;
    restore.disabled = false;
    label.textContent = 'Preparing your beatMAP…';
    tellEditor(label.textContent, true);
    try {
      const prepared = await prepareBeatmap({ action: 'band', project: data.project, program: data.program });
      if (ticket !== generation) return;
      choose(prepared);
      label.textContent = isPlaying() ? prepared.name + ' joins on the next bar.' : 'Ready. Close the editor and press Play jazz.';
      tellEditor(label.textContent);
    } catch (error) {
      if (ticket !== generation) return;
      label.textContent = error.message;
      tellEditor(error.message);
    }
  });

  return {
    clear,
    playing(name) {
      label.textContent = name + ' is playing with Jazz.';
      tellEditor(label.textContent);
    },
    finished() {
      clear('The beatMAP finished. The band’s own groove is playing.');
    }
  };
}
