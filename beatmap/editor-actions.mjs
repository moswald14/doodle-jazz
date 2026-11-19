// SPDX-License-Identifier: GPL-3.0-only
import { prepareBeatmap } from './render-request.mjs?v=6';
import { compactBeatmapProject, loadBeatmapProjects } from './live-project.mjs';

const controls = id => document.getElementById(id);
const embedded = window.parent !== window;
const root = document.documentElement;
let draftTimer, queued = false, lastSound;

if (embedded) {
  root.dataset.embedded = '';
  root.classList.toggle('night', new URL(location.href).searchParams.get('theme') === 'night');
  controls('program-live-setting').hidden = false;
  const transports = ['beat-play', 'program-play'].map(controls);
  let previewing = false;
  const watchPreview = new MutationObserver(() => {
    const active = transports.some(button => button.getAttribute('aria-pressed') === 'true');
    if (active === previewing) return;
    previewing = active;
    if (active) paintDrumCursor();
    else followJazzCursor();
    window.parent.postMessage({ type: 'doodle-jazz-beatmap-preview', active }, location.origin);
  });
  for (const button of transports) watchPreview.observe(button, { attributeFilter: ['aria-pressed'] });
}

globalThis.renderBeatmapProgram = gain => prepareBeatmap({
  action: 'program', project: beatMapProject(), gain
});

function shareBeatmap(updateBand = true) {
  if (!embedded) return;
  try {
    const project = compactBeatmapProject(beatMapProject());
    const { name, pattern, drumVolume, library, program, editor } = project;
    const sound = JSON.stringify([name, pattern, drumVolume, library, editor.jazzProgram && [program, editor.chip]]);
    if (sound === lastSound) return;
    if (updateBand) window.parent.postMessage({ type: 'doodle-jazz-beatmap-edit', project }, location.origin);
    lastSound = sound;
  } catch (error) { notice(error.message); }
}

controls('program-midi').addEventListener('click', async () => {
  if (!checkDrumProgram()) return;
  const status = controls('program-status');
  const button = controls('program-midi');
  button.disabled = true;
  try {
    const result = await prepareBeatmap({ action: 'midi', project: beatMapProject() });
    await downloadStudio(result, 'audio/midi', 'beatmap-program.mid');
    status.textContent = 'MIDI saved with drum notes, accents, and timing.';
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
});

controls('program-wav').addEventListener('click', async () => {
  if (!checkDrumProgram()) return;
  const status = controls('program-status');
  const button = controls('program-wav');
  button.disabled = true;
  try {
    const { samples, rate } = await globalThis.renderBeatmapProgram(drum.volume);
    await downloadStudio(DrumProgram.wav8(samples, rate), 'audio/wav', 'beatmap-program-8bit.wav');
    status.textContent = '8-bit WAV saved as an exact loop.';
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
});

window.addEventListener('message', ({ origin, source, data }) => {
  if (!embedded || origin !== location.origin || source !== window.parent || !data) return;
  if (data.type === 'doodle-jazz-beatmap-close') {
    stopAll();
    shareBeatmap();
    saveBeatmapDraft();
  }
  if (data.type === 'doodle-jazz-beatmap-theme') root.classList.toggle('night', data.night === true);
  if (data.type === 'doodle-jazz-beatmap-cursor') window.setJazzPlayhead(data.position);
});

try {
  const { draft } = loadBeatmapProjects();
  if (draft) restoreBeatmap(draft);
} catch { notice('The previous draft could not be loaded. You can still open a saved beatMAP file.'); }

function queueBeatmapEdit() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    shareBeatmap();
    clearTimeout(draftTimer);
    draftTimer = setTimeout(saveBeatmapDraft, 450);
  });
}
window.queueBeatmapEdit = queueBeatmapEdit;
for (const event of ['input', 'change', 'click', 'keydown']) {
  document.addEventListener(event, queueBeatmapEdit, { passive: true });
}
addEventListener('pagehide', () => { saveBeatmapDraft(); stopAll(); });
shareBeatmap(false);

function paintPlayhead() {
  if (document.visibilityState === 'visible') window.drumFrame();
  requestAnimationFrame(paintPlayhead);
}
requestAnimationFrame(paintPlayhead);
document.body.dataset.beatmapReady = 'true';
