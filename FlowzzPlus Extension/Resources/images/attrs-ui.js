/* flowzz+ · Attribut-Filter
 * Bindet die Index-Datei (attrs.json.gz) ein und stellt die Filter-Sektionen
 * für Effekte, Geschmack, medizinische Wirkung, Nebenwirkungen und Terpene bereit.
 * Erwartet window.fxLoadIndex / fxLabelList / fxMatchesAttrs aus attrs.js.
 */
(() => {
  if (window.__FX_ATTRS_UI__) return;
  window.__FX_ATTRS_UI__ = true;

  const ATTR_URL = (typeof window !== 'undefined' && window.__FX_ATTR_URL__) || 'https://raw.githubusercontent.com/CRZX1337/flowzz-plus/main/data/attrs.json.gz';
  const ATTR_CACHE_KEY = 'fx_attrs_v1';
  const ATTR_TTL = 24 * 60 * 60 * 1000;
  const CHUNK = 60;

  const index = {
    data: null,
    loading: false,
    error: null
  };

  const openSections = new Set();

  /* ---------- Laden ---------- */

  const extensionAPI = typeof browser !== 'undefined' ? browser :
    (typeof chrome !== 'undefined' ? chrome : null);

  async function getCached() {
    if (extensionAPI && extensionAPI.storage && extensionAPI.storage.local) {
      const result = extensionAPI.storage.local.get(ATTR_CACHE_KEY);
      if (result && typeof result.then === 'function') {
        const values = await result;
        return values ? values[ATTR_CACHE_KEY] : null;
      }
      return new Promise((resolve) => {
        extensionAPI.storage.local.get(ATTR_CACHE_KEY, (values) => resolve(values ? values[ATTR_CACHE_KEY] : null));
      });
    }
    try { return JSON.parse(localStorage.getItem(ATTR_CACHE_KEY) || 'null'); } catch (e) { return null; }
  }

  async function setCached(value) {
    if (extensionAPI && extensionAPI.storage && extensionAPI.storage.local) {
      const entry = { [ATTR_CACHE_KEY]: value };
      const result = extensionAPI.storage.local.set(entry);
      if (result && typeof result.then === 'function') return result;
      return new Promise((resolve) => extensionAPI.storage.local.set(entry, resolve));
    }
    try { localStorage.setItem(ATTR_CACHE_KEY, JSON.stringify(value)); } catch (e) {}
  }

  async function loadIndex({ force } = {}) {
    if (index.data || index.loading) return index.data;
    index.loading = true;

    if (!force) {
      const cached = await getCached();
      if (cached && cached.ts && Date.now() - cached.ts < ATTR_TTL && cached.payload) {
        index.data = cached.payload;
        index.loading = false;
        return index.data;
      }
    }

    try {
      let payload;
      try {
        payload = await window.fxLoadIndex({ url: ATTR_URL });
      } catch (remoteError) {
        const bundledURL = extensionAPI && extensionAPI.runtime && extensionAPI.runtime.getURL
          ? extensionAPI.runtime.getURL('images/attrs.json.gz')
          : null;
        if (!bundledURL) throw remoteError;
        payload = await window.fxLoadIndex({ url: bundledURL });
      }
      index.data = payload;
      await setCached({ ts: Date.now(), payload });
    } catch (e) {
      index.error = e;
    } finally {
      index.loading = false;
    }
    return index.data;
  }

  /* ---------- Section-Bau ---------- */

  function buildSection(type, ctx) {
    const node = document.createElement('section');
    node.className = 'fx-section fx-attr-section';
    node.dataset.attr = type.key;

    const head = document.createElement('button');
    head.className = 'fx-section-head';
    head.type = 'button';
    head.innerHTML = '<span>' + type.title + '</span><i></i>';
    head.addEventListener('click', () => {
      node.classList.toggle('fx-collapsed');
      if (!node.classList.contains('fx-collapsed')) ensureList();
    });

    const body = document.createElement('div');
    body.className = 'fx-section-body';

    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'fx-mini-search';
    search.placeholder = type.title + ' suchen …';

    const list = document.createElement('div');
    list.className = 'fx-checklist';

    const more = document.createElement('button');
    more.className = 'fx-chiplink';
    more.type = 'button';
    more.hidden = true;

    body.append(search, list, more);
    node.append(head, body);

    const state = { query: '', shown: CHUNK, items: [] };

    function render() {
      const selected = ctx.getSelected(type.key);
      list.textContent = '';
      const q = state.query.toLowerCase();
      const filtered = state.items.filter((it) => !q || it.label.toLowerCase().includes(q));
      const shown = filtered.slice(0, state.shown);
      const frag = document.createDocumentFragment();
      for (const item of shown) {
        const row = document.createElement('label');
        row.className = 'fx-check';
        if (ctx.countFor(type.key, item.id) === 0 && !selected.has(item.id)) row.classList.add('is-zero');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = selected.has(item.id);
        cb.addEventListener('change', () => ctx.toggle(type.key, item.id, cb.checked));
        const name = document.createElement('span');
        name.className = 'fx-checkname';
        name.textContent = item.label;
        const count = document.createElement('span');
        count.className = 'fx-checkcount';
        count.textContent = String(ctx.countFor(type.key, item.id));
        row.append(cb, name, count);
        frag.append(row);
      }
      list.append(frag);
      more.hidden = filtered.length <= state.shown;
      more.textContent = '+' + (filtered.length - state.shown) + ' weitere';
    }

    function ensureList() {
      if (state.items.length || !index.data) return;
      state.items = window.fxLabelList(index.data, type.key);
      render();
    }

    search.addEventListener('input', () => {
      state.query = search.value.trim();
      state.shown = CHUNK;
      ensureList();
      render();
    });

    more.addEventListener('click', () => {
      state.shown += CHUNK * 2;
      render();
    });

    node.classList.add('fx-collapsed');

    return {
      node,
      type,
      refresh: () => {
        if (!index.data) return;
        ensureList();
        if (!node.classList.contains('fx-collapsed')) render();
      },
      show: () => { node.hidden = false; },
      hide: () => { node.hidden = true; },
      reset: () => { state.shown = CHUNK; state.query = ''; search.value = ''; render(); },
      count: () => {
        const sel = ctx.getSelected(type.key);
        if (sel.size) {
          head.querySelector('span').textContent = type.title + ' · ' + sel.size;
        } else {
          head.querySelector('span').textContent = type.title;
        }
      }
    };
  }

  /**
   * Baut alle Attribut-Sektionen und hängt sie in den Sidebar-Container.
   * ctx: {
   *   getSelected(key) -> Set,
   *   toggle(key, id, on) -> void,
   *   countFor(key, id) -> number,
   *   onChange() -> void,
   *   notify(text)
   * }
   */
  function mount(container, ctx) {
    const sections = {};
    const wrap = document.createElement('div');
    wrap.className = 'fx-attr-wrap';
    for (const type of window.FX_ATTR_TYPES) {
      const sec = buildSection(type, ctx);
      sections[type.key] = sec;
      wrap.append(sec.node);
    }
    container.append(wrap);

    loadIndex().then(() => {
      if (!index.data) {
        wrap.querySelectorAll('.fx-attr-section').forEach((n) => { n.hidden = true; });
        ctx.notify('Attribut-Index nicht verfügbar – Filter eingeschränkt.');
        return;
      }
      for (const sec of Object.values(sections)) {
        sec.show();
        sec.refresh();
        sec.count();
      }
    });

    return {
      sections,
      refresh() {
        for (const sec of Object.values(sections)) {
          sec.refresh();
          sec.count();
        }
      },
      reset() {
        for (const sec of Object.values(sections)) sec.reset();
      },
      get index() { return index.data; }
    };
  }

  window.fxAttrs = { mount, loadIndex, get index() { return index.data; } };
})();
