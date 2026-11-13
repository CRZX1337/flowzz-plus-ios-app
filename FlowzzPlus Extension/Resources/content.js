/* flowzz+ · Herkunft, Preise & Suche
 * Erweitert flowzz.com um eine eigene Produktsuche mit Herkunfts-, Preis-,
 * THC-, Hersteller- und Bestrahlungsfilter – für Blüten, Extrakte und Edibles.
 * Zusatz: Apotheken-Preisvergleich, Favoriten, Preisalarm, CSV-Export.
 * Läuft als Content-Script (Firefox/Chrome) und als Userscript.
 */
(() => {
  if (window.__FX_LOADED__) return;
  window.__FX_LOADED__ = true;

  const PAGE_SIZE = 240;
  const CACHE_TTL = 6 * 60 * 60 * 1000;
  const VENDOR_TTL = 24 * 60 * 60 * 1000;
  const PAGE_STEP = 60;
  const VERSION = '1.5.1';

  const UPDATE_JSON = 'https://api.github.com/repos/CRZX1337/flowzz-plus/releases/latest';

  const CATEGORIES = [
    { id: 'flowers', label: 'Blüten', endpoint: '/api/v1/views/flowers', pricePath: '2', file: 'blueeten' },
    { id: 'extracts', label: 'Extrakte', endpoint: '/api/v1/views/extracts', pricePath: '3', file: 'extrakte' },
    { id: 'edibles', label: 'Edibles', endpoint: '/api/v1/views/edibles', pricePath: '4', file: 'edibles' }
  ];

  const extensionAPI = typeof browser !== 'undefined' ? browser :
    (typeof chrome !== 'undefined' ? chrome : null);
  const HAS_EXTENSION = Boolean(extensionAPI && extensionAPI.runtime && extensionAPI.runtime.id);
  const CSS_URL = HAS_EXTENSION ? extensionAPI.runtime.getURL('content.css') : null;

  async function fetchRemote(url, options = {}) {
    if (!HAS_EXTENSION || !extensionAPI.runtime.sendMessage) return fetch(url, options);
    const reply = await extensionAPI.runtime.sendMessage({ type: 'FX_FETCH_REMOTE', url });
    if (!reply || !reply.ok) throw new Error(reply && reply.error ? reply.error : 'Netzwerkfehler');
    const binary = atob(reply.body);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Response(bytes, { status: reply.status || 200 });
  }

  /* ---------- Herkunft normalisieren ---------- */

  const ORIGIN_ALIAS = {
    'spain': 'Spanien',
    'süd afrika': 'Südafrika',
    'suedafrika': 'Südafrika',
    'nord mazedonien': 'Nordmazedonien',
    'mazedonien': 'Nordmazedonien',
    'kanalinseln': 'Jersey',
    'england': 'Vereinigtes Königreich',
    'vereinigtes königreich': 'Vereinigtes Königreich',
    'usa': 'USA',
    'deutschland': 'Deutschland'
  };

  const FLAGS = {
    'Kanada': '🇨🇦', 'Portugal': '🇵🇹', 'Tschechien': '🇨🇿', 'Deutschland': '🇩🇪',
    'Nordmazedonien': '🇲🇰', 'Dänemark': '🇩🇰', 'Südafrika': '🇿🇦', 'Kolumbien': '🇨🇴',
    'Spanien': '🇪🇸', 'Australien': '🇦🇺', 'Israel': '🇮🇱', 'Schweiz': '🇨🇭',
    'Thailand': '🇹🇭', 'Griechenland': '🇬🇷', 'Lesotho': '🇱🇸', 'Argentinien': '🇦🇷',
    'Jersey': '🇯🇪', 'Uruguay': '🇺🇾', 'Niederlande': '🇳🇱', 'Vereinigtes Königreich': '🇬🇧',
    'Malta': '🇲🇹', 'USA': '🇺🇸', 'Uganda': '🇺🇬', 'Simbabwe': '🇿🇼',
    'Neuseeland': '🇳🇿', 'Chile': '🇨🇱', 'Unbekannt': '🏳️'
  };

  function normOrigin(raw) {
    const s = String(raw || '').trim().replace(/\s+/g, ' ');
    if (!s) return 'Unbekannt';
    const alias = ORIGIN_ALIAS[s.toLowerCase()];
    if (alias) return alias;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function normGenetic(raw) {
    const s = String(raw || '').trim().toLowerCase();
    if (s.startsWith('ind')) return 'Indica';
    if (s.startsWith('sat')) return 'Sativa';
    if (s.startsWith('hy') || s.startsWith('hry')) return 'Hybrid';
    return '';
  }

  /* ---------- Storage ---------- */

  const store = {
    async get(key) {
      if (HAS_EXTENSION && extensionAPI.storage && extensionAPI.storage.local) {
        const result = extensionAPI.storage.local.get(key);
        if (result && typeof result.then === 'function') {
          const values = await result;
          return values ? values[key] : null;
        }
        return new Promise((resolve) => {
          extensionAPI.storage.local.get(key, (values) => resolve(values ? values[key] : null));
        });
      }
      try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
    },
    async set(key, value) {
      if (HAS_EXTENSION && extensionAPI.storage && extensionAPI.storage.local) {
        const entry = { [key]: value };
        const result = extensionAPI.storage.local.set(entry);
        if (result && typeof result.then === 'function') return result;
        return new Promise((resolve) => extensionAPI.storage.local.set(entry, resolve));
      }
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
    }
  };

  /* ---------- Helpers ---------- */

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  const eur = (v) => (v == null ? '—' : v.toFixed(2).replace('.', ',') + ' €');
  const pct = (v) => (v == null ? '—' : String(v).replace('.', ',') + '%');

  const debounce = (fn, ms) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };

  const flagOf = (origin) => FLAGS[origin] || '🌱';

  const catById = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[0];

  // Detail-Routen der Website: Blüten /product/…, Extrakte /extract/…, Edibles /edible/…
  const ROUTES = { flowers: 'product', extracts: 'extract', edibles: 'edible' };
  const routeFor = (cat) => ROUTES[cat] || 'product';

  const errMsg = (err) => (err && err.message ? err.message : String(err));

  function toast(text, kind) {
    if (!ui.shadow) return;
    let box = ui.shadow.querySelector('.fx-toast');
    if (!box) {
      box = el('div', 'fx-toast');
      ui.shadow.appendChild(box);
    }
    box.textContent = text;
    box.className = 'fx-toast is-visible' + (kind ? ' fx-toast-' + kind : '');
    clearTimeout(ui.toastTimer);
    ui.toastTimer = setTimeout(() => box.classList.remove('is-visible'), 4200);
  }

  /* ---------- State ---------- */

  const state = {
    items: [],
    loadedAt: 0,
    loading: false,
    error: null,
    progress: { n: 0, total: 0 },
    visible: PAGE_STEP,
    opened: false,
    facetsBuilt: false,
    category: 'flowers',
    theme: 'auto',
    favorites: new Set(),
    compare: new Set(),
    prices: new Map(),
    pricesLoading: false,
    vendors: null,
    filters: {
      q: '',
      origins: new Set(),
      producers: new Set(),
      genetic: '',
      thcMin: null,
      thcMax: null,
      priceMax: null,
      irr: '',
      onlyAvail: false,
      onlyFavs: false,
      sort: 'popularity',
      attrs: { e: new Set(), t: new Set(), tp: new Set() }
    }
  };

  const ui = {};

  /* ---------- Daten ---------- */

  function normalize(p, cat) {
    const img = p.image && p.image.data && p.image.data.attributes;
    const small = img && img.formats && img.formats.small ? img.formats.small.url : (img ? img.url : '');
    return {
      id: p.id,
      cat,
      slug: p.url,
      name: p.name || '',
      strain: p.strain_name || p.name || '',
      producer: p.producer_name || '',
      origin: normOrigin(p.origin),
      thc: typeof p.thc === 'number' ? p.thc : null,
      cbd: typeof p.cbd === 'number' ? p.cbd : null,
      price: typeof p.min_price === 'number' ? p.min_price : null,
      priceMax: typeof p.max_price === 'number' ? p.max_price : null,
      rating: typeof p.ratings_score === 'number' ? p.ratings_score : null,
      ratingCount: p.ratings_count || 0,
      genetic: normGenetic(p.genetic),
      irr: !!p.irradiated,
      avail: p.availibility === 1,
      img: small || '',
      unit: p.unit || '',
      published: p.published_at || p.created_at || ''
    };
  }

  async function fetchCategory(catId, onProgress) {
    const cat = catById(catId);
    let page = 1;
    let total = 0;
    const out = [];
    const seen = new Set();
    for (;;) {
      const url = `${cat.endpoint}?pagination%5BpageSize%5D=${PAGE_SIZE}&pagination%5Bpage%5D=${page}`;
      const res = await fetch(url, { credentials: 'same-origin', headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      const payload = json && json.data;
      const rows = (payload && payload.data) || [];
      total = (payload && payload.meta && payload.meta.pagination && payload.meta.pagination.total) || total;
      for (const row of rows) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        out.push(normalize(row, catId));
      }
      if (onProgress) onProgress(out.length, total);
      const next = payload && payload.meta && payload.meta.pagination && payload.meta.pagination.hasNextPage;
      if (!next || !rows.length) break;
      page += 1;
    }
    out.forEach((p, i) => { p.rank = i; });
    return { items: out, loadedAt: Date.now(), cat: catId };
  }

  async function loadCategory(catId, force) {
    // Kategorie-Wechsel während eines laufenden Ladevorgangs zulassen:
    // die alte Antwort wird verworfen, sobald eine andere Kategorie aktiv ist.
    state.error = null;
    state.prices = new Map();
    state.pricesLoading = false;

    if (!force) {
      const cached = await store.get('fx_cache_v3_' + catId);
      if (cached && cached.items && cached.items.length) {
        state.items = cached.items;
        state.loadedAt = cached.loadedAt;
        state.facetsBuilt = false;
        render();
        if (Date.now() - cached.loadedAt < CACHE_TTL) return;
      }
    }

    state.loading = true;
    state.progress = { n: 0, total: 0 };
    renderLoading();
    try {
      const fresh = await fetchCategory(catId, (n, total) => {
        if (state.category !== catId) return;
        state.progress = { n, total };
        renderLoading();
      });
      if (state.category !== catId) return;
      state.items = fresh.items;
      state.loadedAt = fresh.loadedAt;
      state.facetsBuilt = false;
      await store.set('fx_cache_v3_' + catId, fresh);
      render();
    } catch (err) {
      state.error = err;
      if (!state.items.length && ui.grid) {
        ui.grid.textContent = '';
        ui.empty.hidden = false;
        ui.emptyTitle.textContent = 'Daten konnten nicht geladen werden';
        ui.emptyText.textContent = 'Bitte die Seite neu laden. (' + errMsg(err) + ')';
        ui.emptyReset.hidden = true;
      }
    } finally {
      if (state.category === catId) {
        state.loading = false;
        renderLoading();
      }
    }
  }

  /* ---------- Apotheken-Preise ---------- */

  function parsePriceRow(row) {
    if (Array.isArray(row)) {
      return { pid: Number(row[0]), price: Number(row[1]), avail: Number(row[2]) === 1, vendor: Number(row[3]) };
    }
    if (row && typeof row === 'object') {
      return {
        pid: Number(row.product || row.product_id || row.id),
        price: Number(row.price),
        avail: row.availability === 1 || row.availibility === 1 || row.available === true,
        vendor: Number(row.vendor || row.vendor_id)
      };
    }
    return null;
  }

  async function loadPrices(ids) {
    const cat = catById(state.category);
    const missing = ids.filter((id) => id && !state.prices.has(Number(id)));
    if (!missing.length || state.pricesLoading) return;
    state.pricesLoading = true;
    try {
      const chunk = missing.slice(0, 300).join(',');
      const res = await fetch(`/api/v1/views/vendors/prices/${cat.pricePath}/${chunk}`, {
        credentials: 'same-origin', headers: { accept: 'application/json' }
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      const rows = Array.isArray(json.data) ? json.data : [];
      const grouped = new Map();
      for (const raw of rows) {
        const r = parsePriceRow(raw);
        if (!r || !r.pid || !r.price) continue;
        if (!grouped.has(r.pid)) grouped.set(r.pid, []);
        grouped.get(r.pid).push(r);
      }
      for (const [pid, offers] of grouped) {
        offers.sort((a, b) => a.price - b.price);
        state.prices.set(pid, {
          min: offers[0].price,
          count: offers.filter((o) => o.avail).length || offers.length,
          offers
        });
      }
      updatePriceLabels();
    } catch (e) {
      /* Preise sind Beiwerk – Fehler nicht eskalieren */
    } finally {
      state.pricesLoading = false;
    }
  }

  function updatePriceLabels() {
    if (!ui.shadow) return;
    ui.shadow.querySelectorAll('.fx-card[data-id]').forEach((card) => {
      const info = state.prices.get(Number(card.dataset.id));
      const line = card.querySelector('.fx-offers');
      if (!line) return;
      line.textContent = info
        ? info.count + (info.count === 1 ? ' Apotheke' : ' Apotheken') + ' · günstigste ' + eur(info.min)
        : 'Preise vergleichen';
    });
  }

  async function loadVendors() {
    if (state.vendors) return state.vendors;
    const cached = await store.get('fx_vendors_v1');
    if (cached && cached.ts && Date.now() - cached.ts < VENDOR_TTL && cached.map) {
      state.vendors = cached.map;
      return state.vendors;
    }
    let map = null;
    try {
      const nd = document.getElementById('__NEXT_DATA__');
      if (nd) {
        const data = JSON.parse(nd.textContent);
        const pp = data && data.props && data.props.pageProps;
        const vendors = pp && pp.productFilterData && pp.productFilterData.vendors;
        if (Array.isArray(vendors)) map = vendors;
      }
    } catch (e) { /* ignore */ }

    if (!map) {
      try {
        const res = await fetch('/product', { credentials: 'same-origin' });
        const html = await res.text();
        const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
        if (m) {
          const data = JSON.parse(m[1]);
          map = data.props.pageProps.productFilterData.vendors;
        }
      } catch (e) { /* ignore */ }
    }

    if (Array.isArray(map)) {
      const slim = {};
      for (const v of map) slim[v.id] = { name: (v.name || '').trim(), city: v.city || '', plz: v.plz || '' };
      state.vendors = slim;
      await store.set('fx_vendors_v1', { ts: Date.now(), map: slim });
    }
    return state.vendors || {};
  }

  /* ---------- Favoriten & Alarme ---------- */

  function toggleFavorite(p) {
    if (state.favorites.has(p.id)) state.favorites.delete(p.id);
    else state.favorites.add(p.id);
    saveFavorites();
    renderFacets();
    renderGrid();
  }

  async function loadUserData() {
    const favs = await store.get('fx_favs_v1');
    if (Array.isArray(favs)) state.favorites = new Set(favs.map(Number));
  }

  async function saveFavorites() {
    await store.set('fx_favs_v1', [...state.favorites]);
  }

  /* ---------- Filterlogik ---------- */

  function matches(p, f, skip) {
    if (f.q) {
      const hay = (p.name + ' ' + p.strain + ' ' + p.producer + ' ' + p.origin).toLowerCase();
      for (const t of f.q.toLowerCase().split(/\s+/).filter(Boolean)) if (!hay.includes(t)) return false;
    }
    if (f.onlyFavs && !state.favorites.has(p.id)) return false;
    if (skip !== 'origin' && f.origins.size && !f.origins.has(p.origin)) return false;
    if (skip !== 'producer' && f.producers.size && !f.producers.has(p.producer)) return false;
    if (f.genetic && p.genetic !== f.genetic) return false;
    if (f.thcMin != null && (p.thc == null || p.thc < f.thcMin)) return false;
    if (f.thcMax != null && (p.thc == null || p.thc > f.thcMax)) return false;
    if (f.priceMax != null && (p.price == null || p.price > f.priceMax)) return false;
    if (f.irr === 'no' && p.irr) return false;
    if (f.irr === 'yes' && !p.irr) return false;
    if (f.onlyAvail && !p.avail) return false;
    if (window.fxMatchesAttrs && !window.fxMatchesAttrs(state.attrOf(p.id), f.attrs)) return false;
    return true;
  }

  /** Attribute eines Produkts aus dem Index (oder null). */
  function attrOf(id) {
    const idx = window.fxAttrs && window.fxAttrs.index;
    if (!idx) return null;
    return idx.products[String(id)] || null;
  }

  state.attrOf = attrOf;

  /** Trefferzahl für ein Attribut, alle anderen Filter angewendet. */
  function attrCount(key, id) {
    const f = state.filters;
    let n = 0;
    for (const p of state.items) {
      if (!matches(p, f)) continue;
      const a = attrOf(p.id);
      if (a && a[key] && a[key].includes(id)) n++;
    }
    return n;
  }

  function toggleAttr(key, id, on) {
    const set = state.filters.attrs[key];
    if (on) set.add(id); else set.delete(id);
    state.visible = PAGE_STEP;
    render();
    syncURL();
  }

  function selectedAttrs(key) {
    return state.filters.attrs[key];
  }

  function sorted(list) {
    const f = state.filters;
    const copy = list.slice();
    switch (f.sort) {
      case 'price-asc': copy.sort((a, b) => (a.price == null) - (b.price == null) || a.price - b.price); break;
      case 'thc-desc': copy.sort((a, b) => (b.thc == null) - (a.thc == null) || b.thc - a.thc); break;
      case 'rating': copy.sort((a, b) => (b.rating || 0) - (a.rating || 0) || b.ratingCount - a.ratingCount); break;
      case 'new': copy.sort((a, b) => String(b.published).localeCompare(String(a.published))); break;
      default: copy.sort((a, b) => a.rank - b.rank);
    }
    return copy;
  }

  function currentList() {
    return sorted(state.items.filter((p) => matches(p, state.filters)));
  }

  function facetCounts(kind) {
    const counts = new Map();
    const f = state.filters;
    for (const p of state.items) {
      if (!matches(p, f, kind)) continue;
      const key = kind === 'origin' ? p.origin : p.producer;
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }

  /* ---------- Overlay ---------- */

  function ensureHost() {
    if (ui.host) return ui.host;
    const host = document.createElement('div');
    host.id = 'fx-host';
    host.style.position = 'fixed';
    host.style.inset = '0';
    host.style.zIndex = '2147483600';
    host.style.pointerEvents = 'none';
    (document.body || document.documentElement).appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    if (CSS_URL) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = CSS_URL;
      shadow.appendChild(link);
    } else if (typeof window.__FX_CSS === 'string') {
      const style = document.createElement('style');
      style.textContent = window.__FX_CSS;
      shadow.appendChild(style);
    }
    ui.host = host;
    ui.shadow = shadow;
    return host;
  }

  function buildOverlay() {
    const shadow = ui.shadow;
    const app = el('div', 'fx-app');
    app.setAttribute('role', 'dialog');
    app.setAttribute('aria-label', 'flowzz+ Suche');

    const top = el('header', 'fx-top');
    const brand = el('div', 'fx-brand');
    brand.append(el('span', 'fx-logo', 'f+'));
    const brandText = el('div', 'fx-brandtext');
    brandText.append(el('b', null, 'flowzz+'), el('small', null, 'Herkunft & Preise'));
    brand.append(brandText);

    const searchWrap = el('div', 'fx-search');
    searchWrap.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M10.5 3a7.5 7.5 0 0 1 5.9 12.1l4.3 4.3-1.4 1.4-4.3-4.3A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z"/></svg>';
    const input = document.createElement('input');
    input.type = 'search';
    input.placeholder = 'Sorte, Hersteller, Herkunft …';
    input.setAttribute('aria-label', 'Suche');
    input.spellcheck = false;
    const kbd = el('kbd', null, '/');
    searchWrap.append(input, kbd);

    ui.helpBtn = el('button', 'fx-iconbtn fx-helpbtn', '?');
    ui.helpBtn.type = 'button';
    ui.helpBtn.title = 'Tastaturkürzel';
    ui.helpBtn.setAttribute('aria-label', 'Tastaturkürzel anzeigen');
    ui.helpBtn.addEventListener('click', openShortcuts);

    ui.themeBtn = el('button', 'fx-iconbtn fx-themebtn', '☾');
    ui.themeBtn.type = 'button';
    ui.themeBtn.title = 'Dunkelmodus';
    ui.themeBtn.addEventListener('click', toggleTheme);

    const close = el('button', 'fx-close');
    close.type = 'button';
    close.innerHTML = '<span>Schließen</span><kbd>Esc</kbd>';
    close.addEventListener('click', closeOverlay);

    top.append(brand, searchWrap, ui.helpBtn, ui.themeBtn, close);

    const tabs = el('nav', 'fx-tabs');
    ui.tabs = new Map();
    for (const cat of CATEGORIES) {
      const b = el('button', 'fx-tab', cat.label);
      b.type = 'button';
      b.dataset.cat = cat.id;
      b.addEventListener('click', () => switchCategory(cat.id));
      tabs.append(b);
      ui.tabs.set(cat.id, b);
    }

    const body = el('div', 'fx-body');
    const side = el('aside', 'fx-side');
    const main = el('main', 'fx-main');

    const sideHead = el('div', 'fx-side-head');
    const countBox = el('div', 'fx-countbox');
    ui.countNum = el('b', null, '–');
    ui.countLabel = el('span', null, 'Blüten');
    countBox.append(ui.countNum, ui.countLabel);
    const resetBtn = el('button', 'fx-reset', 'Zurücksetzen');
    resetBtn.type = 'button';
    resetBtn.addEventListener('click', resetFilters);
    sideHead.append(countBox, resetBtn);

    ui.facets = { origins: new Map() };
    ui.originSection = buildOriginSection();
    ui.producerSection = buildProducerSection();
    ui.priceSection = buildPriceSection();
    ui.thcSection = buildThcSection();
    ui.geneticSection = buildGeneticSection();
    ui.irrSection = buildIrrSection();
    ui.availSection = buildAvailSection();
    ui.favSection = buildFavSection();
    ui.themeSection = buildThemeSection();

    ui.attrHost = el('div', 'fx-attr-host');
    ui.dataNote = el('div', 'fx-datanote', '');
    ui.updateCheck = el('button', 'fx-updatecheck', 'Nach Update suchen');
    ui.updateCheck.type = 'button';
    ui.updateCheck.addEventListener('click', () => checkUpdate(true));
    side.append(
      sideHead,
      ui.originSection.node,
      ui.producerSection.node,
      ui.priceSection.node,
      ui.thcSection.node,
      ui.geneticSection.node,
      ui.irrSection.node,
      ui.availSection.node,
      ui.favSection.node,
      ui.themeSection.node,
      ui.attrHost,
      ui.updateCheck,
      ui.dataNote
    );

    const toolbar = el('div', 'fx-toolbar');
    ui.resultText = el('div', 'fx-resulttext');
    const tools = el('div', 'fx-tools');
    const sortWrap = el('label', 'fx-select');
    sortWrap.append(el('span', null, 'Sortieren'));
    const sort = document.createElement('select');
    [
      ['popularity', 'Empfohlen'],
      ['price-asc', 'Preis aufsteigend'],
      ['thc-desc', 'THC absteigend'],
      ['rating', 'Bewertung'],
      ['new', 'Neueste']
    ].forEach(([v, label]) => { const o = document.createElement('option'); o.value = v; o.textContent = label; sort.appendChild(o); });
    sort.value = state.filters.sort;
    sort.addEventListener('change', () => { state.filters.sort = sort.value; state.visible = PAGE_STEP; render(); syncURL(); });
    ui.sort = sort;
    sortWrap.append(sort);

    const shareBtn = el('button', 'fx-iconbtn', '↗');
    shareBtn.type = 'button';
    shareBtn.title = 'Link zu dieser Auswahl kopieren';
    shareBtn.setAttribute('aria-label', 'Link kopieren');
    shareBtn.addEventListener('click', shareLink);

    const csvBtn = el('button', 'fx-iconbtn fx-csvbtn', 'CSV');
    csvBtn.type = 'button';
    csvBtn.title = 'Aktuelle Auswahl als CSV exportieren';
    csvBtn.addEventListener('click', () => exportCSV(currentList()));

    const refresh = el('button', 'fx-iconbtn', '↻');
    refresh.type = 'button';
    refresh.title = 'Daten aktualisieren';
    refresh.addEventListener('click', () => loadCategory(state.category, true));

    const mobileFilter = el('button', 'fx-mobilefilter', 'Filter');
    mobileFilter.type = 'button';
    mobileFilter.addEventListener('click', () => side.classList.toggle('fx-side-open'));

    tools.append(sortWrap, shareBtn, csvBtn, refresh, mobileFilter);
    toolbar.append(ui.resultText, tools);

    ui.grid = el('div', 'fx-grid');
    ui.empty = el('div', 'fx-empty');
    ui.empty.hidden = true;
    ui.emptyTitle = el('b', null, 'Nichts gefunden');
    ui.emptyText = el('span', null, 'Filter lockern oder Suche zurücksetzen.');
    ui.emptyReset = el('button', 'fx-btn fx-btn-primary', 'Alle Filter zurücksetzen');
    ui.emptyReset.type = 'button';
    ui.emptyReset.addEventListener('click', resetFilters);
    ui.empty.append(ui.emptyTitle, ui.emptyText, ui.emptyReset);
    const moreWrap = el('div', 'fx-more');
    ui.moreBtn = el('button', 'fx-btn', 'Mehr laden');
    ui.moreBtn.type = 'button';
    ui.moreBtn.addEventListener('click', () => { state.visible += PAGE_STEP; renderGrid(); });
    moreWrap.append(ui.moreBtn);

    ui.progress = el('div', 'fx-loading');
    ui.progress.hidden = true;
    ui.progress.innerHTML = '<div class="fx-progress"><i></i></div><span>Daten werden geladen …</span>';
    ui.progressBar = ui.progress.querySelector('i');
    ui.progressText = ui.progress.querySelector('span');

    ui.chips = el('div', 'fx-chips');
    ui.chips.hidden = true;
    main.append(toolbar, ui.chips, ui.progress, ui.grid, ui.empty, moreWrap);

    ui.tray = el('div', 'fx-tray');
    ui.tray.hidden = true;
    app.append(ui.tray);
    body.append(side, main);
    app.append(top, tabs, body);
    shadow.appendChild(app);

    ui.app = app;
    ui.input = input;
    ui.side = side;

    if (window.fxAttrs) {
      ui.attrs = window.fxAttrs.mount(ui.attrHost, {
        getSelected: selectedAttrs,
        toggle: toggleAttr,
        countFor: attrCount,
        onChange: render,
        notify: toast
      });
    }

    ui.modal = el('div', 'fx-modal');
    ui.modal.hidden = true;
    ui.modalCard = el('div', 'fx-modal-card');
    ui.modal.append(ui.modalCard);
    ui.modal.addEventListener('click', (e) => { if (e.target === ui.modal) closeModal(); });
    shadow.appendChild(ui.modal);

    input.addEventListener('input', debounce(() => {
      state.filters.q = input.value.trim();
      state.visible = PAGE_STEP;
      render();
      syncURL();
    }, 120));

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeOverlay(); }
    });

    return app;
  }

  function section(title) {
    const node = el('section', 'fx-section');
    const head = el('button', 'fx-section-head');
    head.type = 'button';
    head.innerHTML = '<span>' + title + '</span><i></i>';
    const bodyEl = el('div', 'fx-section-body');
    head.addEventListener('click', () => node.classList.toggle('fx-collapsed'));
    node.append(head, bodyEl);
    return { node, body: bodyEl, head };
  }

  function buildOriginSection() {
    const s = section('Herkunft');
    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'fx-mini-search';
    search.placeholder = 'Land suchen …';
    ui.originSearch = search;
    const list = el('div', 'fx-checklist');
    s.body.append(search, list);
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      for (const [origin, ref] of ui.facets.origins) {
        ref.row.hidden = !!q && !origin.toLowerCase().includes(q);
      }
    });
    return { node: s.node, list };
  }

  function buildProducerSection() {
    const s = section('Hersteller');
    const sel = document.createElement('select');
    sel.className = 'fx-producer';
    s.body.append(sel);
    sel.addEventListener('change', () => {
      state.filters.producers = new Set(sel.value ? [sel.value] : []);
      state.visible = PAGE_STEP;
      render();
      syncURL();
    });
    return { node: s.node, select: sel };
  }

  function buildPriceSection() {
    const s = section('Preis pro Gramm');
    const value = el('div', 'fx-rangevalue', 'egal');
    const range = document.createElement('input');
    range.type = 'range';
    range.min = '2';
    range.max = '25';
    range.step = '0.5';
    range.value = '25';
    range.addEventListener('input', () => {
      const v = Number(range.value);
      state.filters.priceMax = v >= 25 ? null : v;
      value.textContent = v >= 25 ? 'egal' : 'bis ' + eur(v);
      state.visible = PAGE_STEP;
      render();
      syncURL();
    });
    s.body.append(value, range);
    return { node: s.node, range, value };
  }

  function buildThcSection() {
    const s = section('THC-Gehalt');
    const row = el('div', 'fx-numberrow');
    const min = document.createElement('input');
    min.type = 'number'; min.min = '0'; min.max = '100'; min.step = '1'; min.placeholder = 'von';
    const max = document.createElement('input');
    max.type = 'number'; max.min = '0'; max.max = '100'; max.step = '1'; max.placeholder = 'bis';
    const apply = () => {
      state.filters.thcMin = min.value === '' ? null : Number(min.value);
      state.filters.thcMax = max.value === '' ? null : Number(max.value);
      state.visible = PAGE_STEP;
      render();
      syncURL();
    };
    min.addEventListener('change', apply);
    max.addEventListener('change', apply);
    row.append(min, el('span', 'fx-dash', '–'), max);
    s.body.append(row);
    return { node: s.node, min, max };
  }

  function buildGeneticSection() {
    const s = section('Strain-Typ');
    const seg = el('div', 'fx-seg');
    [['', 'Alle'], ['Indica', 'Indica'], ['Sativa', 'Sativa'], ['Hybrid', 'Hybrid']].forEach(([val, label]) => {
      const b = el('button', 'fx-segbtn', label);
      b.type = 'button';
      b.dataset.value = val;
      b.addEventListener('click', () => {
        state.filters.genetic = val;
        seg.querySelectorAll('.fx-segbtn').forEach((x) => x.classList.toggle('is-active', x.dataset.value === val));
        state.visible = PAGE_STEP;
        render();
        syncURL();
      });
      if (val === '') b.classList.add('is-active');
      seg.append(b);
    });
    s.body.append(seg);
    ui.geneticSeg = seg;
    return { node: s.node };
  }

  function buildIrrSection() {
    const s = section('Bestrahlung');
    const seg = el('div', 'fx-seg');
    [['', 'Egal'], ['no', 'Unbestrahlt'], ['yes', 'Bestrahlt']].forEach(([val, label]) => {
      const b = el('button', 'fx-segbtn', label);
      b.type = 'button';
      b.dataset.value = val;
      b.addEventListener('click', () => {
        state.filters.irr = val;
        seg.querySelectorAll('.fx-segbtn').forEach((x) => x.classList.toggle('is-active', x.dataset.value === val));
        state.visible = PAGE_STEP;
        render();
        syncURL();
      });
      if (val === '') b.classList.add('is-active');
      seg.append(b);
    });
    s.body.append(seg);
    ui.irrSeg = seg;
    return { node: s.node };
  }

  function buildAvailSection() {
    const s = section('Verfügbarkeit');
    const label = el('label', 'fx-switch');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.addEventListener('change', () => {
      state.filters.onlyAvail = cb.checked;
      state.visible = PAGE_STEP;
      render();
      syncURL();
    });
    label.append(cb, el('span', 'fx-knob'), el('span', null, 'Nur lieferbar'));
    s.body.append(label);
    return { node: s.node, checkbox: cb };
  }

  function buildThemeSection() {
    const s = section('Darstellung');
    const seg = el('div', 'fx-seg');
    [['auto', 'Auto'], ['light', 'Hell'], ['dark', 'Dunkel']].forEach(([val, label]) => {
      const b = el('button', 'fx-segbtn', label);
      b.type = 'button';
      b.dataset.value = val;
      b.addEventListener('click', () => {
        setTheme(val);
        seg.querySelectorAll('.fx-segbtn').forEach((x) => x.classList.toggle('is-active', x.dataset.value === val));
      });
      seg.append(b);
    });
    s.body.append(seg);
    ui.themeSeg = seg;
    return { node: s.node };
  }

  function buildFavSection() {
    const s = section('Favoriten');
    const label = el('label', 'fx-switch');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    const text = el('span', 'fx-favtext', 'Nur Favoriten');
    cb.addEventListener('change', () => {
      state.filters.onlyFavs = cb.checked;
      state.visible = PAGE_STEP;
      render();
      syncURL();
    });
    label.append(cb, el('span', 'fx-knob'), text);
    s.body.append(label);
    return { node: s.node, checkbox: cb, text };
  }

  /* ---------- Vergleich ---------- */

  function toggleCompare(p) {
    if (state.compare.has(p.id)) {
      state.compare.delete(p.id);
    } else {
      if (state.compare.size >= 4) { toast('Maximal 4 Produkte vergleichen'); return; }
      state.compare.add(p.id);
    }
    renderCompareTray();
    renderGrid();
    syncURL();
  }

  function compareProducts() {
    return [...state.compare].map((id) => state.items.find((p) => p.id === id)).filter(Boolean);
  }

  function renderCompareTray() {
    if (!ui.tray) return;
    const items = compareProducts();
    ui.tray.hidden = items.length === 0;
    ui.tray.textContent = '';
    if (!items.length) return;

    const label = el('span', 'fx-tray-label', items.length + '/4');
    const chips = el('div', 'fx-tray-chips');
    for (const p of items) {
      const chip = el('span', 'fx-tray-chip');
      chip.append(el('span', null, p.strain || p.name));
      const x = el('button', 'fx-tray-x', '×');
      x.type = 'button';
      x.addEventListener('click', () => toggleCompare(p));
      chip.append(x);
      chips.append(chip);
    }
    const clear = el('button', 'fx-btn fx-tray-clear', 'Leeren');
    clear.type = 'button';
    clear.addEventListener('click', () => {
      state.compare.clear();
      renderCompareTray();
      renderGrid();
      syncURL();
    });
    const go = el('button', 'fx-btn fx-btn-primary', 'Vergleichen');
    go.type = 'button';
    go.disabled = items.length < 2;
    go.addEventListener('click', openCompareDialog);

    ui.tray.append(label, chips, clear, go);
  }

  function openCompareDialog() {
    const items = compareProducts();
    if (items.length < 2) { toast('Mindestens 2 Produkte auswählen'); return; }
    const idx = window.fxAttrs && window.fxAttrs.index;
    const labelOf = (key, id) => (window.fxLabelOf ? window.fxLabelOf(idx, key, id) : String(id));

    const head = el('div', 'fx-modal-head');
    head.append(el('b', null, 'Vergleich'), el('span', null, items.length + ' Produkte'));
    const close = el('button', 'fx-modal-close', '✕');
    close.type = 'button';
    close.addEventListener('click', closeModal);
    head.append(close);

    const body = el('div', 'fx-modal-body');
    const table = el('table', 'fx-compare');
    const thead = el('thead');
    const hr = el('tr');
    hr.append(el('th', 'fx-cmp-key', ''));
    for (const p of items) {
      const th = el('th');
      const link = el('a', 'fx-cmp-title', p.strain || p.name);
      link.href = '/' + routeFor(p.cat) + '/' + p.slug;
      th.append(link, el('div', 'fx-cmp-sub', p.producer || ''));
      hr.append(th);
    }
    thead.append(hr);

    const rows = [
      ['Preis / g', (p) => (p.price == null ? '—' : eur(p.price)), 'min'],
      ['THC', (p) => pct(p.thc), 'max'],
      ['CBD', (p) => pct(p.cbd)],
      ['Genetik', (p) => p.genetic || '—'],
      ['Herkunft', (p) => (p.origin === 'Unbekannt' ? '—' : p.origin)],
      ['Bestrahlung', (p) => (p.irr ? 'bestrahlt' : 'unbestrahlt')],
      ['Verfügbar', (p) => (p.avail ? 'ja' : 'nein')],
      ['Bewertung', (p) => (p.rating ? '★ ' + p.rating.toFixed(1) : '—'), 'max'],
      ['Wirkung (subjektiv)', (p) => {
        const a = idx && idx.products[String(p.id)];
        return a && a.e ? a.e.slice(0, 4).map((id) => labelOf('e', id)).join(', ') : '—';
      }],
      ['Terpene', (p) => {
        const a = idx && idx.products[String(p.id)];
        return a && a.tp ? a.tp.slice(0, 4).map((id) => labelOf('tp', id)).join(', ') : '—';
      }]
    ];

    const tbody = el('tbody');
    for (const [label, fn, best] of rows) {
      const tr = el('tr');
      tr.append(el('td', 'fx-cmp-key', label));
      const values = items.map(fn);
      let bestIdx = -1;
      if (best) {
        const nums = items.map((p) => (best === 'min' ? (p.price == null ? Infinity : p.price) : (p.thc == null ? -1 : p.thc)));
        const target = best === 'min' ? Math.min(...nums) : Math.max(...nums);
        if (isFinite(target) && target !== (best === 'min' ? Infinity : -1)) bestIdx = nums.indexOf(target);
      }
      values.forEach((v, i) => {
        const td = el('td', i === bestIdx ? 'fx-cmp-best' : '', v);
        tr.append(td);
      });
      tbody.append(tr);
    }
    table.append(thead, tbody);
    body.append(table);

    const wrap = el('div', 'fx-modal-inner fx-modal-wide');
    wrap.append(head, body);
    openModal(wrap);
  }

  /* ---------- Rendering ---------- */

  function render() {
    if (!state.opened) return;
    try {
      renderTabs();
      renderFacets();
      renderGrid();
    } catch (e) {
      if (ui.dataNote) ui.dataNote.textContent = 'FEHLER: ' + (e && e.message ? e.message : e);
    }
  }

  function renderTabs() {
    for (const [id, btn] of ui.tabs) btn.classList.toggle('is-active', id === state.category);
    ui.countLabel.textContent = catById(state.category).label;
  }

  function buildFacetLists() {
    const f = state.filters;
    const originCounts = facetCounts('origin');
    const origins = [...new Set(state.items.map((p) => p.origin))];
    origins.sort((a, b) => {
      if (a === 'Unbekannt') return 1;
      if (b === 'Unbekannt') return -1;
      return (originCounts.get(b) || 0) - (originCounts.get(a) || 0);
    });

    const list = ui.originSection.list;
    list.textContent = '';
    const nodes = new Map();
    for (const origin of origins) {
      const row = el('label', 'fx-check');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = f.origins.has(origin);
      cb.addEventListener('change', () => {
        if (cb.checked) f.origins.add(origin); else f.origins.delete(origin);
        state.visible = PAGE_STEP;
        render();
        syncURL();
      });
      const count = el('span', 'fx-checkcount', String(originCounts.get(origin) || 0));
      row.append(cb, el('span', 'fx-flag', flagOf(origin)), el('span', 'fx-checkname', origin), count);
      list.append(row);
      nodes.set(origin, { row, count, cb });
    }
    ui.facets.origins = nodes;

    const pCounts = facetCounts('producer');
    const producers = [...new Set(state.items.map((p) => p.producer).filter(Boolean))]
      .sort((a, b) => (pCounts.get(b) || 0) - (pCounts.get(a) || 0));
    const sel = ui.producerSection.select;
    sel.textContent = '';
    const optAll = document.createElement('option');
    optAll.value = '';
    optAll.textContent = 'Alle Hersteller';
    sel.append(optAll);
    for (const prod of producers) {
      const o = document.createElement('option');
      o.value = prod;
      o.textContent = prod + '  (' + (pCounts.get(prod) || 0) + ')';
      sel.append(o);
    }
    sel.value = f.producers.size ? [...f.producers][0] : '';

    state.facetsBuilt = true;
  }

  function renderFacets() {
    const f = state.filters;
    if (!state.facetsBuilt && state.items.length) buildFacetLists();
    if (ui.attrs) ui.attrs.refresh();

    const originCounts = facetCounts('origin');
    const originQuery = (ui.originSearch && ui.originSearch.value.trim().toLowerCase()) || '';
    for (const [origin, ref] of ui.facets.origins) {
      ref.count.textContent = String(originCounts.get(origin) || 0);
      ref.cb.checked = f.origins.has(origin);
      ref.row.hidden = !!originQuery && !origin.toLowerCase().includes(originQuery);
      ref.row.classList.toggle('is-zero', (originCounts.get(origin) || 0) === 0 && !f.origins.has(origin));
    }

    const pCounts = facetCounts('producer');
    if (ui.producerSection) {
      const sel = ui.producerSection.select;
      const current = f.producers.size ? [...f.producers][0] : '';
      for (const o of sel.options) {
        if (!o.value) continue;
        o.textContent = o.value + '  (' + (pCounts.get(o.value) || 0) + ')';
      }
      sel.value = current;
    }

    const listNow = currentList();
    const cat = catById(state.category);
    ui.countNum.textContent = String(listNow.length);
    ui.countLabel.textContent = cat.label;
    ui.resultText.textContent = listNow.length
      ? listNow.length + ' von ' + state.items.length + ' ' + cat.label
      : 'Keine Treffer';
    if (ui.favSection) ui.favSection.text.textContent = 'Nur Favoriten (' + state.favorites.size + ')';
    if (ui.dataNote) {
      ui.dataNote.textContent = (state.loadedAt
        ? 'Quelle: flowzz.com · Stand ' + new Date(state.loadedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' · '
        : '') + 'v' + VERSION +
        '\nWirkung & Terpene: subjektive Angaben von flowzz, keine medizinische Aussage.';
    }
  }

  function card(p) {
    const a = document.createElement('a');
    a.className = 'fx-card';
    a.href = '/' + routeFor(p.cat) + '/' + p.slug;
    a.dataset.id = p.id;

    const thumb = el('div', 'fx-thumb');
    if (p.img) {
      const img = document.createElement('img');
      img.src = p.img;
      img.alt = p.strain;
      img.loading = 'lazy';
      thumb.append(img);
    }
    const org = el('span', 'fx-orgbadge');
    org.append(el('span', 'fx-flag', flagOf(p.origin)), el('span', null, p.origin));
    thumb.append(org);
    if (!p.avail) thumb.append(el('span', 'fx-soldout', 'nicht lieferbar'));

    const actions = el('div', 'fx-actions');
    const fav = el('button', 'fx-actbtn' + (state.favorites.has(p.id) ? ' is-on' : ''), '★');
    fav.type = 'button';
    fav.title = state.favorites.has(p.id) ? 'Favorit entfernen' : 'Zu Favoriten';
    fav.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); toggleFavorite(p); });
    const cmp = el('button', 'fx-actbtn' + (state.compare.has(p.id) ? ' is-on' : ''), '⇄');
    cmp.type = 'button';
    cmp.title = state.compare.has(p.id) ? 'Aus Vergleich entfernen' : 'Zum Vergleich';
    cmp.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); toggleCompare(p); });
    actions.append(fav, cmp);
    thumb.append(actions);

    const body = el('div', 'fx-cardbody');
    body.append(el('div', 'fx-cardprod', p.producer || '—'));
    body.append(el('div', 'fx-name', p.strain || p.name));
    const meta = el('div', 'fx-meta');
    meta.append(el('span', null, 'THC ' + pct(p.thc)), el('span', 'fx-dot', '·'), el('span', null, 'CBD ' + pct(p.cbd)));
    body.append(meta);
    if (p.genetic) body.append(el('span', 'fx-tag', p.genetic));

    const info = state.prices.get(p.id);
    const offers = el('button', 'fx-offers', info
      ? info.count + (info.count === 1 ? ' Apotheke' : ' Apotheken') + ' · günstigste ' + eur(info.min)
      : 'Preise vergleichen');
    offers.type = 'button';
    offers.title = 'Apotheken-Preise vergleichen';
    offers.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openPriceDialog(p);
    });
    body.append(offers);

    const foot = el('div', 'fx-foot');
    const price = el('div', 'fx-price');
    price.append(el('b', null, eur(p.price)), el('small', null, ' / g'));
    const rating = el('div', 'fx-rating', p.rating ? '★ ' + p.rating.toFixed(1) : '—');
    if (p.ratingCount) rating.title = p.ratingCount + ' Bewertungen';
    foot.append(price, rating);
    body.append(foot);

    a.append(thumb, body);
    return a;
  }

  function renderAttrChips() {
    if (!ui.chips) return;
    const idx = window.fxAttrs && window.fxAttrs.index;
    ui.chips.textContent = '';
    if (!idx) return;
    let any = false;
    for (const key of Object.keys(state.filters.attrs)) {
      for (const id of state.filters.attrs[key]) {
        any = true;
        const label = window.fxLabelOf ? window.fxLabelOf(idx, key, id) : String(id);
        const chip = el('button', 'fx-chip', label + '  ×');
        chip.type = 'button';
        chip.addEventListener('click', () => toggleAttr(key, id, false));
        ui.chips.append(chip);
      }
    }
    ui.chips.hidden = !any;
  }

  function renderGrid() {
    renderAttrChips();
    const list = currentList();
    const grid = ui.grid;
    grid.textContent = '';
    const slice = list.slice(0, state.visible);
    const frag = document.createDocumentFragment();
    for (const p of slice) frag.append(card(p));
    grid.append(frag);
    ui.empty.hidden = list.length > 0 || state.loading;
    if (!list.length && !state.loading) {
      const f = state.filters;
      const active = f.q || f.origins.size || f.producers.size || f.genetic || f.thcMin != null ||
        f.thcMax != null || f.priceMax != null || f.irr || f.onlyAvail || f.onlyFavs ||
        Object.values(f.attrs).some((set) => set.size);
      if (f.onlyFavs && !state.favorites.size) {
        ui.emptyTitle.textContent = 'Noch keine Favoriten';
        ui.emptyText.textContent = 'Markiere Produkte mit dem Stern, um sie hier zu sammeln.';
      } else if (active) {
        ui.emptyTitle.textContent = 'Keine Treffer für diese Kombination';
        ui.emptyText.textContent = 'Ein Filter zu viel? Setz die Auswahl zurück und starte neu.';
      } else {
        ui.emptyTitle.textContent = 'Nichts gefunden';
        ui.emptyText.textContent = 'Für diese Kategorie liegen gerade keine Produkte vor.';
      }
      ui.emptyReset.hidden = false;
    }
    ui.moreBtn.parentElement.hidden = list.length <= slice.length;
    ui.grid.classList.toggle('fx-grid-empty', !list.length);
    updatePriceLabels();
  }

  function renderLoading() {
    if (!ui.progress) return;
    ui.progress.hidden = !state.loading;
    if (state.loading && !state.items.length) renderSkeletons();
    if (!state.loading) clearSkeletons();
    if (state.loading) {
      const { n, total } = state.progress;
      const p = total ? Math.min(100, Math.round((n / total) * 100)) : 8;
      ui.progressBar.style.width = p + '%';
      ui.progressText.textContent = total
        ? 'Daten werden geladen … ' + n + ' / ' + total
        : 'Daten werden geladen …';
    }
  }

  /* ---------- CSV ---------- */

  function csvCell(v) {
    const s = v == null ? '' : String(v);
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportCSV(list) {
    if (!list.length) { toast('Keine Treffer zum Exportieren'); return; }
    const cat = catById(state.category);
    const head = ['Name', 'Sorte', 'Hersteller', 'Herkunft', 'THC %', 'CBD %', 'Genetik', 'Preis €/g', 'Preis max €/g', 'Bewertung', 'Bestrahlung', 'Lieferbar', 'Link'];
    const rows = list.map((p) => {
      return [
        p.name, p.strain, p.producer, p.origin, p.thc, p.cbd, p.genetic,
        p.price, p.priceMax, p.rating, p.irr ? 'ja' : 'nein',
        p.avail ? 'ja' : 'nein', 'https://flowzz.com/' + routeFor(p.cat) + '/' + p.slug
      ].map(csvCell).join(';');
    });
    const csv = '\ufeff' + [head.join(';'), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    const stamp = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    a.href = url;
    a.download = 'flowzz-plus-' + cat.file + '-' + stamp + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(list.length + ' Zeilen exportiert', 'good');
  }

  /* ---------- Modals ---------- */

  function openModal(content) {
    ui.modalCard.textContent = '';
    ui.modalCard.append(content);
    ui.modal.hidden = false;
    ui.modal.classList.add('is-open');
  }

  function closeModal() {
    if (!ui.modal) return;
    ui.modal.hidden = true;
    ui.modal.classList.remove('is-open');
  }

  async function openPriceDialog(p) {
    const head = el('div', 'fx-modal-head');
    head.append(el('b', null, 'Apotheken-Preise'), el('span', null, p.strain || p.name));
    const close = el('button', 'fx-modal-close', '✕');
    close.type = 'button';
    close.addEventListener('click', closeModal);
    head.append(close);

    const bodyEl = el('div', 'fx-modal-body');
    bodyEl.append(el('div', 'fx-modal-note', 'Preise werden geladen …'));
    const wrap = el('div', 'fx-modal-inner');
    wrap.append(head, bodyEl);
    openModal(wrap);

    await loadPrices([p.id]);
    updatePriceLabels();
    const info = state.prices.get(p.id);
    bodyEl.textContent = '';
    if (!info) {
      bodyEl.append(el('div', 'fx-modal-note', 'Für dieses Produkt liegen aktuell keine Apothekenpreise vor.'));
      return;
    }
    const vendors = await loadVendors();
    const summary = el('div', 'fx-modal-summary');
    summary.append(el('b', null, eur(info.min) + ' / g'), el('span', null, info.count + ' Apotheken · günstigster Preis'));
    bodyEl.append(summary);

    const list = el('div', 'fx-offerlist');
    for (const o of info.offers.slice(0, 12)) {
      const v = vendors[o.vendor] || {};
      const row = el('div', 'fx-offer');
      const left = el('div', 'fx-offer-left');
      left.append(el('span', 'fx-offer-name', v.name || 'Apotheke #' + o.vendor));
      if (v.plz || v.city) left.append(el('span', 'fx-offer-city', [v.plz, v.city].filter(Boolean).join(' ')));
      const right = el('div', 'fx-offer-right');
      right.append(el('b', null, eur(o.price)));
      right.append(el('span', 'fx-offer-state' + (o.avail ? ' is-avail' : ''), o.avail ? 'lieferbar' : 'nicht lieferbar'));
      row.append(left, right);
      list.append(row);
    }
    bodyEl.append(list);
    bodyEl.append(el('div', 'fx-modal-note', 'Preise pro Gramm, Stand der Website. Alle Apotheken auf der Produktseite.'));
  }

  /* ---------- Kategorie / Filter ---------- */

  function switchCategory(catId) {
    if (catId === state.category) return;
    state.category = catId;
    state.filters = {
      q: state.filters.q, origins: new Set(), producers: new Set(), genetic: '',
      thcMin: null, thcMax: null, priceMax: null, irr: '', onlyAvail: false,
      onlyFavs: state.filters.onlyFavs, sort: state.filters.sort,
      attrs: { e: new Set(), t: new Set(), tp: new Set() }
    };
    state.visible = PAGE_STEP;
    state.items = [];
    state.facetsBuilt = false;
    state.loadedAt = 0;
    if (ui.input) ui.input.value = state.filters.q;
    resetControls();
    render();
    syncURL();
    loadCategory(catId, false);
  }

  function resetControls() {
    if (ui.priceSection) {
      ui.priceSection.range.value = '25';
      ui.priceSection.value.textContent = 'egal';
    }
    if (ui.thcSection) { ui.thcSection.min.value = ''; ui.thcSection.max.value = ''; }
    if (ui.sort) ui.sort.value = state.filters.sort;
    if (ui.availSection) ui.availSection.checkbox.checked = false;
    if (ui.geneticSeg) ui.geneticSeg.querySelectorAll('.fx-segbtn').forEach((b) => b.classList.toggle('is-active', b.dataset.value === ''));
    if (ui.irrSeg) ui.irrSeg.querySelectorAll('.fx-segbtn').forEach((b) => b.classList.toggle('is-active', b.dataset.value === ''));
  }

  function resetFilters() {
    state.filters = {
      q: '', origins: new Set(), producers: new Set(), genetic: '',
      thcMin: null, thcMax: null, priceMax: null, irr: '', onlyAvail: false,
      onlyFavs: false, sort: 'popularity'
    };
    state.visible = PAGE_STEP;
    if (ui.input) ui.input.value = '';
    if (ui.favSection) ui.favSection.checkbox.checked = false;
    state.filters.attrs = { e: new Set(), t: new Set(), tp: new Set() };
    if (ui.attrs) ui.attrs.reset();
    resetControls();
    render();
    syncURL();
  }

  /* ---------- Theme ---------- */

  const SITE_DARK_CSS = `
    html.fx-site-dark { filter: invert(1) hue-rotate(180deg); background: #000; color-scheme: dark; }
    html.fx-site-dark img,
    html.fx-site-dark video,
    html.fx-site-dark picture,
    html.fx-site-dark canvas,
    html.fx-site-dark svg,
    html.fx-site-dark #fx-host { filter: invert(1) hue-rotate(180deg); }
  `;

  function prefersDark() {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function resolveTheme() {
    if (state.theme === 'dark') return 'dark';
    if (state.theme === 'light') return 'light';
    return prefersDark() ? 'dark' : 'light';
  }

  function ensureSiteStyle() {
    if (document.getElementById('fx-site-dark-css')) return;
    const style = document.createElement('style');
    style.id = 'fx-site-dark-css';
    style.textContent = SITE_DARK_CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  function applyTheme(persist) {
    const mode = resolveTheme();
    ensureSiteStyle();
    document.documentElement.classList.toggle('fx-site-dark', mode === 'dark');
    if (ui.app) ui.app.dataset.theme = mode;
    if (ui.themeSeg) {
      ui.themeSeg.querySelectorAll('.fx-segbtn').forEach((b) => {
        b.classList.toggle('is-active', b.dataset.value === state.theme);
      });
    }
    if (ui.themeBtn) {
      ui.themeBtn.textContent = mode === 'dark' ? '☀' : '☾';
      ui.themeBtn.title = mode === 'dark' ? 'Zu Hell wechseln' : 'Zu Dunkel wechseln';
    }
    if (persist) store.set('fx_theme', state.theme);
  }

  function setTheme(value) {
    state.theme = value;
    applyTheme(true);
  }

  function toggleTheme() {
    setTheme(resolveTheme() === 'dark' ? 'light' : 'dark');
  }

  /* ---------- Update-Checker ---------- */

  function versionParts(v) {
    return String(v || '0').split('.').map((n) => parseInt(n, 10) || 0);
  }

  function isNewer(remote, local) {
    const a = versionParts(remote);
    const b = versionParts(local);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const x = a[i] || 0;
      const y = b[i] || 0;
      if (x > y) return true;
      if (x < y) return false;
    }
    return false;
  }

  async function checkUpdate(force) {
    try {
      const last = Number(await store.get('fx_update_checked') || 0);
      if (!force && Date.now() - last < 6 * 60 * 60 * 1000) return;
      await store.set('fx_update_checked', Date.now());

      const res = await fetchRemote(UPDATE_JSON + '?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const remoteVersion = data && (data.version || String(data.tag_name || '').replace(/^v/, ''));
      if (!remoteVersion || !isNewer(remoteVersion, VERSION)) {
        if (force) toast('flowzz+ ist aktuell (v' + VERSION + ')', 'good');
        return;
      }
      const dismissed = await store.get('fx_update_dismissed');
      if (dismissed === remoteVersion) {
        if (force) toast('Update v' + remoteVersion + ' verfügbar', 'good');
        return;
      }
      showUpdateBanner(remoteVersion);
    } catch (e) {
      if (force) toast('Update-Prüfung fehlgeschlagen', 'error');
    }
  }

  function showUpdateBanner(version) {
    if (!ui.shadow || ui.updateBanner) return;
    const box = el('div', 'fx-update');
    box.setAttribute('role', 'status');

    const dot = el('span', 'fx-update-dot');
    const text = el('div', 'fx-update-text');
    text.append(el('b', null, 'Update verfügbar'), el('span', null, 'Version ' + version + ' ist da'));

    const go = el('a', 'fx-update-btn', 'App-Update');
    go.href = '#flowzz-plus-app-update';
    go.addEventListener('click', (event) => {
      event.preventDefault();
      toast('Safari-Erweiterungen werden zusammen mit der flowzz+-App aktualisiert.');
    });

    const close = el('button', 'fx-update-close', '✕');
    close.type = 'button';
    close.title = 'Später';
    close.addEventListener('click', async () => {
      await store.set('fx_update_dismissed', version);
      box.classList.remove('is-visible');
      setTimeout(() => box.remove(), 250);
      ui.updateBanner = null;
    });

    box.append(dot, text, go, close);
    ui.shadow.appendChild(box);
    ui.updateBanner = box;
    requestAnimationFrame(() => box.classList.add('is-visible'));
  }

  /* ---------- Teilen ---------- */

  function copyFallback(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  function showLinkDialog(url) {
    const head = el('div', 'fx-modal-head');
    head.append(el('b', null, 'Link zur Auswahl'), el('span', null, 'Zum Kopieren markieren'));
    const close = el('button', 'fx-modal-close', '✕');
    close.type = 'button';
    close.addEventListener('click', closeModal);
    head.append(close);

    const body = el('div', 'fx-modal-body');
    const input = document.createElement('input');
    input.type = 'text';
    input.readOnly = true;
    input.value = url;
    input.className = 'fx-linkinput';
    body.append(input, el('div', 'fx-modal-note', 'Der Link enthält alle aktiven Filter und lässt sich direkt teilen.'));

    const wrap = el('div', 'fx-modal-inner');
    wrap.append(head, body);
    openModal(wrap);
    setTimeout(() => { input.focus(); input.select(); }, 60);
  }

  async function shareLink() {
    const url = location.href;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        toast('Link kopiert', 'good');
        return;
      }
    } catch (e) { /* Fallback unten */ }

    if (copyFallback(url)) {
      toast('Link kopiert', 'good');
    } else {
      showLinkDialog(url);
    }
  }

  /* ---------- Tastaturkürzel ---------- */

  const SHORTCUTS = [
    ['1 / 2 / 3', 'Blüten, Extrakte, Edibles'],
    ['/', 'Suche fokussieren'],
    ['f', 'Nur Favoriten ein/aus'],
    ['d', 'Hell / Dunkel'],
    ['s', 'Link zur Auswahl kopieren'],
    ['c', 'Vergleich öffnen'],
    ['?', 'Diese Übersicht'],
    ['Esc', 'Schließen']
  ];

  function openShortcuts() {
    const head = el('div', 'fx-modal-head');
    head.append(el('b', null, 'Tastaturkürzel'), el('span', null, 'Schneller durch flowzz+'));
    const close = el('button', 'fx-modal-close', '✕');
    close.type = 'button';
    close.addEventListener('click', closeModal);
    head.append(close);

    const body = el('div', 'fx-modal-body');
    const list = el('div', 'fx-shortcuts');
    for (const [key, label] of SHORTCUTS) {
      const row = el('div', 'fx-shortcut');
      row.append(el('kbd', null, key), el('span', null, label));
      list.append(row);
    }
    body.append(list);

    const wrap = el('div', 'fx-modal-inner');
    wrap.append(head, body);
    openModal(wrap);
  }

  /* ---------- Onboarding ---------- */

  const ONBOARDING = [
    {
      title: 'Alles an einem Ort',
      text: 'Blüten, Extrakte und Edibles mit Suche und Filtern nach Herkunft, Wirkung, Geschmack und Terpenen – auch Kombinationen, die flowzz selbst nicht anbietet.'
    },
    {
      title: 'Preise wirklich vergleichen',
      text: '„Preise vergleichen“ zeigt die günstigsten Apotheken. Mit ⇄ sammelst du bis zu vier Produkte und stellst sie nebeneinander.'
    },
    {
      title: 'Deine Ansicht',
      text: 'Darkmode über ☾, Favoriten über ★, Export als CSV und Teilen-Link. Mit ? siehst du alle Tastaturkürzel.'
    }
  ];

  function openOnboarding(step = 0) {
    const head = el('div', 'fx-modal-head');
    head.append(el('b', null, 'Willkommen bei flowzz+'), el('span', null, (step + 1) + ' von ' + ONBOARDING.length));
    const skip = el('button', 'fx-modal-close', '✕');
    skip.type = 'button';
    skip.title = 'Überspringen';
    skip.addEventListener('click', async () => {
      await store.set('fx_onboarded', 1);
      closeModal();
    });
    head.append(skip);

    const body = el('div', 'fx-modal-body');
    const item = ONBOARDING[step];
    body.append(el('div', 'fx-onb-title', item.title), el('p', 'fx-onb-text', item.text));

    const dots = el('div', 'fx-onb-dots');
    ONBOARDING.forEach((_, i) => dots.append(el('span', 'fx-onb-dot' + (i === step ? ' is-active' : ''))));
    body.append(dots);

    const actions = el('div', 'fx-modal-actions');
    if (step > 0) {
      const back = el('button', 'fx-btn', 'Zurück');
      back.type = 'button';
      back.addEventListener('click', () => openOnboarding(step - 1));
      actions.append(back);
    }
    const next = el('button', 'fx-btn fx-btn-primary', step === ONBOARDING.length - 1 ? 'Los geht’s' : 'Weiter');
    next.type = 'button';
    next.addEventListener('click', async () => {
      if (step === ONBOARDING.length - 1) {
        await store.set('fx_onboarded', 1);
        closeModal();
        toast('Viel Spaß beim Filtern', 'good');
      } else {
        openOnboarding(step + 1);
      }
    });
    actions.append(next);
    body.append(actions);

    const wrap = el('div', 'fx-modal-inner');
    wrap.append(head, body);
    openModal(wrap);
  }

  /* ---------- Skeletons ---------- */

  function renderSkeletons() {
    if (!ui.grid || ui.grid.querySelector('.fx-skeleton')) return;
    ui.grid.textContent = '';
    for (let i = 0; i < 8; i++) {
      const card = el('div', 'fx-skeleton');
      card.append(el('div', 'fx-skeleton-thumb'), el('div', 'fx-skeleton-line'), el('div', 'fx-skeleton-line short'));
      ui.grid.append(card);
    }
  }

  function clearSkeletons() {
    if (!ui.grid) return;
    ui.grid.querySelectorAll('.fx-skeleton').forEach((n) => n.remove());
  }

  /* ---------- URL ---------- */

  const URL_KEYS = ['fx', 'cat', 'q', 'origin', 'producer', 'genetic', 'thc', 'price', 'irr', 'avail', 'fav', 'sort',
    'eff', 'taste', 'med', 'side', 'terp', 'cmp'];

  function syncURL() {
    if (!state.opened) return;
    const f = state.filters;
    const params = new URLSearchParams();
    params.set('fx', '1');
    if (state.category !== 'flowers') params.set('cat', state.category);
    if (f.q) params.set('q', f.q);
    if (f.origins.size) params.set('origin', [...f.origins].join(','));
    if (f.producers.size) params.set('producer', [...f.producers].join(','));
    if (f.genetic) params.set('genetic', f.genetic);
    if (f.thcMin != null || f.thcMax != null) params.set('thc', (f.thcMin == null ? '' : f.thcMin) + '-' + (f.thcMax == null ? '' : f.thcMax));
    if (f.priceMax != null) params.set('price', String(f.priceMax));
    if (f.irr) params.set('irr', f.irr);
    if (f.onlyAvail) params.set('avail', '1');
    if (f.onlyFavs) params.set('fav', '1');
    if (f.sort !== 'popularity') params.set('sort', f.sort);
    if (state.compare.size) params.set('cmp', [...state.compare].join(','));
    for (const key of Object.keys(window.ATTR_PREFIX || {})) {
      const set = f.attrs[key];
      if (set && set.size) params.set(window.ATTR_PREFIX[key], [...set].join(','));
    }
    history.replaceState(history.state, '', location.pathname + '?' + params.toString());
  }

  function applyURL() {
    const params = new URLSearchParams(location.search);
    const f = state.filters;
    if (params.get('cat')) state.category = params.get('cat');
    f.q = params.get('q') || '';
    if (params.get('origin')) f.origins = new Set(params.get('origin').split(',').map(normOrigin));
    if (params.get('producer')) f.producers = new Set(params.get('producer').split(','));
    if (params.get('genetic')) f.genetic = params.get('genetic');
    const thc = params.get('thc');
    if (thc && thc.includes('-')) {
      const [a, b] = thc.split('-');
      f.thcMin = a === '' ? null : Number(a);
      f.thcMax = b === '' ? null : Number(b);
    }
    if (params.get('price')) f.priceMax = Number(params.get('price'));
    if (params.get('irr')) f.irr = params.get('irr');
    f.onlyAvail = params.get('avail') === '1';
    f.onlyFavs = params.get('fav') === '1';
    if (params.get('sort')) f.sort = params.get('sort');
    if (params.get('cmp')) state.compare = new Set(params.get('cmp').split(',').map(Number).filter(Boolean));
    for (const [key, prefix] of Object.entries(window.PREFIX_ATTR || {})) {
      const raw = params.get(prefix);
      if (raw) f.attrs[key] = new Set(raw.split(',').map(Number).filter((n) => !isNaN(n)));
    }
  }

  function clearURL() {
    const params = new URLSearchParams(location.search);
    URL_KEYS.forEach((k) => params.delete(k));
    const qs = params.toString();
    history.replaceState(history.state, '', location.pathname + (qs ? '?' + qs : ''));
  }

  /* ---------- Öffnen / Schließen ---------- */

  function lowerCookieBanner() {
    if (ui.cookieZ != null) return;
    const dlg = document.getElementById('CybotCookiebotDialog');
    if (!dlg) return;
    ui.cookieZ = dlg.style.zIndex || '';
    dlg.style.zIndex = '1';
  }

  function restoreCookieBanner() {
    if (ui.cookieZ == null) return;
    const dlg = document.getElementById('CybotCookiebotDialog');
    if (dlg) dlg.style.zIndex = ui.cookieZ;
    ui.cookieZ = null;
  }

  function openOverlay(pending) {
    ensureHost();
    lowerCookieBanner();
    if (!ui.app) buildOverlay();
    if (!state.opened) {
      state.opened = true;
      applyURL();
      if (ui.input) ui.input.value = state.filters.q;
      if (ui.sort) ui.sort.value = state.filters.sort;
      if (ui.priceSection) {
        const v = state.filters.priceMax == null ? 25 : state.filters.priceMax;
        ui.priceSection.range.value = String(v);
        ui.priceSection.value.textContent = state.filters.priceMax == null ? 'egal' : 'bis ' + eur(v);
      }
      if (ui.thcSection) {
        ui.thcSection.min.value = state.filters.thcMin == null ? '' : String(state.filters.thcMin);
        ui.thcSection.max.value = state.filters.thcMax == null ? '' : String(state.filters.thcMax);
      }
      if (ui.availSection) ui.availSection.checkbox.checked = state.filters.onlyAvail;
      if (ui.favSection) ui.favSection.checkbox.checked = state.filters.onlyFavs;
      if (pending) Object.assign(state.filters, pending);
      applyTheme(false);
      if (ui.geneticSeg) ui.geneticSeg.querySelectorAll('.fx-segbtn').forEach((b) => b.classList.toggle('is-active', b.dataset.value === state.filters.genetic));
      if (ui.irrSeg) ui.irrSeg.querySelectorAll('.fx-segbtn').forEach((b) => b.classList.toggle('is-active', b.dataset.value === state.filters.irr));
      ui.app.classList.add('is-open');
      document.documentElement.style.overflow = 'hidden';
      ui.host.classList.add('fx-visible');
      render();
      syncURL();
      renderCompareTray();
      store.get('fx_onboarded').then((done) => {
        if (!done && !state.onboardedShown) {
          state.onboardedShown = true;
          setTimeout(() => openOnboarding(0), 700);
        }
      });
      loadUserData().then(() => {
        render();
        if (!state.items.length) loadCategory(state.category, false);
      });
    } else {
      ui.app.classList.add('is-open');
      document.documentElement.style.overflow = 'hidden';
      ui.host.classList.add('fx-visible');
    }
    hideLauncher();
  }

  function closeOverlay() {
    state.opened = false;
    closeModal();
    if (ui.app) ui.app.classList.remove('is-open');
    if (ui.host) ui.host.classList.remove('fx-visible');
    document.documentElement.style.overflow = '';
    restoreCookieBanner();
    clearURL();
    showLauncher();
  }

  /* ---------- Launcher ---------- */

  function buildLauncher() {
    const btn = el('button', 'fx-launcher');
    btn.type = 'button';
    btn.innerHTML = '<span class="fx-launcher-logo">f+</span><span class="fx-launcher-label">Herkunft filtern</span>';
    btn.addEventListener('click', openOverlay);
    ensureHost();
    ui.shadow.appendChild(btn);
    ui.launcher = btn;
  }

  function showLauncher() {
    if (!ui.launcher) buildLauncher();
    const isList = location.pathname === '/product' || location.pathname === '/product/';
    ui.launcher.querySelector('.fx-launcher-label').textContent = isList ? 'Herkunft filtern' : 'flowzz+ Suche';
    ui.launcher.classList.add('is-visible');
  }

  function hideLauncher() {
    if (ui.launcher) ui.launcher.classList.remove('is-visible');
  }

  /* ---------- Produktdetail ---------- */

  function detailInfo() {
    const nd = document.getElementById('__NEXT_DATA__');
    if (!nd) return null;
    try {
      const data = JSON.parse(nd.textContent);
      let found = null;
      const walk = (node, depth) => {
        if (!node || typeof node !== 'object' || depth > 12 || found) return;
        if (node.origin && node.url && (node.name || node.strain_name)) { found = node; return; }
        for (const key of Object.keys(node)) {
          const v = node[key];
          if (v && typeof v === 'object') walk(v, depth + 1);
          if (found) return;
        }
      };
      walk(data, 0);
      if (!found) return null;
      return { origin: normOrigin(found.origin), name: found.name, slug: found.url };
    } catch (e) { return null; }
  }

  function injectDetailBadge() {
    if (!/^\/product\/[^/]+/.test(location.pathname)) return;
    if (document.querySelector('.fx-detail-line')) return;
    const info = detailInfo();
    if (!info) return;
    const h1 = document.querySelector('h1');
    if (!h1 || !h1.parentElement) return;

    const line = el('div', 'fx-detail-line');
    const badge = el('button', 'fx-detail-badge');
    badge.type = 'button';
    badge.append(el('span', 'fx-flag', flagOf(info.origin)), el('span', null, 'Herkunft: ' + info.origin));
    badge.title = 'Alle aus ' + info.origin + ' anzeigen';
    badge.addEventListener('click', () => {
      state.visible = PAGE_STEP;
      openOverlay({ origins: new Set([info.origin]) });
      syncURL();
    });
    line.append(badge);
    h1.parentElement.insertBefore(line, h1.nextSibling);
  }

  /* ---------- Boot ---------- */

  function boot() {
    ensureHost();
    showLauncher();

    const params = new URLSearchParams(location.search);
    if (params.get('cat')) state.category = params.get('cat');

    loadUserData();
    store.get('fx_theme').then((t) => {
      if (t === 'light' || t === 'dark' || t === 'auto') state.theme = t;
      applyTheme(false);
    });
    applyTheme(false);
    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const onChange = () => { if (state.theme === 'auto') applyTheme(false); };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
    loadCategory(state.category, false);
    setTimeout(() => checkUpdate(false), 4000);
    injectDetailBadge();

    if (params.get('fx') === '1') {
      setTimeout(openOverlay, 250);
    }

    let lastPath = location.pathname + location.search;
    setInterval(() => {
      const now = location.pathname + location.search;
      if (now === lastPath) return;
      lastPath = now;
      if (!state.opened) { showLauncher(); injectDetailBadge(); }
    }, 1200);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (ui.modal && !ui.modal.hidden) { closeModal(); return; }
        if (state.opened) { e.preventDefault(); closeOverlay(); }
        return;
      }

      // Shortcuts nur im offenen Overlay und nicht in Eingabefeldern
      if (state.opened && !(ui.modal && !ui.modal.hidden)) {
        const t = e.target;
        const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
        if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
          if (e.key === '1' || e.key === '2' || e.key === '3') {
            e.preventDefault();
            switchCategory(CATEGORIES[Number(e.key) - 1].id);
            return;
          }
          if (e.key === '?') { e.preventDefault(); openShortcuts(); return; }
          if (e.key.toLowerCase() === 'd') { e.preventDefault(); toggleTheme(); return; }
          if (e.key.toLowerCase() === 's') { e.preventDefault(); shareLink(); return; }
          if (e.key.toLowerCase() === 'c') {
            e.preventDefault();
            if (state.compare.size >= 2) openCompareDialog();
            else toast('Erst zwei Produkte mit ⇄ auswählen');
            return;
          }
          if (e.key.toLowerCase() === 'f') {
            e.preventDefault();
            state.filters.onlyFavs = !state.filters.onlyFavs;
            if (ui.favSection) ui.favSection.checkbox.checked = state.filters.onlyFavs;
            render();
            syncURL();
            return;
          }
        }
      }
      if (e.key === '/' && !state.opened) {
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        e.preventDefault();
        openOverlay();
      }
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        openOverlay();
      }
    });

    if (HAS_EXTENSION && extensionAPI.runtime.onMessage) {
      extensionAPI.runtime.onMessage.addListener((message) => {
        if (message && message.type === 'FX_OPEN') openOverlay();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
