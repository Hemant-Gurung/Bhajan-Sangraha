// Phone app for adding / editing / deleting songs in the private songs-data repo, straight through the GitHub API.
// No server: the GitHub key lives in this phone's storage only. File format + parsing: tools/songfile.js.
(() => {
  const OWNER = 'Hemant-Gurung', REPO = 'songs-data';
  const LOGO = 'logo.png';   // desktop app logo (src/renderer/logo.png) scaled to 180px
  const $app = document.getElementById('app');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get: k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
    set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* private mode: lives for this session */ } },
  };
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const tc = s => s.split(/\s+/).map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
  const fromSlug = f => tc(f.replace(/\.txt$/, '').replace(/[-_]+/g, ' '));   // same as parse_other.js
  const versesOf = text => (text || '').replace(/\r/g, '').split(/\n[ \t]*\n+/)
    .map(v => v.split('\n').map(l => l.trim()).filter(Boolean).join('\n')).filter(Boolean);

  let token = store.get('gh-token');
  let artists = null;          // [{ file, sha, header, name, chunks, songs: [{ ci, title_ne, key, tags, verses }] }]
  let online = true;
  let route = 'home', routeFile = null;
  let draft = null;            // song being added/edited
  let q = '', setupError = '', saving = false;
  let lyricMode = store.get('lyric-mode') || 'both';

  /* ---------- GitHub ---------- */
  class ApiError extends Error { constructor(kind, status) { super(kind); this.kind = kind; this.status = status; } }
  async function gh(path, { method = 'GET', body, raw } = {}) {
    let r;
    try {
      r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}${path}`, {
        method, cache: 'no-store', body: body && JSON.stringify(body),
        headers: {
          Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28',
          Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
        },
      });
    } catch { throw new ApiError('offline'); }
    if (r.status === 401) throw new ApiError('key', 401);
    if (r.status === 403 || r.status === 404) throw new ApiError('perm', r.status);
    if (r.status === 409 || r.status === 422) throw new ApiError('conflict', r.status);
    if (!r.ok) throw new ApiError('http', r.status);
    return raw ? r.text() : r.json();
  }
  function b64(s) {
    const bytes = new TextEncoder().encode(s);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function toArtist(file, sha, raw) {
    const { artist, chunks } = splitFile(raw);
    const songs = chunks.map((c, ci) => ({ ci, ...parseSong(c) })).filter(s => s.title_ne)
      .sort((x, y) => x.title_ne.localeCompare(y.title_ne, 'ne'));
    return { file, sha, header: artist, name: artist || fromSlug(file), chunks, songs };
  }
  async function load() {
    const list = await gh('/contents/other');
    const files = list.filter(f => f.type === 'file' && f.name.endsWith('.txt'));
    artists = await Promise.all(files.map(async f =>
      toArtist(f.name, f.sha, await gh('/contents/other/' + encodeURIComponent(f.name), { raw: true }))));
    artists.sort((a, b) => a.name.localeCompare(b.name));
    online = true;
  }
  // one commit per change; sha guards against overwriting an edit made elsewhere (-> conflict)
  async function writeArtist(a, chunks, message) {
    const text = joinFile(a.header, chunks);
    const res = await gh('/contents/other/' + encodeURIComponent(a.file), {
      method: 'PUT', body: { message, content: b64(text), ...(a.sha ? { sha: a.sha } : {}) },
    });
    Object.assign(a, toArtist(a.file, res.content.sha, text));
    if (!artists.includes(a)) { artists.push(a); artists.sort((x, y) => x.name.localeCompare(y.name)); }
  }
  function handleError(e, loading) {
    if (e.kind === 'key' || (e.kind === 'perm' && loading)) {
      setupError = "GitHub didn't accept this key, or it can't see songs-data. Paste a new one.";
      return go('setup');
    }
    if (e.kind === 'offline') { online = false; return loading || !artists ? go('offline') : toast("You're offline. Nothing was saved.", true); }
    if (e.kind === 'perm') return toast("Your key can read but not save. It needs Contents: Read and write.", true);
    if (e.kind === 'conflict') {
      toast('Changed somewhere else. Reloaded, please try again.', true);
      return load().then(render).catch(() => {});
    }
    toast(`GitHub error ${e.status || ''}. Nothing was saved.`, true);
  }

  /* ---------- views ---------- */
  const artistOf = file => artists.find(a => a.file === file);
  function topbar() {
    return `<div class="topbar"><img class="mark" src="${LOGO}" alt=""><div class="brand">Songs</div>
      <span class="pill ${online ? '' : 'off'}">${online ? 'Online' : 'Offline'}</span></div>`;
  }
  function artistCards() {
    const t = norm(q);
    const shown = artists.filter(a => !t || norm(a.name).includes(t)
      || a.songs.some(s => norm(s.title_ne + ' ' + romanizeText(s.title_ne)).includes(t)));
    return `<div class="label">Artists · ${shown.length}</div><div class="cards">${shown.map(a => `
      <button class="row" data-go="artist" data-file="${esc(a.file)}">
        <div class="main"><div class="name">${esc(a.name)}</div><div class="sub">${plural(a.songs.length, 'song')}</div></div>
        <span class="chev">›</span></button>`).join('') || '<p class="muted">No artist or song matches.</p>'}</div>`;
  }
  function viewHome() {
    return `${topbar()}
      <input class="search" id="q" type="search" placeholder="Search artist or song…" value="${esc(q)}" autocomplete="off">
      <div id="artist-list">${artistCards()}</div>
      <button class="btn primary fab" data-act="add">＋ Add song</button>`;
  }
  function viewArtist() {
    const a = artistOf(routeFile);
    if (!a) { route = 'home'; return viewHome(); }
    const body = a.songs.length ? `<div class="label">Songs · ${a.songs.length}</div><div class="list">${a.songs.map(s => `
        <button class="row" data-act="edit" data-ci="${s.ci}">
          <div class="main"><div class="name deva">${esc(s.title_ne)}</div>
            <div class="sub">${plural(s.verses.length, 'verse')}${s.key ? ' · Key ' + esc(s.key) : ''}${s.tags.length ? ' · ' + esc(s.tags.join(', ')) : ''}</div></div>
          <span class="chev">›</span></button>`).join('')}</div>`
      : `<div class="empty"><div class="icon">♫</div><h2>No songs yet</h2>
          <p>Add the first song for ${esc(a.name)}. It goes out to churches with the next version.</p>
          <button class="btn primary" data-act="add" data-file="${esc(a.file)}">＋ Add song to this artist</button></div>`;
    return `<button class="back" data-go="home">‹ Artists</button>
      <h1>${esc(a.name)}</h1><div class="muted">${plural(a.songs.length, 'song')}</div>${body}
      ${a.songs.length ? `<div class="bottom"><div class="inner"><button class="btn secondary" data-act="add" data-file="${esc(a.file)}">＋ Add song to this artist</button></div></div>` : ''}`;
  }
  function viewForm() {
    if (Object.keys(draft.errors || {}).length) validate();   // after a failed Preview, errors clear as fields get fixed
    const d = draft, er = d.errors, nErr = Object.keys(er).length, edit = d.mode === 'edit';
    const n = versesOf(d.lyrics).length;
    return `<div class="sheet-head"><button class="btn text" data-act="cancel">Cancel</button>
        <div class="title">${edit ? 'Edit song' : 'Add song'}</div><span style="width:72px"></span></div>
      ${nErr ? `<div class="banner bad">${plural(nErr, 'thing')} to fix before preview</div>` : ''}
      <label class="field"><span>Artist</span>
        <select class="input ${er.artist ? 'bad' : ''}" id="f-artist" ${edit ? 'disabled' : ''}>
          ${d.file ? '' : '<option value="" selected disabled>Choose artist…</option>'}
          ${artists.map(a => `<option value="${esc(a.file)}" ${a.file === d.file ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
          <option value="__new" ${d.file === '__new' ? 'selected' : ''}>＋ New artist</option>
        </select></label>
      ${d.file === '__new' ? `<input class="input ${er.artist ? 'bad' : ''}" id="f-newartist" style="margin-top:8px" placeholder="New artist name" value="${esc(d.newArtist)}">` : ''}
      ${er.artist ? `<div class="err">${esc(er.artist)}</div>` : ''}
      <div class="two">
        <label class="field"><span>Title</span><input class="input deva ${er.title ? 'bad' : ''}" id="f-title" placeholder="गीतको नाम" value="${esc(d.title_ne)}"></label>
        <label class="field"><span>Key · optional</span><input class="input" id="f-key" placeholder="G major" value="${esc(d.key)}" autocapitalize="off"></label>
      </div>
      ${er.title ? `<div class="err">${esc(er.title)}</div>` : ''}
      <div class="field"><span>Lyrics <button class="mini" data-act="paste">⧉ Paste</button></span>
        <textarea class="input deva ${er.lyrics ? 'bad' : ''}" id="f-lyrics" placeholder="पहिलो पद यहाँ लेख्नुहोस्…">${esc(d.lyrics)}</textarea>
        ${er.lyrics ? `<div class="err">${esc(er.lyrics)}</div>` : ''}
        <div class="hint" id="f-count">Leave an empty line between verses · ${plural(n, 'verse')} found</div></div>
      <div class="field"><span>Tags</span><div class="chips">
        ${d.tags.map((t, i) => `<span class="chip">${esc(t)}<button data-act="tag-rm" data-i="${i}" aria-label="Remove ${esc(t)}">×</button></span>`).join('')}
        <button class="chip add" data-act="tag-add">＋ tag</button></div></div>
      ${edit ? '<button class="btn danger block" style="margin-top:28px" data-act="del">Delete song</button>' : ''}
      <div class="bottom"><div class="inner"><button class="btn primary" data-act="preview">Preview</button></div></div>`;
  }
  function similarSongs() {
    const t = norm(draft.title_ne);
    const out = [];
    for (const a of artists) for (const s of a.songs) {
      if (draft.mode === 'edit' && a.file === draft.file && s.ci === draft.ci) continue;
      const u = norm(s.title_ne);
      if (u === t || (t.length >= 6 && within(t, u, 2))) out.push(`${esc(s.title_ne)} — ${esc(a.name)}`);
    }
    return out.slice(0, 3);
  }
  function viewPreview() {
    const d = draft, verses = versesOf(d.lyrics), sim = similarSongs();
    const artistName = d.file === '__new' ? d.newArtist.trim() : artistOf(d.file).name;
    const modes = [['ne', 'Nepali'], ['both', 'Both'], ['roman', 'Romanized']];
    return `<button class="back" data-act="back-form">‹ Edit</button>
      <div class="label" style="margin-top:4px">Preview</div>
      <h1 class="deva">${esc(d.title_ne.trim())}</h1>
      <div class="muted">${esc(artistName)} · ${plural(verses.length, 'verse')}${d.key ? ' · Key ' + esc(d.key) : ''}${d.tags.length ? ' · ' + esc(d.tags.join(', ')) : ''}</div>
      ${sim.length ? `<div class="banner warn"><b>Similar song exists</b><span class="deva">${sim.join('<br>')}</span></div>` : ''}
      <div class="seg">${modes.map(([m, l]) => `<button class="${lyricMode === m ? 'on' : ''}" data-act="mode" data-m="${m}">${l}</button>`).join('')}</div>
      ${verses.map((v, i) => `<div class="verse"><div class="label">Verse ${i + 1}</div>
        ${lyricMode !== 'roman' ? `<div class="ne">${esc(v)}</div>` : ''}
        ${lyricMode !== 'ne' ? `<div class="${lyricMode === 'roman' ? 'ne' : 'en'}">${esc(romanizeText(v))}</div>` : ''}</div>`).join('')}
      <div class="bottom"><div class="inner"><button class="btn secondary" data-act="back-form">Edit</button>
        <button class="btn primary" data-act="save" ${saving ? 'disabled' : ''}>${saving ? 'Saving…' : 'Save song'}</button></div></div>`;
  }
  function viewSetup() {
    return `<div style="text-align:center;padding-top:40px"><img class="mark" src="${LOGO}" alt="" style="margin:0 auto;width:64px;height:64px">
        <div class="label" style="margin-top:14px">Bachan &amp; Bhajan · Songs</div>
        <h1>Connect to GitHub</h1><p class="muted">Paste your GitHub key once. It stays on this phone only.</p></div>
      ${setupError ? `<div class="banner bad">${esc(setupError)}</div>` : ''}
      <label class="field"><span>GitHub key</span>
        <input class="input" id="f-token" type="password" placeholder="github_pat_…" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
      <button class="btn primary block" style="margin-top:14px" data-act="connect">Connect</button>
      <div class="banner" style="background:var(--card);border:1px solid var(--line);margin-top:24px">
        <b>How to get a key</b>
        <ol class="muted" style="padding-left:18px;margin-top:6px">
          <li>github.com → Settings → Developer settings → Fine-grained tokens → Generate new token</li>
          <li>Repository access: <b style="display:inline">Only select repositories → songs-data</b></li>
          <li>Permissions: <b style="display:inline">Contents → Read and write</b></li>
          <li>Generate, copy it, and paste it above</li>
        </ol></div>`;
  }
  function viewOffline() {
    return `${topbar()}<div class="empty" style="padding-top:90px"><div class="icon">⌁</div><h2>You're offline</h2>
      <p>Songs and saving come back once you're connected.</p>
      <button class="btn secondary" data-act="retry">↻ Retry</button></div>`;
  }
  const views = { home: viewHome, artist: viewArtist, form: viewForm, preview: viewPreview, setup: viewSetup, offline: viewOffline };
  function render() { $app.innerHTML = views[route]() || ''; }
  function go(r, file) {
    route = r;
    if (file !== undefined) routeFile = file;
    render();
    window.scrollTo(0, 0);
  }

  /* ---------- form helpers ---------- */
  function readForm() {
    const v = id => { const el = document.getElementById(id); return el ? el.value : undefined; };
    if (!draft || v('f-title') === undefined) return;
    if (draft.mode === 'add') { draft.file = v('f-artist') || draft.file; draft.newArtist = v('f-newartist') ?? draft.newArtist; }
    draft.title_ne = v('f-title'); draft.key = v('f-key').replace(/[()]/g, '').trim(); draft.lyrics = v('f-lyrics');
  }
  function validate() {
    const er = {}, d = draft;
    if (d.file === '__new') {
      const n = d.newArtist.trim();
      if (!n) er.artist = 'Add the new artist name';
      else if (artists.some(a => norm(a.name) === norm(n))) er.artist = 'This artist already exists. Pick it from the list.';
    } else if (!d.file) er.artist = 'Pick an artist';
    const t = d.title_ne.trim();
    if (!t) er.title = 'Add a title';
    else if (/^[@#]/.test(t)) er.title = "A title can't start with @ or #";
    if (!versesOf(d.lyrics).length) er.lyrics = "Lyrics can't be empty. Paste or type at least one verse.";
    d.errors = er;
    return !Object.keys(er).length;
  }
  function newFileName(name) {
    const slug = romanizeText(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'artist';
    let f = `${slug}.txt`;
    for (let i = 2; artists.some(a => a.file === f); i++) f = `${slug}-${i}.txt`;
    return f;
  }
  async function save() {
    const d = draft, song = { title_ne: d.title_ne.trim(), key: d.key, tags: d.tags, verses: versesOf(d.lyrics) };
    const a = d.file === '__new'
      ? { file: newFileName(d.newArtist.trim()), sha: null, header: d.newArtist.trim(), name: d.newArtist.trim(), chunks: [], songs: [] }
      : artistOf(d.file);
    const chunks = a.chunks.slice();
    if (d.mode === 'edit') chunks[d.ci] = songText(song); else chunks.push(songText(song));
    saving = true; render();
    try {
      await writeArtist(a, chunks, `${d.mode === 'edit' ? 'Edit' : 'Add'} song: ${song.title_ne} (${a.name})`);
      draft = null;
      go('artist', a.file);
      toast(`Saved to ${a.name}`);
    } catch (e) { handleError(e); } finally { saving = false; if (route === 'preview') render(); }
  }
  async function del() {
    const a = artistOf(draft.file), s = a.songs.find(x => x.ci === draft.ci);
    try {
      await writeArtist(a, a.chunks.filter((_, i) => i !== draft.ci), `Delete song: ${s.title_ne} (${a.name})`);
      draft = null;
      closeSheet();
      go('artist', a.file);
      toast('Song deleted');
    } catch (e) { closeSheet(); handleError(e); }
  }

  /* ---------- toast + bottom sheet ---------- */
  let toastTimer;
  function toast(msg, bad) {
    document.querySelector('.toast')?.remove();
    const t = document.createElement('div');
    t.className = 'toast' + (bad ? ' bad' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), 3200);
  }
  function sheet(html) {
    closeSheet();
    const s = document.createElement('div');
    s.className = 'scrim';
    s.innerHTML = `<div class="sheet"><div class="grab"></div>${html}</div>`;
    document.body.appendChild(s);
  }
  const closeSheet = () => document.querySelector('.scrim')?.remove();

  /* ---------- events ---------- */
  const actions = {
    add(el) {
      const file = el.dataset.file || (route === 'artist' ? routeFile : '');
      draft = { mode: 'add', file, newArtist: '', title_ne: '', key: '', tags: [], lyrics: '', errors: {} };
      go('form');
    },
    edit(el) {
      const a = artistOf(routeFile), s = a.songs.find(x => x.ci === +el.dataset.ci);
      draft = { mode: 'edit', file: a.file, ci: s.ci, newArtist: '', title_ne: s.title_ne, key: s.key, tags: s.tags.slice(), lyrics: s.verses.join('\n\n'), errors: {} };
      go('form');
    },
    cancel() {
      readForm();
      if (draft.mode === 'add' && (draft.title_ne.trim() || draft.lyrics.trim()) && !confirm('Discard this song?')) return;
      const back = draft.file && draft.file !== '__new' ? draft.file : null;
      draft = null;
      back ? go('artist', back) : go('home');
    },
    preview() { readForm(); if (validate()) go('preview'); else go('form'); },
    'back-form'() { draft.errors = {}; go('form'); },
    save() { if (!saving) save(); },
    mode(el) { lyricMode = el.dataset.m; store.set('lyric-mode', lyricMode); render(); },
    'tag-add'() {
      readForm();
      const t = (prompt('Tag (e.g. christmas)') || '').trim().toLowerCase().replace(/^#/, '').replace(/[\s#]+/g, '-');
      if (t && !draft.tags.includes(t)) draft.tags.push(t);
      render();
    },
    'tag-rm'(el) { readForm(); draft.tags.splice(+el.dataset.i, 1); render(); },
    async paste() {
      const box = document.getElementById('f-lyrics');
      try {
        const text = await navigator.clipboard.readText();
        box.value = box.value.trim() ? box.value.replace(/\s*$/, '\n\n') + text : text;
        box.dispatchEvent(new Event('input', { bubbles: true }));
      } catch { toast('Paste blocked. Long-press the lyrics box and choose Paste.', true); }
    },
    del() {
      readForm();
      sheet(`<h3>Delete this song?</h3>
        <p><span class="deva">${esc(draft.title_ne)}</span> will be removed from ${esc(artistOf(draft.file).name)}. Churches stop seeing it after the next publish.</p>
        <button class="btn primary" style="background:#A1442B" data-act="del-confirm">Delete song</button>
        <button class="btn secondary" data-act="sheet-close">Cancel</button>`);
    },
    'del-confirm'(el) { el.disabled = true; el.textContent = 'Deleting…'; del(); },
    'sheet-close': closeSheet,
    async connect(el) {
      const v = document.getElementById('f-token').value.trim();
      if (!v) return;
      token = v; setupError = ''; el.disabled = true; el.textContent = 'Connecting…';
      try { await load(); store.set('gh-token', token); go('home'); } catch (e) { handleError(e, true); }
    },
    retry: boot,
  };
  document.addEventListener('click', e => {
    if (e.target.classList.contains('scrim')) return closeSheet();
    const el = e.target.closest('[data-act],[data-go]');
    if (!el) return;
    e.preventDefault();
    if (el.dataset.go) return go(el.dataset.go, el.dataset.file);
    actions[el.dataset.act]?.(el);
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'q') { q = e.target.value; document.getElementById('artist-list').innerHTML = artistCards(); }
    if (e.target.id === 'f-lyrics') document.getElementById('f-count').textContent =
      `Leave an empty line between verses · ${plural(versesOf(e.target.value).length, 'verse')} found`;
  });
  document.addEventListener('change', e => { if (e.target.id === 'f-artist') { readForm(); render(); } });
  window.addEventListener('online', () => { if (route === 'offline') boot(); else { online = true; if (route === 'home') render(); } });
  window.addEventListener('offline', () => { online = false; if (route === 'home') render(); });

  async function boot() {
    if (!token) return go('setup');
    $app.innerHTML = '<div class="spinner"></div>';
    try { await load(); go('home'); } catch (e) { handleError(e, true); }
  }
  boot();
})();
