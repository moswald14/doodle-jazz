// SPDX-License-Identifier: GPL-3.0-only
import { prepareBeatmap } from './render-request.mjs';

const controls = id => document.getElementById(id);
const embedded = window.parent !== window;
let draftTimer;
const applyButtons = [];

globalThis.renderBeatmapProgram = gain => prepareBeatmap({
  action: 'program', project: beatMapProject(), gain
});

for (const [id, program] of [['beat-send-mix', false], ['program-song', true]]) {
  const button = controls(id);
  applyButtons.push(button);
  button.disabled = !embedded;
  if (!embedded) button.title = 'Open the editor from the Jazz room to play with the band.';
  button.addEventListener('click', () => {
    if (program && !checkDrumProgram()) return;
    try {
      const project = beatMapProject();
      stopAll();
      saveBeatmapDraft();
      for (const control of applyButtons) control.disabled = true;
      window.parent.postMessage({ type: 'doodle-jazz-beatmap-apply', project, program }, location.origin);
    } catch (error) {
      for (const control of applyButtons) control.disabled = false;
      notice(error.message);
    }
  });
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
    saveBeatmapDraft();
  }
  if (data.type === 'doodle-jazz-beatmap-status' && typeof data.message === 'string') {
    notice(data.message);
    for (const control of applyButtons) control.disabled = data.busy === true;
  }
});

try {
  const draft = localStorage.getItem('doodle-jazz-beatmap-draft-v1');
  if (draft) restoreBeatmap(JSON.parse(draft));
} catch { notice('The previous draft could not be loaded. You can still open a saved beatMAP file.'); }

function queueDraftSave() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(saveBeatmapDraft, 450);
}
for (const event of ['input', 'change', 'click', 'keydown']) {
  document.addEventListener(event, queueDraftSave, { passive: true });
}
addEventListener('pagehide', () => { saveBeatmapDraft(); stopAll(); });

function paintPlayhead() {
  if (document.visibilityState === 'visible') window.drumFrame();
  requestAnimationFrame(paintPlayhead);
}
requestAnimationFrame(paintPlayhead);
document.body.dataset.beatmapReady = 'true';
