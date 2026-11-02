// Phone app for adding / editing / deleting songs in the private songs-data repo, straight through the GitHub API.
// No server: the GitHub key lives in this phone's storage only. File format + parsing: tools/songfile.js.
(() => {
  const OWNER = 'Hemant-Gurung', REPO = 'songs-data', APP = 'Bhajan-Sangraha', WORKFLOW = 'publish.yml';
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
  async function gh(path, { method = 'GET', body, raw, repo = REPO } = {}) {
    let r;
    try {
      r = await fetch(`https://api.github.com/repos/${OWNER}/${repo}${path}`, {
        method, cache: 'no-store', body: body && JSON.stringify(body),
        headers: {
          Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28',
          Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
      });
    } catch { throw new ApiError('offline'); }
    if (r.status === 401) throw new ApiError('key', 401);
    if (r.status === 403 || r.status === 404) throw new ApiError('perm', r.status);
    if (r.status === 409 || r.status === 422) throw new ApiError('conflict', r.status);
    if (!r.ok) throw new ApiError('http', r.status);
    if (r.status === 204) return null;
    return raw ? r.text() : r.json();
  }
  const app = (path, opts) => gh(path, { ...opts, repo: APP });   // the public app repo: version, publish workflow
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
    await computeChanges().catch(() => {});
  }

  /* ---------- publishing ---------- */
  // release.json (written by the Publish workflow) names the songs-data commit that is live in churches.
  // An artist file whose blob differs from that commit's has unpublished changes.
  let version = '', base = null, changes = null, run = null, pollTimer = null;
  const baseText = {};         // blob sha -> file text at the last release
  const nextVersion = v => v.replace(/(\d+)$/, n => +n + 1);
  const songsOf = text => splitFile(text).chunks.map(parseSong).filter(Boolean);
  async function loadPublishInfo() {
    try { version = JSON.parse(await app('/contents/package.json', { raw: true })).version; } catch { version = ''; }
    try {
      const rel = JSON.parse(await app('/contents/release.json', { raw: true }));
      const tree = await gh(`/git/trees/${rel.data}?recursive=1`);
      base = { data: rel.data, files: Object.fromEntries(tree.tree.filter(t => t.path.startsWith('other/')).map(t => [t.path.slice(6), t.sha])) };
    } catch { base = null; }   // no release from the workflow yet: changes can't be tracked
    await computeChanges().catch(() => { changes = null; });
    // resume a publish started earlier (app was closed meanwhile), or one started from the Actions tab
    let saved = null;
    try { saved = JSON.parse(store.get('publish-run') || 'null'); } catch { /* ignore */ }
    try {
      const last = (await app(`/actions/workflows/${WORKFLOW}/runs?per_page=1`)).workflow_runs[0];
      if (saved) run = saved;
      else if (last && last.status !== 'completed')
        run = { id: last.id, url: last.html_url, version: nextVersion(version), steps: [], summary: [], counts: null };
      if (run) poll();
    } catch { /* can't see runs: publishing will report it when started */ }
  }
  async function computeChanges() {
    if (!base) { changes = null; return; }
    const out = {};
    for (const a of artists) {
      const old = base.files[a.file];
      if (old === a.sha) continue;
      if (old && !(old in baseText)) baseText[old] = await gh(`/git/blobs/${old}`, { raw: true });
      const before = new Map(old ? songsOf(baseText[old]).map(s => [s.title_ne, songText(s)]) : []);
      const after = new Map(a.songs.map(s => [s.title_ne, songText(s)]));
      const c = { newArtist: !old, added: [], edited: [], deleted: [] };
      for (const [t, txt] of after) if (!before.has(t)) c.added.push(t); else if (before.get(t) !== txt) c.edited.push(t);
      for (const t of before.keys()) if (!after.has(t)) c.deleted.push(t);
      if (c.newArtist || c.added.length || c.edited.length || c.deleted.length) out[a.file] = c;
    }
    changes = out;
  }
  const changeCount = () => changes ? Object.values(changes).reduce((n, c) => n + c.added.length + c.edited.length + c.deleted.length, 0) : 0;
  function changeLines() {
    const lines = [];
    for (const a of artists) {
      const c = changes && changes[a.file];
      if (!c) continue;
      if (c.newArtist) lines.push({ text: `New artist: ${a.name}`, sub: c.added });
      else if (c.added.length) lines.push({ text: `${plural(c.added.length, 'new song')} in ${a.name}`, sub: c.added });
      if (c.edited.length) lines.push({ text: `${plural(c.edited.length, 'song')} edited in ${a.name}`, sub: c.edited });
      if (c.deleted.length) lines.push({ text: `${plural(c.deleted.length, 'song')} removed from ${a.name}`, sub: c.deleted });
    }
    return lines;
  }
  // phone -> GitHub Actions: start the Publish workflow, then follow the run it created
  async function startPublish(note) {
    const v = nextVersion(version), since = Date.now() - 15000;
    let prev = null;
    try { prev = (await app(`/actions/workflows/${WORKFLOW}/runs?per_page=1`)).workflow_runs[0]?.id; } catch { /* first run */ }
    await app(`/actions/workflows/${WORKFLOW}/dispatches`, { method: 'POST', body: { ref: 'main', inputs: { note } } });
    run = { id: null, version: v, note, since, prev, steps: [], summary: changeLines(), counts: countsNow() };
    store.set('publish-run', JSON.stringify(run));
    go('progress');
    poll();
  }
  function countsNow() {
    const all = Object.values(changes || {});
    return {
      added: all.reduce((n, c) => n + c.added.length, 0), edited: all.reduce((n, c) => n + c.edited.length, 0),
      deleted: all.reduce((n, c) => n + c.deleted.length, 0), artists: all.filter(c => c.newArtist).length,
    };
  }
  const STEP_LABELS = {
    'Get song data (private repo)': 'Get song data', 'Rebuild song list': 'Rebuild song list', 'Bump version': 'Bump version',
    'Build and publish installer': 'Build Windows installer & upload', 'Commit version': 'Save version',
  };
  function poll() {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(async () => {
      try {
        if (!run.id) {   // the dispatch API returns no id: find the run it just created
          const runs = (await app(`/actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&per_page=5`)).workflow_runs;
          const r = runs.find(x => x.id !== run.prev && Date.parse(x.created_at) >= run.since);
          if (r) Object.assign(run, { id: r.id, url: r.html_url });
        }
        if (run.id) {
          const [r, jobs] = await Promise.all([app(`/actions/runs/${run.id}`), app(`/actions/runs/${run.id}/jobs`)]);
          run.status = r.status; run.conclusion = r.conclusion; run.url = r.html_url;
          run.started = r.run_started_at; run.updated = r.updated_at;
          run.steps = ((jobs.jobs[0] || {}).steps || []).filter(s => STEP_LABELS[s.name])
            .map(s => ({ label: STEP_LABELS[s.name], status: s.status, conclusion: s.conclusion, started: s.started_at, done: s.completed_at }));
          store.set('publish-run', JSON.stringify(run));
        }
        if (run.status === 'completed') {
          store.set('publish-run', '');
          if (route === 'progress' || route === 'home') go(run.conclusion === 'success' ? 'published' : 'failed');
          return;
        }
        if (route === 'progress') render();
      } catch (e) { if (e.kind === 'offline') online = false; }
      poll();
    }, run && run.id ? 5000 : 3000);
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
        <div class="main"><div class="name">${esc(a.name)}</div><div class="sub">${plural(a.songs.length, 'song')}${changes && changes[a.file] && changes[a.file].newArtist ? ' · new artist' : ''}</div></div>
        ${badge(a.file)}<span class="chev">›</span></button>`).join('') || '<p class="muted">No artist or song matches.</p>'}</div>`;
  }
  function badge(file) {
    const c = changes && changes[file];
    if (!c) return '';
    const n = c.added.length + c.edited.length + c.deleted.length;
    return n ? `<span class="badge">${c.edited.length || c.deleted.length ? n + ' changed' : '+' + n + ' new'}</span>` : '';
  }
  function viewHome() {
    const n = changeCount(), busy = run && run.status !== 'completed';
    const bar = busy ? `<button class="pubbar" data-go="progress"><span class="dot spin"></span><span>Publishing v${esc(run.version)}…</span><b>View ›</b></button>`
      : n ? `<button class="pubbar" data-act="publish"><span class="dot"></span><span>${plural(n, 'change')} ready</span><b class="go">Publish ›</b></button>`
      : `<button class="pubbar quiet" data-act="publish"><span>${base ? 'Everything is published' : 'Publish a new version'}</span><b>›</b></button>`;
    return `${topbar()}
      <input class="search" id="q" type="search" placeholder="Search artist or song…" value="${esc(q)}" autocomplete="off">
      <div id="artist-list">${artistCards()}</div>
      <button class="btn primary fab" data-act="add">＋ Add song</button>
      <div class="bottom"><div class="inner">${bar}</div></div>`;
  }
  function viewArtist() {
    const a = artistOf(routeFile);
    if (!a) { route = 'home'; return viewHome(); }
    const c = (changes && changes[a.file]) || { added: [], edited: [], deleted: [] };
    const state = s => c.added.includes(s.title_ne) ? 'new' : c.edited.includes(s.title_ne) ? 'edited' : '';
    const pending = c.added.length + c.edited.length + c.deleted.length;
    const body = a.songs.length ? `<div class="label">Songs · ${a.songs.length}</div><div class="list">${a.songs.map(s => `
        <button class="row" data-act="edit" data-ci="${s.ci}">
          <div class="main"><div class="name deva">${esc(s.title_ne)}</div>
            <div class="sub">${plural(s.verses.length, 'verse')}${s.key ? ' · Key ' + esc(s.key) : ''}${s.tags.length ? ' · ' + esc(s.tags.join(', ')) : ''}${state(s) ? ` · <span class="pending">${state(s)}, not published</span>` : ''}</div></div>
          ${state(s) ? '<span class="dot"></span>' : ''}<span class="chev">›</span></button>`).join('')}</div>`
      : `<div class="empty"><div class="icon">♫</div><h2>No songs yet</h2>
          <p>Add the first song for ${esc(a.name)}. It goes out to churches with the next version.</p>
          <button class="btn primary" data-act="add" data-file="${esc(a.file)}">＋ Add song to this artist</button></div>`;
    return `<button class="back" data-go="home">‹ Artists</button>
      <h1>${esc(a.name)}</h1><div class="muted">${plural(a.songs.length, 'song')}${pending ? ` · ${pending} not published yet` : ''}</div>
      ${c.deleted.length ? `<div class="banner warn">Removed, not published yet: <span class="deva">${c.deleted.map(esc).join(', ')}</span></div>` : ''}${body}
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
    const t = norm(draft.title_ne), mine = lyricLines(versesOf(draft.lyrics));
    const out = [];
    for (const a of artists) for (const s of a.songs) {
      if (draft.mode === 'edit' && a.file === draft.file && s.ci === draft.ci) continue;
      const u = norm(s.title_ne);
      if (u === t || (t.length >= 6 && within(t, u, 2)) || (mine.length && overlap(mine, lyricLines(s.verses)) >= DUP))
        out.push(`${esc(s.title_ne)} — ${esc(a.name)}`);
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
  function releaseNote() {
    const lines = changeLines().map(l => l.text);
    return lines.length ? lines.join('; ') + '.' : 'Song updates.';
  }
  function viewPublish() {
    const v = nextVersion(version), lines = changeLines();
    const what = !base
      ? '<p class="muted">The first publish from the phone can\'t list changes yet. Everything saved goes out. From the next one on, this shows exactly what changed.</p>'
      : lines.length ? `<div class="list">${lines.map(l => `<div class="row"><span class="dot"></span><div class="main"><div class="name">${esc(l.text)}</div>
          ${l.sub.length ? `<div class="sub deva">${l.sub.map(esc).join(' · ')}</div>` : ''}</div></div>`).join('')}</div>`
      : '<p class="muted">Nothing new since the last publish. You can still publish, but churches would get the same songs.</p>';
    return `<button class="back" data-go="home">‹ Songs</button>
      <div class="versions"><div><div class="label">Current</div><div class="old">v${esc(version || '?')}</div></div><span>→</span>
        <div><div class="label">New</div><div class="new">v${esc(v)}</div></div></div>
      <div class="label">What's new</div>${what}
      <label class="field"><span>Release note <em>auto-filled · editable</em></span>
        <textarea class="input" id="f-note" style="min-height:96px">${esc(releaseNote())}</textarea></label>
      <div class="banner bad">⚠ This sends an update to every church using the app.</div>
      <div class="bottom"><div class="inner"><button class="btn primary" data-act="publish-ask" ${version ? '' : 'disabled'}>Publish v${esc(v)}</button></div></div>`;
  }
  function stepList() {
    const icon = s => s.conclusion === 'success' ? '<span class="tick">✓</span>' : s.conclusion === 'failure' ? '<span class="tick bad">!</span>'
      : s.conclusion === 'skipped' ? '<span class="tick off">–</span>' : s.status === 'in_progress' ? '<span class="dot spin"></span>' : '<span class="tick off"></span>';
    const secs = s => s.started && s.done ? Math.max(1, Math.round((Date.parse(s.done) - Date.parse(s.started)) / 1000)) : 0;
    const steps = run.steps.length ? run.steps : Object.values(STEP_LABELS).map(label => ({ label, status: 'queued' }));
    return `<div class="list">${steps.map(s => `<div class="row step ${s.conclusion === 'failure' ? 'failed' : ''}">${icon(s)}
      <div class="main"><div class="name">${esc(s.label)}</div></div><span class="sub">${secs(s) ? fmtTime(secs(s)) : ''}</span></div>`).join('')}</div>`;
  }
  const fmtTime = s => s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`;
  function viewProgress() {
    if (!run) { route = 'home'; return viewHome(); }
    return `<button class="back" data-go="home">‹ Songs</button>
      <div class="label" style="margin-top:4px">Publishing</div><h1>Publishing v${esc(run.version)}</h1>
      <p class="muted">${run.id ? 'Runs on GitHub. Usually 5–10 minutes. You can close the app; it picks up again when you come back.' : 'Starting on GitHub…'}</p>
      <div style="margin-top:16px">${stepList()}</div>
      ${run.url ? `<a class="btn text block" href="${esc(run.url)}" target="_blank" rel="noopener">View on GitHub ↗</a>` : ''}`;
  }
  function viewPublished() {
    const c = run.counts, took = run.started && run.updated ? fmtTime(Math.round((Date.parse(run.updated) - Date.parse(run.started)) / 1000)) : '';
    const rows = [c && c.added && ['New songs', c.added], c && c.edited && ['Edited songs', c.edited], c && c.deleted && ['Removed songs', c.deleted],
      c && c.artists && ['New artists', c.artists], took && ['Took', took]].filter(Boolean);
    return `<div class="empty" style="padding-top:70px"><div class="bigtick">✓</div><h1>v${esc(run.version)} published</h1>
        <p>Churches will get it next time they open the app.</p></div>
      ${rows.length ? `<div class="list">${rows.map(([k, v]) => `<div class="row"><div class="main">${k}</div><b>${esc(v)}</b></div>`).join('')}</div>` : ''}
      <div class="bottom"><div class="inner"><button class="btn secondary" data-act="publish-done">Done</button></div></div>`;
  }
  function viewFailed() {
    const failed = run.steps.find(s => s.conclusion === 'failure');
    const late = failed && failed.label === STEP_LABELS['Commit version'];   // installer already uploaded
    return `<div class="label" style="margin-top:20px">Publishing</div>
      <h1>v${esc(run.version)} ${late ? 'went out, with a problem' : "didn't go out"}</h1>
      <p class="muted" style="margin-bottom:16px">${late
        ? 'Churches will get the update, but the new version number wasn\'t saved. Tell Claude (or check GitHub) before publishing again.'
        : `${failed ? esc(failed.label) + ' stopped. ' : ''}Your songs are safe and nothing reached churches. Retry runs the publish again.`}</p>
      ${stepList()}
      <div class="bottom"><div class="inner">
        ${run.url ? `<a class="btn secondary" href="${esc(run.url)}" target="_blank" rel="noopener">Show log</a>` : ''}
        ${late ? '<button class="btn primary" data-act="publish-done">Done</button>' : '<button class="btn primary" data-act="publish-retry">Retry</button>'}</div></div>`;
  }
  const views = { home: viewHome, artist: viewArtist, form: viewForm, preview: viewPreview, setup: viewSetup, offline: viewOffline,
    publish: viewPublish, progress: viewProgress, published: viewPublished, failed: viewFailed };
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
    publish() { if (run && run.status !== 'completed') return go('progress'); go('publish'); },
    'publish-ask'() {
      const v = nextVersion(version), c = countsNow();
      sheet(`<h3>Publish v${esc(v)}?</h3>
        <p>Every church using Bachan &amp; Bhajan will be offered this update the next time they open the app.</p>
        <p>A published version can't be taken back, only replaced by a newer one.</p>
        ${changes ? `<div class="chips" style="margin-bottom:8px">${c.added + c.edited + c.deleted ? `<span class="chip add">${plural(c.added + c.edited + c.deleted, 'change')}</span>` : ''}${c.artists ? `<span class="chip add">${plural(c.artists, 'new artist')}</span>` : ''}</div>` : ''}
        <button class="btn primary" data-act="publish-go">Yes, publish v${esc(v)}</button>
        <button class="btn secondary" data-act="sheet-close">Cancel</button>`);
    },
    async 'publish-go'(el) {
      const note = (document.getElementById('f-note')?.value || releaseNote()).trim();
      el.disabled = true; el.textContent = 'Starting…';
      try { await startPublish(note); closeSheet(); } catch (e) {
        closeSheet();
        if (e.kind === 'perm') toast("Your key can't start publishing. Give it Bhajan-Sangraha → Actions: Read and write.", true);
        else handleError(e);
      }
    },
    async 'publish-retry'(el) {
      el.disabled = true;
      try { await startPublish(run.note || releaseNote()); } catch (e) { el.disabled = false; handleError(e); }
    },
    async 'publish-done'() {
      run = null;
      $app.innerHTML = '<div class="spinner"></div>';
      try { await load(); await loadPublishInfo(); go('home'); } catch (e) { handleError(e, true); }
    },
    async connect(el) {
      const v = document.getElementById('f-token').value.trim();
      if (!v) return;
      token = v; setupError = ''; el.disabled = true; el.textContent = 'Connecting…';
      try { await load(); store.set('gh-token', token); await loadPublishInfo(); go('home'); } catch (e) { handleError(e, true); }
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
    try { await load(); await loadPublishInfo(); go('home'); } catch (e) { handleError(e, true); }
  }
  boot();
})();
