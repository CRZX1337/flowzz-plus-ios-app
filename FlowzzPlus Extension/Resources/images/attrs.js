(() => {
'use strict';
/**
 * flowzz+ Attribut-Index laden und Attribute filtern.
 * Wird in content.js eingebunden (Build inlined beide Teile).
 *
 * Index-Format (attrs.json.gz, entpackt):
 * {
 *   version, generated, count,
 *   catalog: { id: {slug, cat, name, origin, producer, thc, cbd, price, avail, genetic, rating} },
 *   labels:  { id: {label, type} },
 *   products:{ id: { e:[ids], t:[ids], m:[ids], s:[ids], tp:[ids] } }
 * }
 */

// Bewusst ohne medizinische Anwendungsgebiete/Nebenwirkungen: Das sind
// Community-Tags von flowzz, keine bestätigten Indikationen (HWG).
const FX_ATTR_TYPES = [
  { key: 'e', type: 'effect', title: 'Wirkung (subjektiv)', source: 'effect' },
  { key: 't', type: 'taste', title: 'Geschmack', source: 'taste' },
  { key: 'tp', type: 'terpene', title: 'Terpene', source: 'terpene' }
];

const ATTR_PREFIX = { e: 'eff', t: 'taste', tp: 'terp' };
const PREFIX_ATTR = { eff: 'e', taste: 't', terp: 'tp' };

const gzipB64 = (b64) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (typeof DecompressionStream === 'undefined') {
    return Promise.reject(new Error('DecompressionStream fehlt'));
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
};

/**
 * Lädt den Index aus dem Extension-Bundle (gzip) oder per fetch von der URL.
 * Gibt { catalog, labels, products, version } zurück.
 */
const FX_EXTENSION_API = typeof browser !== 'undefined' ? browser :
  (typeof chrome !== 'undefined' ? chrome : null);

async function fxFetchBytes(url, timeoutMs) {
  const parsedURL = new URL(url, location.href);
  if (parsedURL.origin === 'https://raw.githubusercontent.com') {
    if (!FX_EXTENSION_API || !FX_EXTENSION_API.runtime || !FX_EXTENSION_API.runtime.sendMessage) {
      throw new Error('Kein Extension-Hintergrund verfügbar');
    }
    const reply = await FX_EXTENSION_API.runtime.sendMessage({ type: 'FX_FETCH_REMOTE', url: parsedURL.toString() });
    if (!reply || !reply.ok) throw new Error(reply && reply.error ? reply.error : 'Netzwerkfehler');
    const binary = atob(reply.body);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-cache' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.arrayBuffer();
  } finally {
    clearTimeout(timeout);
  }
}

async function fxLoadIndex({ base64, url, timeoutMs = 8000 }) {
  const parse = (text) => {
    const data = JSON.parse(text);
    if (!data || !data.products) throw new Error('Index ohne products');
    return data;
  };
  if (base64) {
    return parse(await gzipB64(base64));
  }
  if (url) {
    const buf = await fxFetchBytes(url, timeoutMs);
    // gzip magic 1f 8b?
    const head = new Uint8Array(buf.slice(0, 2));
    if (head[0] === 0x1f && head[1] === 0x8b) {
      if (typeof DecompressionStream === 'undefined') throw new Error('kein gunzip');
      const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
      return parse(await new Response(stream).text());
    }
    return parse(new TextDecoder().decode(buf));
  }
  throw new Error('kein Index');
}

/** Produkt-Attribute als Set-Schnitt prüfen. */
function fxMatchesAttrs(attrs, selected) {
  for (const key of Object.keys(selected)) {
    const wanted = selected[key];
    if (!wanted || !wanted.size) continue;
    const have = attrs && attrs[key];
    if (!have || !have.length) return false;
    let hit = false;
    for (const id of have) {
      if (wanted.has(id)) { hit = true; break; }
    }
    if (!hit) return false;
  }
  return true;
}

/** Label für eine Attribut-ID im richtigen Namensraum (Terpene getrennt). */
function fxLabelOf(index, key, id) {
  if (!index) return String(id);
  if (key === 'tp') {
    const t = index.terpLabels && index.terpLabels[String(id)];
    if (t) return t;
  }
  const l = index.labels && index.labels[String(id)];
  if (l && typeof l === 'object') return l.label || String(id);
  if (typeof l === 'string') return l;
  return String(id);
}

/** Labels einer Kategorie, sortiert nach Häufigkeit im aktuellen Index. */
function fxLabelList(index, key) {
  const counts = new Map();
  for (const attrs of Object.values(index.products)) {
    for (const id of (attrs[key] || [])) counts.set(id, (counts.get(id) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, n]) => ({ id, n, label: fxLabelOf(index, key, id) }))
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'de'));
}

if (typeof window !== 'undefined') {
  window.fxLoadIndex = fxLoadIndex;
  window.fxMatchesAttrs = fxMatchesAttrs;
  window.fxLabelList = fxLabelList;
  window.fxLabelOf = fxLabelOf;
  window.FX_ATTR_TYPES = FX_ATTR_TYPES;
  window.ATTR_PREFIX = ATTR_PREFIX;
  window.PREFIX_ATTR = PREFIX_ATTR;
}

})();
