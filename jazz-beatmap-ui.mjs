// SPDX-License-Identifier: GPL-3.0-only
import { prepareBeatmap } from './beatmap/render-request.mjs?v=6';
import { appliedBeatmapKey, compactBeatmapProject, loadBeatmapProjects } from './beatmap/live-project.mjs';

const sourceKey = 'doodle-jazz-drum-source-v1';

export function createJazzBeatmapUI({ choose, preview, isStarted }) {
  const $ = id => document.getElementById(id);
  const panel = $('beatmap-panel');
  const frame = $('beatmap-frame');
  const restore = $('beatmap-restore');
  const label = $('beatmap-status');
  let { draft, applied } = loadBeatmapProjects();
  let enabled = true;
  try { enabled = localStorage.getItem(sourceKey) !== 'band'; } catch {}
  let generation = 0;
  let queued = null, pending = null, selected = null, failed = false;
  let position = null, night = false, sizeObserver;

  function tellEditor(type, data = {}) {
    frame.contentWindow?.postMessage({ type: `doodle-jazz-beatmap-${type}`, ...data }, location.origin);
  }

  function status(message) {
    label.textContent = message;
  }

  function paintSource() {
    restore.textContent = enabled ? 'Return to band drums' : 'Use beatMAP drums';
  }

  function syncEditor() {
    tellEditor('theme', { night });
    tellEditor('cursor', { position });
  }

  function playhead(next) {
    if (!next && !position) return;
    position = next;
    if (panel.open) tellEditor('cursor', { position });
  }

  panel.addEventListener('toggle', () => {
    if (!panel.open) {
      preview(false);
      tellEditor('close');
    } else if (frame.hasAttribute('src')) syncEditor();
    else {
      const editorUrl = new URL('./beatmap/index.html?v=6', import.meta.url);
      if (night) editorUrl.searchParams.set('theme', 'night');
      frame.src = editorUrl.href;
    }
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
  frame.addEventListener('load', () => {
    sizeObserver?.disconnect();
    const content = frame.contentDocument?.querySelector('main');
    if (!content) return;
    sizeObserver = new ResizeObserver(([entry]) => {
      const height = Math.ceil(entry.target.getBoundingClientRect().height);
      if (height) frame.style.height = `${height}px`;
    });
    sizeObserver.observe(content);
    syncEditor();
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
        status(isStarted() ? `${prepared.name} · changes queued for the next bar` : `${prepared.name} · ready`);
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
    if (panel.open && data?.type === 'doodle-jazz-beatmap-preview' && typeof data.active === 'boolean') preview(data.active);
    if (data?.type === 'doodle-jazz-beatmap-edit' && data.project) {
      draft = data.project;
      schedule();
    }
  });

  paintSource();
  if (enabled) schedule();
  else status('Band drums selected.');

  return {
    playhead,
    theme(dark) {
      if (dark === night) return;
      night = dark;
      if (panel.open) tellEditor('theme', { night });
    },
    async ready() {
      while (enabled && pending) await pending;
    },
    error(message, revision) {
      if (revision === generation) status(message);
    },
    playing(name, revision) {
      if (!failed && revision === generation) status(`${name} · live`);
    },
    finished(name, revision) {
      if (!failed && revision === generation) status(`${name} finished. The drum track is quiet.`);
    },
    stopped() {
      playhead(null);
      if (!failed && !pending && selected) status(`${selected} · ready`);
    }
  };
}
