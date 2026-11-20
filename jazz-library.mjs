// SPDX-License-Identifier: GPL-3.0-only
import { DJ_NOTES, djValidateFavoriteProgressions } from './jazz-core.mjs?v=7';
import { validateJazzProgression, validateJazzResult } from './jazz-name-contract.mjs?v=2';
import { jazzChainConnected, sendPhraseToDoodlechain } from './jazz-site.mjs?v=3';

const MAX_LIBRARY_BYTES = 64 * 1024 * 1024;
const MAX_PASSAGES = 24;
const MEMORY = 'band-memory';
const LEGACY_MEMORY = 'jazz-liked-progressions';
const $ = id => document.getElementById(id);

function openLibrary() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('doodle-jazz-passages', 2);
    request.onupgradeneeded = event => {
      if (event.oldVersion === 0) request.result.createObjectStore('passages', { keyPath: 'id' });
      request.result.createObjectStore(MEMORY).add(readLegacyProgressions(), 'progressions');
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close your other Doodle Jazz tabs and try again.'));
  });
}

async function useLibrary(mode, perform, stores = ['passages']) {
  const database = await openLibrary();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(stores, mode);
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(failure || transaction.error);
      let result, failure;
      perform(transaction.objectStore(stores[0]), value => { result = value; }, error => {
        failure = error;
        transaction.abort();
      }, transaction);
    });
  } finally {
    database.close();
  }
}

export function readLegacyProgressions() {
  try { return djValidateFavoriteProgressions(JSON.parse(localStorage.getItem(LEGACY_MEMORY)) ?? []); }
  catch { return []; }
}

export function loadLearnedProgressions() {
  return useLibrary('readonly', (memory, done) => {
    const request = memory.get('progressions');
    request.onsuccess = () => done(request.result || []);
  }, [MEMORY]);
}

function updateProgressions(memory, candidate, done, receiptId) {
  const request = memory.get('progressions');
  request.onsuccess = () => {
    const entries = request.result || [];
    if (!candidate) { done(entries); return; }
    const store = () => {
      const key = entry => JSON.stringify([entry.style, entry.tonic, entry.chords]);
      const previous = entries.find(entry => key(entry) === key(candidate));
      if (previous?.part && !candidate.part) candidate.part = previous.part;
      if (previous?.grooveId && !candidate.grooveId) candidate.grooveId = previous.grooveId;
      candidate.weight = Math.min(100, (previous?.weight || 0) + 1);
      const next = [candidate, ...entries.filter(entry => entry !== previous)].slice(0, 32);
      memory.put(next, 'progressions');
      if (receiptId) memory.add(true, 'named:' + receiptId);
      done(next);
    };
    if (!receiptId) { store(); return; }
    const seen = memory.get('named:' + receiptId);
    seen.onsuccess = () => seen.result ? done(entries) : store();
  };
}

export function rememberNamedProgression(receiptId, context, result) {
  if (!/^[a-f0-9]{32}$/.test(receiptId) || context.beatOnly) return loadLearnedProgressions();
  const tonic = context.tonic ?? DJ_NOTES.indexOf(context.key.split(' ')[0]);
  const chords = context.progression || context.chords.map(({ text }) => {
    const root = /^[A-G](?:♭)?/.exec(text)?.[0];
    return { root: DJ_NOTES.indexOf(root), quality: text.slice(root?.length || 0) };
  });
  const [candidate] = djValidateFavoriteProgressions([{
    style: context.style, tonic, chords: validateJazzProgression(chords), part: validateJazzResult(result)
  }]);
  return useLibrary('readwrite', (memory, done) => updateProgressions(memory, candidate, done, receiptId), [MEMORY]);
}

export function download(data, name) {
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function encodeJazzWave(samples, sampleRate) {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  for (const [offset, text] of [[0, 'RIFF'], [8, 'WAVEfmt '], [36, 'data']]) {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  }
  view.setUint32(4, samples.byteLength + 36, true);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  view.setUint32(40, samples.byteLength, true);
  return new Blob([header, samples], { type: 'audio/wav' });
}

export function chordReceipt(chords, sampleRate, date = new Date()) {
  return {
    format: 'doodle-jazz-browser-receipt-v1',
    createdAt: date.toISOString(),
    chords: chords.map(({ chord, root, quality, style, key, frame }) => ({
      chord, root, quality, style, key, seconds: (frame - chords[0].frame) / sampleRate
    }))
  };
}

export function downloadReceipt(receipt) {
  download(new Blob([JSON.stringify(receipt, null, 2) + '\n'], { type: 'application/json' }), 'doodle-jazz-chords.json');
}

export async function savePassage(receipt, audio, candidate) {
  const id = crypto.randomUUID();
  const progression = candidate && receipt.groove ? { ...candidate, grooveId: id } : candidate;
  const entry = { id, receipt, audio, progression };
  return useLibrary('readwrite', (store, done, fail, transaction) => {
    const request = store.getAll();
    request.onsuccess = () => {
      if (request.result.length >= MAX_PASSAGES ||
          request.result.reduce((bytes, old) => bytes + old.audio.size, audio.size) > MAX_LIBRARY_BYTES) {
        fail(new Error('Your shelf is full. Download or remove a saved passage to make room.'));
        return;
      }
      store.add(entry);
      updateProgressions(transaction.objectStore(MEMORY), progression, progressions => done({ entry, progressions }));
    };
  }, ['passages', MEMORY]);
}

export function loadSavedGroove(id) {
  return useLibrary('readonly', (store, done) => {
    const request = store.get(id);
    request.onsuccess = () => done(request.result?.receipt.groove);
  });
}

export async function syncPassage(entry) {
  const { receipt, learned } = await sendPhraseToDoodlechain(entry);
  // A concurrent removal stays removed even if signing finished at the same time.
  await useLibrary('readwrite', store => {
    const request = store.get(entry.id);
    request.onsuccess = () => {
      if (request.result) store.put({ ...request.result, signedReceipt: receipt, learnedOnKeeper: learned });
    };
  });
  return learned;
}

let renderVersion = 0;

export async function showPassages(playGroove) {
  const version = ++renderVersion;
  const status = $('library-status');
  try {
    const entries = await useLibrary('readonly', (store, done) => {
      const request = store.getAll();
      request.onsuccess = () => done(request.result);
    });
    if (version !== renderVersion) return;
    const shelf = $('saved-chords');
    const existing = new Map(Array.from(shelf.children, card => [card.dataset.passageId, card]));
    const ids = new Set(entries.map(entry => entry.id));
    for (const [id, card] of existing) {
      if (ids.has(id)) continue;
      URL.revokeObjectURL(card.querySelector('audio').src);
      card.remove();
    }
    status.textContent = entries.length ? '' : 'Your saved passages will appear here.';
    entries.sort((a, b) => b.receipt.createdAt.localeCompare(a.receipt.createdAt));
    for (const [position, entry] of entries.entries()) {
      let card = existing.get(entry.id);
      if (!card) {
        card = document.createElement('article');
        card.dataset.passageId = entry.id;
        card.className = 'saved-passage';
        const title = document.createElement('p');
        title.textContent = entry.receipt.chords.map(({ chord }) => chord).join(' · ');
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.preload = 'none';
        audio.setAttribute('aria-label', 'Replay ' + title.textContent);
        audio.src = URL.createObjectURL(entry.audio);
        const actions = document.createElement('div');
        actions.className = 'jazz-tool-actions';
        if (entry.receipt.groove) {
          const groove = document.createElement('h3');
          groove.textContent = entry.receipt.groove.project.name;
          card.append(groove);
        }
        card.append(title, audio, actions);
        shelf.insertBefore(card, shelf.children[position] || null);
      }
      // Signing a receipt updates the actions without interrupting any replay.
      const actions = card.querySelector('.jazz-tool-actions');
      actions.replaceChildren();
      function button(text, action) {
        const control = document.createElement('button');
        control.type = 'button';
        control.textContent = text;
        control.addEventListener('click', action);
        actions.append(control);
        return control;
      }
      button('Download audio', () => download(entry.audio, 'doodle-jazz-' + entry.id + '.wav'));
      button('Chord receipt', () => downloadReceipt(entry.receipt));
      if (entry.receipt.groove) {
        const play = button('Play with band', async () => {
          play.disabled = true;
          try { await playGroove(entry); }
          catch (error) { status.textContent = error.message; }
          finally { play.disabled = false; }
        });
        button('Download beatMAP', () => download(new Blob([JSON.stringify(entry.receipt.groove.project, null, 2)],
          { type: 'application/json' }), 'doodle-jazz-' + entry.id + '.beatmap.json'));
      }
      if (entry.signedReceipt) button('Doodlechain receipt', () => downloadReceipt(entry.signedReceipt));
      const awaitingSignature = !entry.signedReceipt || (entry.progression && !entry.learnedOnKeeper);
      if (jazzChainConnected && (entry.progression || entry.receipt.rhythmOnly) && awaitingSignature) {
        const sync = button(entry.signedReceipt ? 'Retry band memory' : 'Save to Doodlechain', async () => {
          sync.disabled = true;
          try { await syncPassage(entry); await showPassages(playGroove); }
          catch (error) { status.textContent = error.message; sync.disabled = false; }
        });
      }
      const remove = button('Remove', async () => {
        remove.disabled = true;
        try {
          await useLibrary('readwrite', store => store.delete(entry.id));
          await showPassages(playGroove);
        } catch {
          remove.disabled = false;
          status.textContent = 'This passage could not be removed.';
        }
      });
    }
  } catch {
    if (version === renderVersion) status.textContent = 'The saved shelf is unavailable in this browser.';
  }
}
