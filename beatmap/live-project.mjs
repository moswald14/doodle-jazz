// SPDX-License-Identifier: GPL-3.0-only
export const appliedBeatmapKey = 'doodle-jazz-applied-beatmap-v1';

function read(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

export function loadBeatmapProjects() {
  const saved = read(appliedBeatmapKey);
  const applied = saved?.project && typeof saved.program === 'boolean' ? saved : null;
  const draft = read('doodle-jazz-beatmap-draft-v1') ?? applied?.project ?? null;
  // An older draft has no Jazz program setting. Recover it from the last manual selection.
  if (draft?.editor && typeof draft.editor.jazzProgram !== 'boolean') {
    draft.editor.jazzProgram = applied?.program === true;
  }
  return { draft, applied };
}

export function compactBeatmapProject(project) {
  const { tracks, pads = [] } = project.pattern;
  const usedWaves = new Set([...tracks, ...pads].map(track => track.waveId));
  return { ...project, library: project.library.filter(wave => usedWaves.has(wave.id)) };
}
