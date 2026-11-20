// SPDX-License-Identifier: GPL-3.0-only
import { canonical, checkSignature, unb64 } from './core.mjs';
import { jazzSiteGateway, jazzSiteWitnessKey } from './jazz-site-config.mjs?v=2';

const connectionKey = 'doodle-jazz-doodlechain-v1';

function apiURL(address, allowLoopback = false) {
  try {
    const url = new URL(address);
    const local = allowLoopback && location.hostname === '127.0.0.1' && url.origin === location.origin;
    if ((url.protocol === 'https:' || local) && !url.username && !url.password && !url.search && !url.hash) {
      return new URL(url.href.replace(/\/$/, '').replace(/\/api\/jazz-site(?:\/config)?$/, '') + '/api/jazz-site/');
    }
  } catch {}
  return null;
}

const checkout = jazzSiteWitnessKey && apiURL(jazzSiteGateway, true);
let chain = checkout ? { api: checkout, publicKey: jazzSiteWitnessKey } : null;
try {
  const saved = JSON.parse(localStorage.getItem(connectionKey));
  const api = apiURL(saved?.address);
  if (api && typeof saved.publicKey === 'string' && saved.publicKey.length <= 256) chain = { api, publicKey: saved.publicKey };
} catch {}
export let jazzChainConnected = Boolean(chain);

async function request(api, action, body, fetcher = fetch) {
  const response = await fetcher(new URL(action, api), {
    method: body ? 'POST' : 'GET',
    credentials: 'omit', redirect: 'error', cache: 'no-store',
    signal: AbortSignal.timeout(30000),
    headers: body ? { 'Content-Type': 'application/json', 'X-Jazz-Request': '1' } : {},
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const reply = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(reply.error || 'Doodlekeeper could not finish. Keep your receipt and try again.');
  return reply;
}

function verifyConnection(reply, publicKey) {
  if (reply?.doodlechain !== true || publicKey && reply.publicKey !== publicKey) {
    throw new Error('The site could not verify its Doodlekeeper connection.');
  }
}

export async function jazzSiteRequest(action, body, fetcher = fetch) {
  if (!checkout) {
    if (action === 'config') return { ready: false, message: 'Song naming opens when the Doodlekeeper checkout is connected.' };
    throw new Error('The Doodlekeeper checkout is offline. Keep your receipt and try again.');
  }
  const reply = await request(checkout, action, body, fetcher);
  if (action === 'config') verifyConnection(reply, jazzSiteWitnessKey);
  return reply;
}

export async function connectJazzChain(address) {
  const api = apiURL(address);
  if (!api) throw new Error('Enter the Jazz-only HTTPS address from Doodlekeeper.');
  const reply = await request(api, 'config');
  verifyConnection(reply, chain?.api.href === api.href ? chain.publicKey : undefined);
  if (reply.grooveVersion !== 1 || reply.receipts?.available !== true) throw new Error('This Keeper is not ready to sign saved grooves.');
  try {
    if (reply.publicKey.length > 256) throw new Error();
    await crypto.subtle.importKey('spki', unb64(reply.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  } catch { throw new Error('Doodlekeeper did not provide a valid signing key.'); }
  try { localStorage.setItem(connectionKey, JSON.stringify({ address: api.href, publicKey: reply.publicKey })); }
  catch { throw new Error('This browser could not save the Doodlechain connection.'); }
  chain = { api, publicKey: reply.publicKey };
  jazzChainConnected = true;
}

export async function sendPhraseToDoodlechain(entry) {
  const destination = chain;
  if (!destination) throw new Error('Connect Doodlechain to sign this saved passage.');
  const { groove, chords, rhythmOnly, tonic } = entry.receipt;
  if (groove || rhythmOnly) {
    const config = await request(destination.api, 'config');
    verifyConnection(config, destination.publicKey);
    if (config.grooveVersion !== 1) throw new Error('Doodlekeeper needs the groove update to sign this beatMAP. The passage is saved here.');
  }
  const bytes = await crypto.subtle.digest('SHA-256', await entry.audio.arrayBuffer());
  const audioSha256 = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
  const captured = { chords, audioSha256, ...(groove ? { groove } : {}), ...(rhythmOnly ? { rhythmOnly: true } : {}) };
  const passage = entry.progression || { style: chords[4].style, tonic, chords: chords.map(({root, quality}) => ({root, quality})) };
  const { receipt, learned } = await request(destination.api, 'remember', {
    requestId: entry.id, passage, captured
  });
  if (receipt?.publicKey !== destination.publicKey || receipt?.record?.requestId !== entry.id ||
      !receipt?.record?.captured || canonical(receipt.record.captured) !== canonical(captured) ||
      !await checkSignature(receipt.record, receipt.signature, destination.publicKey)) {
    throw new Error('The site could not verify the Doodlechain signature.');
  }
  return { receipt, learned: learned === true };
}
