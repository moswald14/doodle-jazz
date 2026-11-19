// SPDX-License-Identifier: GPL-3.0-only
import { prepareBeatmap } from './beatmap/render-request.mjs';

const storageKey = 'doodle-jazz-applied-beatmap-v1';

export function createJazzBeatmapUI({ choose, preview, isStarted }) {
  const $ = id => document.getElementById(id);
  const dialog = $('beatmap-dialog');
  const frame = $('beatmap-frame');
  const restore = $('beatmap-restore');
  const label = $('beatmap-status');
  let generation = 0;
  let pending = null, selected = null;

  function tellEditor(message, busy = false) {
    frame.contentWindow?.postMessage({ type: 'doodle-jazz-beatmap-status', message, busy }, location.origin);
  }

  function status(message, busy = false) {
    label.textContent = message;
    tellEditor(message, busy);
  }

  function clear(message = isStarted() ? 'Band drums return on the next bar.' : 'Band drums selected.') {
    generation++;
    pending = null;
    selected = null;
    try { localStorage.removeItem(storageKey); } catch {}
    choose(null);
    restore.disabled = true;
    status(message);
  }

  $('beatmap-open').addEventListener('click', () => {
    if (!frame.hasAttribute('src')) frame.src = new URL('./beatmap/index.html?v=4', import.meta.url).href;
    if (!dialog.open) dialog.showModal();
  });
  restore.addEventListener('click', () => clear());
  frame.addEventListener('load', () => { if (label.textContent) tellEditor(label.textContent, Boolean(pending)); });
  dialog.addEventListener('close', () => {
    preview(false);
    frame.contentWindow?.postMessage({ type: 'doodle-jazz-beatmap-close' }, location.origin);
  });

  async function prepareSelection(project, program, ticket, save) {
    try {
      const prepared = await prepareBeatmap({ action: 'band', project, program });
      if (ticket !== generation) return;
      selected = prepared.name;
      choose(prepared);
      const message = isStarted() ? `${selected} replaces the drums on the next bar.` : `${selected} will play the drums when Jazz starts.`;
      if (save) {
        try {
          // Keep the editable drum settings and the waves they reference, rather than rendered samples.
          const { tracks, pads = [] } = project.pattern;
          const waveIds = new Set([...tracks, ...pads].map(track => track.waveId));
          const library = project.library.filter(wave => waveIds.has(wave.id));
          localStorage.setItem(storageKey, JSON.stringify({ project: { ...project, library }, program }));
        } catch {
          status(message + ' This browser could only keep the selection for this session.');
          return;
        }
      }
      status(message);
    } catch (error) {
      if (ticket !== generation) return;
      restore.disabled = selected === null;
      status(error.message);
    } finally {
      if (ticket === generation) pending = null;
    }
  }

  function select(project, program, save) {
    const ticket = ++generation;
    restore.disabled = false;
    status('Preparing your beatMAP…', true);
    pending = prepareSelection(project, program, ticket, save);
  }

  window.addEventListener('message', ({ source, origin, data }) => {
    if (!dialog.open || origin !== location.origin || source !== frame.contentWindow) return;
    if (data?.type === 'doodle-jazz-beatmap-preview' && typeof data.active === 'boolean') preview(data.active);
    if (data?.type === 'doodle-jazz-beatmap-apply' && data.project && typeof data.program === 'boolean') {
      select(data.project, data.program, true);
    }
  });

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved?.project && typeof saved.program === 'boolean') select(saved.project, saved.program, false);
  } catch {}

  return {
    clear,
    async ready() {
      while (pending) await pending;
    },
    playing(name) {
      if (!pending && name === selected) status(`${name} is playing the Jazz drums.`);
    },
    finished(name) {
      if (!pending && name === selected) status(`${name} finished. The drum track is quiet.`);
    },
    stopped() {
      if (!pending && selected) status(`${selected} will play the drums when Jazz starts.`);
    }
  };
}
