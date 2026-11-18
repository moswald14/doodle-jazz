'use strict';

const $ = id => document.getElementById(id);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const labTabs = { active: 'beat' };
let engine;

function notice(message) {
  $('beat-status').textContent = message;
}

function mixOption(select, value, text) {
  select.add(new Option(text, value));
}

async function ensureAudio() {
  if (!engine) {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error('This browser does not support beatMAP audio.');
    const context = new Audio({ latencyHint: 'interactive' });
    const input = context.createDynamicsCompressor();
    input.threshold.value = -10;
    input.ratio.value = 3;
    input.connect(context.destination);
    engine = { context, input };
  }
  if (engine.context.state !== 'running') await engine.context.resume();
  return engine;
}

function smooth(param, value) {
  param.setTargetAtTime(value, engine.context.currentTime, 0.012);
}

window.studioSchedule = callback => callback(engine.context.currentTime + 0.035);

function stopAll() {
  stopDrumMachine();
  window.stopPadWavePreview?.();
}

async function downloadStudio(data, type, name) {
  const blob = new Blob([data], { type });
  const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  const suffix = Array.from(new Uint8Array(hash).slice(0, 4), byte => byte.toString(16).padStart(2, '0')).join('');
  const extension = /.(?:beatmap.json|[^.]+)$/.exec(name)?.[0] || '';
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = name.slice(0, name.length - extension.length) + '-' + suffix + extension;
  link.href = url;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

let savedDraft;
function saveBeatmapDraft() {
  try {
    const draft = JSON.stringify(beatMapProject());
    if (draft !== savedDraft) {
      localStorage.setItem('doodle-jazz-beatmap-draft-v1', draft);
      savedDraft = draft;
    }
  } catch {
    $('beatmap-status').textContent = 'Browser storage is unavailable. Use Save beatMAP to keep the edit.';
  }
}
