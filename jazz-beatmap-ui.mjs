// SPDX-License-Identifier: GPL-3.0-only
import { prepareBeatmap } from './beatmap/render-request.mjs?v=5';
import { appliedBeatmapKey, compactBeatmapProject, loadBeatmapProjects } from './beatmap/live-project.mjs';

const sourceKey = 'doodle-jazz-drum-source-v1';

export function createJazzBeatmapUI({ choose, preview, isStarted }) {
  const $ = id => document.getElementById(id);
  const dialog = $('beatmap-dialog');
  const frame = $('beatmap-frame');
  const restore = $('beatmap-restore');
  const label = $('beatmap-status');
  let { draft, applied } = loadBeatmapProjects();
  let enabled = true;
  try { enabled = localStorage.getItem(sourceKey) !== 'band'; } catch {}
  let generation = 0;
  let queued = null, pending = null, selected = null, failed = false;

  function tellEditor(message) {
    frame.contentWindow?.postMessage({ type: 'doodle-jazz-beatmap-status', message }, location.origin);
  }

  function status(message) {
    if (label.textContent === message) return;
    label.textContent = message;
    tellEditor(message);
  }

  function paintSource() {
    restore.textContent = enabled ? 'Return to band drums' : 'Use beatMAP drums';
  }

  $('beatmap-open').addEventListener('click', () => {
    if (!frame.hasAttribute('src')) frame.src = new URL('./beatmap/index.html?v=5', import.meta.url).href;
    if (!dialog.open) dialog.showModal();
  });
  restore.addEventListener('click', () => {
    enabled = !enabled;
    try { localStorage.setItem(sourceKey, enabled ? 'beatmap' : 'band'); } catch {}
    paintSource();
    if (enabled) schedule();
    else {
      generation++;
      queued = null;
      selected = null;
      failed = false;
      choose(null, generation);
      status(isStarted() ? 'Band drums return on the next bar.' : 'Band drums selected.');
    }
  });
  frame.addEventListener('load', () => tellEditor(label.textContent));
  dialog.addEventListener('close', () => {
    preview(false);
    frame.contentWindow?.postMessage({ type: 'doodle-jazz-beatmap-close' }, location.origin);
  });

  const prepare = (project, program) => prepareBeatmap({ action: 'band', project, program });

  function install(prepared, revision) {
    selected = prepared.name;
    choose(prepared, revision);
  }

  async function fallback(project, program, revision) {
    const options = [applied, program && { project, program: false }, project && { project: null, program: false }];
    for (const option of options) {
      if (revision !== generation) return null;
      if (option) {
        try { return await prepare(option.project, option.program); } catch {}
      }
    }
    return null;
  }

  async function flush() {
    // Compile one revision at a time and pick up the newest draft after each render.
    while (queued) {
      const { project, revision } = queued;
      queued = null;
      const program = project?.editor?.jazzProgram === true;
      try {
        const prepared = await prepare(project, program);
        if (revision !== generation) continue;
        failed = false;
        install(prepared, revision);
        if (project) {
          try {
            applied = { project: compactBeatmapProject(project), program };
            localStorage.setItem(appliedBeatmapKey, JSON.stringify(applied));
          } catch {}
        }
        status(isStarted() ? `${prepared.name} updates on the next bar.` : `${prepared.name} is ready to play the drums.`);
      } catch (error) {
        if (revision !== generation) continue;
        if (!selected) {
          const prepared = await fallback(project, program, revision);
          if (revision !== generation) continue;
          if (prepared) install(prepared, revision);
        }
        failed = true;
        status(`${error.message} ${selected ? 'Keeping the last playable beat.' : 'Band drums selected.'}`);
      }
    }
    pending = null;
  }

  function schedule() {
    if (!enabled) return;
    if (!selected) status('Preparing beatMAP drums…');
    queued = { project: draft, revision: ++generation };
    pending ??= flush();
  }

  window.addEventListener('message', ({ source, origin, data }) => {
    if (origin !== location.origin || source !== frame.contentWindow) return;
    if (dialog.open && data?.type === 'doodle-jazz-beatmap-preview' && typeof data.active === 'boolean') preview(data.active);
    if (data?.type === 'doodle-jazz-beatmap-edit' && data.project) {
      draft = data.project;
      schedule();
    }
  });

  paintSource();
  if (enabled) schedule();
  else status('Band drums selected.');

  return {
    async ready() {
      while (enabled && pending) await pending;
    },
    error(message, revision) {
      if (revision === generation) status(message);
    },
    playing(name, revision) {
      if (!failed && revision === generation) status(`${name} is playing the drums. Edits take effect on the next bar.`);
    },
    finished(name, revision) {
      if (!failed && revision === generation) status(`${name} finished. The drum track is quiet.`);
    },
    stopped() {
      if (!failed && !pending && selected) status(`${selected} is ready to play the drums.`);
    }
  };
}
