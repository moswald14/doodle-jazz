// SPDX-License-Identifier: GPL-3.0-only
const MAX_LIBRARY_BYTES = 64 * 1024 * 1024;
const MAX_PASSAGES = 24;
const $ = id => document.getElementById(id);

function openLibrary() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('doodle-jazz-passages', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('passages', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close your other Doodle Jazz tabs and try again.'));
  });
}

async function useLibrary(mode, perform) {
  const database = await openLibrary();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction('passages', mode);
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(failure || transaction.error);
      let result, failure;
      perform(transaction.objectStore('passages'), value => { result = value; }, error => {
        failure = error;
        transaction.abort();
      });
    });
  } finally {
    database.close();
  }
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

export async function savePassage(receipt, audio) {
  const entry = { id: crypto.randomUUID(), receipt, audio };
  await useLibrary('readwrite', (store, done, fail) => {
    const request = store.getAll();
    request.onsuccess = () => {
      if (request.result.length >= MAX_PASSAGES ||
          request.result.reduce((bytes, old) => bytes + old.audio.size, audio.size) > MAX_LIBRARY_BYTES) {
        fail(new Error('Your shelf is full. Download or remove a saved passage to make room.'));
        return;
      }
      store.add(entry);
    };
  });
}

const urls = new Set();
let renderVersion = 0;

export function releasePassageAudio() {
  for (const url of urls) URL.revokeObjectURL(url);
  urls.clear();
}

export async function showPassages() {
  const version = ++renderVersion;
  const status = $('library-status');
  try {
    const entries = await useLibrary('readonly', (store, done) => {
      const request = store.getAll();
      request.onsuccess = () => done(request.result);
    });
    if (version !== renderVersion) return;
    const shelf = $('saved-chords');
    shelf.replaceChildren();
    releasePassageAudio();
    status.textContent = entries.length ? '' : 'Your saved passages will appear here.';
    entries.sort((a, b) => b.receipt.createdAt.localeCompare(a.receipt.createdAt));
    for (const entry of entries) {
      const card = document.createElement('article');
      card.className = 'saved-passage';
      const title = document.createElement('p');
      title.textContent = entry.receipt.chords.map(({ chord }) => chord).join(' · ');
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.preload = 'none';
      audio.setAttribute('aria-label', 'Replay ' + title.textContent);
      audio.src = URL.createObjectURL(entry.audio);
      urls.add(audio.src);
      const actions = document.createElement('div');
      actions.className = 'jazz-tool-actions';
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
      const remove = button('Remove', async () => {
        remove.disabled = true;
        try {
          await useLibrary('readwrite', store => store.delete(entry.id));
          await showPassages();
        } catch {
          remove.disabled = false;
          status.textContent = 'This passage could not be removed.';
        }
      });
      card.append(title, audio, actions);
      shelf.append(card);
    }
  } catch {
    if (version === renderVersion) status.textContent = 'The saved shelf is unavailable in this browser.';
  }
}
