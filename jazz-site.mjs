// SPDX-License-Identifier: GPL-3.0-only
import { checkSignature } from './core.mjs';
import { jazzSiteGateway, jazzSiteWitnessKey } from './jazz-site-config.mjs?v=2';

function apiURL() {
  try {
    const url = new URL(jazzSiteGateway);
    const local = location.hostname === '127.0.0.1' && url.origin === location.origin;
    if ((url.protocol === 'https:' || local) && !url.username && !url.password && !url.search && !url.hash && jazzSiteWitnessKey) {
      return new URL(url.href.replace(/\/$/, '') + '/api/jazz-site/');
    }
  } catch {}
  return null;
}

export const jazzSiteConnected = Boolean(apiURL());

export async function jazzSiteRequest(action, body, fetcher = fetch) {
  const api = apiURL();
  if (!api) {
    if (action === 'config') return { ready: false, message: 'Song naming opens when the Doodlekeeper checkout is connected.' };
    throw new Error('The Doodlekeeper checkout is offline. Keep your receipt and try again.');
  }
  const response = await fetcher(new URL(action, api), {
    method: body ? 'POST' : 'GET',
    credentials: 'omit', redirect: 'error', cache: 'no-store',
    signal: AbortSignal.timeout(30000),
    headers: body ? { 'Content-Type': 'application/json', 'X-Jazz-Request': '1' } : {},
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const reply = await response.json();
  if (!response.ok) throw new Error(reply.error || 'Doodlekeeper could not finish. Keep your receipt and try again.');
  if (action === 'config' && (reply.doodlechain !== true || reply.publicKey !== jazzSiteWitnessKey)) {
    throw new Error('The site could not verify its Doodlekeeper connection.');
  }
  return reply;
}

export async function sendPhraseToDoodlechain(entry) {
  const bytes = await crypto.subtle.digest('SHA-256', await entry.audio.arrayBuffer());
  const audioSha256 = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
  const { receipt, learned } = await jazzSiteRequest('remember', {
    requestId: entry.id, passage: entry.progression, captured: { chords: entry.receipt.chords, audioSha256 }
  });
  if (receipt?.publicKey !== jazzSiteWitnessKey || receipt?.record?.requestId !== entry.id ||
      receipt?.record?.captured?.audioSha256 !== audioSha256 ||
      !await checkSignature(receipt.record, receipt.signature, jazzSiteWitnessKey)) {
    throw new Error('The site could not verify the Doodlechain signature.');
  }
  return { receipt, learned: learned === true };
}
