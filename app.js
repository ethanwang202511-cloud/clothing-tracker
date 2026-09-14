// UI + persistence glue. Depends on window.Logic and window.GH.
(() => {
  const DATA_PATH = 'data/items.json';
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  const state = {
    items: [],
    sha: null,
    tab: 'closet',
    filters: { closet: 'all', log: 'all' },
    logDate: Logic.todayStr(),
    logSelection: new Set(),
    washSelection: new Set(),
    editingId: null,
    pendingPhoto: null, // { dataUrl, base64 }
  };

  // ---------- status / busy ----------
  function showStatus(msg, isError = false) {
    const el = $('#status');
    el.textContent = msg;
    el.classList.toggle('error', isError);
    el.hidden = !msg;
  }

  async function busy(label, fn) {
    showStatus(label);
    $$('button').forEach((b) => (b.disabled = true));
    try {
      await fn();
      showStatus('');
      return true;
    } catch (e) {
      console.error(e);
      const hint = e.status === 401 || e.status === 403 || e.status === 404 ? ' (check Settings: token/owner/repo)' : '';
      showStatus(e.message + hint, true);
      return false;
    } finally {
      $$('button').forEach((b) => (b.disabled = false));
    }
  }

  // ---------- persistence ----------
  async function load() {
    const { data, sha } = await GH.getJson(DATA_PATH);
    state.items = Array.isArray(data) ? data : [];
    state.sha = sha;
  }

  // mutator: items -> items (pure). Retries on stale sha by re-fetching and reapplying.
  async function commit(mutator, message) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const next = mutator(state.items);
      try {
        state.sha = await GH.putJson(DATA_PATH, next, state.sha, message);
        state.items = next;
        render();
        return;
      } catch (e) {
        if (e.status !== 409 && e.status !== 422) throw e;
        await load();
      }
    }
    throw new Error('Could not save (kept conflicting with another device). Reload and try again.');
  }

  // ---------- photos ----------
  const photoUrls = new Map(); // path -> Promise<url>

  function photoUrl(path) {
    if (photoUrls.has(path)) return photoUrls.get(path);
    const p = (async () => {
      const key = `${location.origin}/__photo-cache/${path}`;
      let cache = null;
      try {
        cache = await caches.open('photos-v1');
        const hit = await cache.match(key);
        if (hit) return URL.createObjectURL(await hit.blob());
      } catch {}
      const blob = await GH.getBlob(path);
      try {
        if (cache) await cache.put(key, new Response(blob, { headers: { 'Content-Type': 'image/jpeg' } }));
      } catch {}
      return URL.createObjectURL(blob);
    })();
    p.catch(() => photoUrls.delete(path));
    photoUrls.set(path, p);
    return p;
  }

  function hydratePhotos(root) {
    root.querySelectorAll('img[data-photo]').forEach((img) => {
      photoUrl(img.dataset.photo)
        .then((url) => (img.src = url))
        .catch(() => (img.alt = 'photo failed to load'));
    });
  }

  async function resizePhoto(file, max = 800) {
    const src = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = src;
      await img.decode();
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      return { dataUrl, base64: dataUrl.split(',')[1] };
    } finally {
      URL.revokeObjectURL(src);
    }
  }

  // ---------- rendering ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function cardHtml(item, selected) {
    const dirty = Logic.needsWash(item);
    return `
      <div class="card${selected ? ' selected' : ''}${dirty ? ' dirty' : ''}" data-id="${esc(item.id)}">
        <div class="img">${item.photo ? `<img data-photo="${esc(item.photo)}" alt="">` : 'no photo'}</div>
        <div class="info">
          <div class="name">${esc(item.name)} ${dirty ? '<span class="badge">WASH</span>' : ''}</div>
          <div class="meta">${esc(item.category)}</div>
          <div class="meta">${item.wearsSinceWash}/${item.washEvery} since wash · ${item.totalWears} total</div>
          <div class="meta">last worn: ${item.lastWorn || '—'}</div>
        </div>
      </div>`;
  }

  function renderGrid(el, items, selection, emptyMsg) {
    el.innerHTML = items.length
      ? items.map((i) => cardHtml(i, selection ? selection.has(i.id) : false)).join('')
      : `<p class="empty">${emptyMsg}</p>`;
    hydratePhotos(el);
  }

  function filtered(which) {
    const f = state.filters[which];
    const sorted = Logic.sortItems(state.items);
    return f === 'all' ? sorted : sorted.filter((i) => i.category === f);
  }

  function renderFilters() {
    const cats = Logic.categoriesOf(state.items);
    $$('.category-filter').forEach((sel) => {
      const which = sel.dataset.for;
      sel.innerHTML = ['all', ...cats].map((c) => `<option value="${esc(c)}">${c === 'all' ? 'All categories' : esc(c)}</option>`).join('');
      sel.value = cats.includes(state.filters[which]) ? state.filters[which] : 'all';
    });
    $('#category-list').innerHTML = cats.map((c) => `<option value="${esc(c)}">`).join('');
  }

  function renderLogCount() {
    $('#log-selected').textContent = `${state.logSelection.size} selected`;
  }

  function render() {
    const dirty = Logic.needsWashList(state.items);
    $('#wash-count').textContent = dirty.length ? `(${dirty.length})` : '';
    $$('nav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));
    $$('main > section').forEach((s) => (s.hidden = s.id !== `tab-${state.tab}`));
    renderFilters();

    if (state.tab === 'closet') {
      $('#closet-summary').textContent = `${state.items.length} items · ${dirty.length} need washing`;
      renderGrid($('#closet-grid'), filtered('closet'), null, 'No items yet. Use "+ Add".');
    } else if (state.tab === 'log') {
      $('#log-date').value = state.logDate;
      renderGrid($('#log-grid'), filtered('log'), state.logSelection, 'No items yet. Use "+ Add".');
      renderLogCount();
    } else if (state.tab === 'wash') {
      const ids = new Set(dirty.map((i) => i.id));
      state.washSelection = new Set([...state.washSelection].filter((id) => ids.has(id)));
      renderGrid($('#wash-grid'), Logic.sortItems(dirty), state.washSelection, 'Nothing needs washing. 🎉');
    }
  }

  function switchTab(tab) {
    if (tab === 'log') state.logSelection = new Set(Logic.wornOn(state.items, state.logDate));
    if (tab === 'wash') state.washSelection = new Set();
    if (tab === 'add' && (state.tab !== 'add' || state.editingId)) openForm(null);
    if (tab === 'settings') fillSettings();
    state.tab = tab;
    render();
  }

  // ---------- add / edit form ----------
  function setFormPhoto(src) {
    $('#form-photo').hidden = !src;
    $('#form-photo-hint').hidden = Boolean(src);
    if (src) $('#form-photo').src = src;
    else $('#form-photo').removeAttribute('src');
  }

  function openForm(item) {
    const f = $('#item-form');
    f.reset();
    state.editingId = item ? item.id : null;
    state.pendingPhoto = null;
    $('#form-title').textContent = item ? 'Edit item' : 'Add item';
    ['#edit-only', '#form-washed', '#form-cancel', '#form-delete'].forEach((s) => ($(s).hidden = !item));
    setFormPhoto(null);
    if (item) {
      f.elements.name.value = item.name;
      f.category.value = item.category;
      f.washEvery.value = item.washEvery;
      f.wearsSinceWash.value = item.wearsSinceWash;
      f.totalWears.value = item.totalWears;
      $('#form-history').textContent =
        `Last washed: ${item.lastWashed || '—'}. Worn on: ${item.wearLog.length ? [...item.wearLog].reverse().join(', ') : '—'}`;
      if (item.photo) photoUrl(item.photo).then((u) => state.editingId === item.id && !state.pendingPhoto && setFormPhoto(u)).catch(() => {});
    }
  }

  async function onFormSubmit(e) {
    e.preventDefault();
    const f = e.target;
    const editing = state.items.find((i) => i.id === state.editingId);
    const id = editing ? editing.id : Logic.newId();
    const fields = { name: f.elements.name.value, category: f.category.value, washEvery: f.washEvery.value };
    const pending = state.pendingPhoto;

    const ok = await busy('Saving…', async () => {
      let photo = editing ? editing.photo : null;
      if (pending) {
        photo = `photos/${id}-${Date.now()}.jpg`;
        await GH.putBase64(photo, pending.base64, null, `Add photo for ${fields.name}`);
        photoUrls.set(photo, Promise.resolve(pending.dataUrl));
      }
      if (editing) {
        const patch = { ...fields, photo, wearsSinceWash: f.wearsSinceWash.value, totalWears: f.totalWears.value };
        await commit((items) => Logic.updateItem(items, id, patch), `Edit ${fields.name}`);
        if (pending && editing.photo) GH.deleteFile(editing.photo, `Remove old photo for ${fields.name}`).catch(() => {});
      } else {
        await commit((items) => Logic.addItem(items, Logic.createItem({ id, ...fields, photo })), `Add ${fields.name}`);
      }
    });
    if (!ok) return;
    if (editing) {
      switchTab('closet');
    } else {
      openForm(null);
      showStatus(`Added ${fields.name}. Add another, or go to Closet.`);
    }
  }

  // ---------- settings ----------
  function fillSettings() {
    const c = { ...GH.guessFromLocation(), ...GH.getConfig() };
    const f = $('#settings-form');
    f.owner.value = c.owner || '';
    f.repo.value = c.repo || '';
    f.branch.value = c.branch || '';
    f.token.value = c.token || '';
  }

  // ---------- events ----------
  function bindEvents() {
    $('nav').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-tab]');
      if (b) switchTab(b.dataset.tab);
    });

    $$('.category-filter').forEach((sel) =>
      sel.addEventListener('change', () => {
        state.filters[sel.dataset.for] = sel.value;
        render();
      })
    );

    $('#closet-grid').addEventListener('click', (e) => {
      const card = e.target.closest('.card');
      if (!card) return;
      const item = state.items.find((i) => i.id === card.dataset.id);
      state.tab = 'add';
      openForm(item);
      render();
    });

    const toggler = (selection, after) => (e) => {
      const card = e.target.closest('.card');
      if (!card) return;
      const id = card.dataset.id;
      selection().has(id) ? selection().delete(id) : selection().add(id);
      card.classList.toggle('selected', selection().has(id));
      if (after) after();
    };
    $('#log-grid').addEventListener('click', toggler(() => state.logSelection, renderLogCount));
    $('#wash-grid').addEventListener('click', toggler(() => state.washSelection));

    $('#log-date').addEventListener('change', (e) => {
      state.logDate = e.target.value || Logic.todayStr();
      state.logSelection = new Set(Logic.wornOn(state.items, state.logDate));
      render();
    });

    $('#log-save').addEventListener('click', async () => {
      const ids = [...state.logSelection];
      const date = state.logDate;
      const ok = await busy('Saving…', () => commit((items) => Logic.setWornOn(items, ids, date), `Log wear ${date}`));
      if (ok) showStatus(`Saved ${ids.length} item(s) for ${date}.`);
    });

    $('#wash-select-all').addEventListener('click', () => {
      const all = Logic.needsWashList(state.items).map((i) => i.id);
      state.washSelection = state.washSelection.size === all.length ? new Set() : new Set(all);
      render();
    });

    $('#wash-save').addEventListener('click', async () => {
      const ids = [...state.washSelection];
      if (!ids.length) return showStatus('Select items first.');
      const ok = await busy('Saving…', () => commit((items) => Logic.markWashed(items, ids, Logic.todayStr()), `Washed ${ids.length} item(s)`));
      if (ok) showStatus(`Marked ${ids.length} item(s) washed.`);
    });

    $('#item-form').addEventListener('submit', onFormSubmit);
    $('#item-form').photo.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        state.pendingPhoto = await resizePhoto(file);
        setFormPhoto(state.pendingPhoto.dataUrl);
      } catch (err) {
        showStatus('Could not read that photo: ' + err.message, true);
      }
    });

    $('#form-cancel').addEventListener('click', () => switchTab('closet'));

    $('#form-washed').addEventListener('click', async () => {
      const id = state.editingId;
      const ok = await busy('Saving…', () => commit((items) => Logic.markWashed(items, [id], Logic.todayStr()), 'Washed 1 item'));
      if (ok) {
        openForm(state.items.find((i) => i.id === id));
        showStatus('Marked washed.');
      }
    });

    $('#form-delete').addEventListener('click', async () => {
      const item = state.items.find((i) => i.id === state.editingId);
      if (!item || !confirm(`Delete "${item.name}"?`)) return;
      const ok = await busy('Deleting…', () => commit((items) => Logic.removeItem(items, item.id), `Delete ${item.name}`));
      if (ok) {
        if (item.photo) GH.deleteFile(item.photo, `Remove photo for ${item.name}`).catch(() => {});
        switchTab('closet');
      }
    });

    $('#settings-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      GH.setConfig({
        owner: f.owner.value.trim(),
        repo: f.repo.value.trim(),
        branch: f.branch.value.trim() || 'main',
        token: f.token.value.trim(),
      });
      const ok = await busy('Connecting…', load);
      if (ok) switchTab('closet');
    });
  }

  async function init() {
    bindEvents();
    if (!GH.isConfigured()) {
      switchTab('settings');
      showStatus('First time here: fill in GitHub settings.');
      return;
    }
    render();
    if (await busy('Loading…', load)) render();
  }

  window.App = { state, load, render, switchTab };
  init();
})();
