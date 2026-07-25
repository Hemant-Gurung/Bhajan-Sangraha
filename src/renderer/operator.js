const { songs, bible, project: sendSlide, closeProjector } = window.sanctuary;

let frozen = false;                       // when true, projector holds its last frame
function project(payload) { if (!frozen) sendSlide(payload); }

const BG_COLORS = ['#FFFFFF', '#FAF8F3', '#2B2B27', '#0B0B12', '#1B1A33', 'gradient'];
const TEXT_COLORS = ['#000000', '#2B2B27', '#6E7656', '#B06A44', '#FFFFFF', 'gradient'];

const state = {
  tab: 'songs',
  lyric: 'ne',             // song lyrics on screen: ne | roman | both
  sbook: 'all',            // songs book filter: all | bhajan | chorus | children | other
  tag: null,               // active tag filter (e.g. 'christmas'), or null
  openArtists: new Set(),  // expanded artist groups in the Other accordion
  bg: '#FFFFFF',
  text: '#000000',
  mediaBg: null,            // filename of selected media background (null = none)
  mediaDir: '',             // resolved path to media directory
  mediaList: [],            // list of filenames in media library
  // songs
  song: null,
  vi: 0,
  // bible
  trans: 'KJV',
  book: 'JHN',
  chap: 3,
  verse: null,
};

const bookEn = (code) => (bible.books.find(b => b.code === code) || {}).en || code;

let isLive = false;            // true once something has been sent to the projector
let liveSlide = null;          // exact payload currently on the projector (the staged preview is separate)
let liveLabel = '';            // short reference shown in the LIVE readout
// Stage-then-send: selecting a song/verse or changing appearance only updates the PREVIEW.
// Nothing reaches the projector until goLive() runs (Send button or Space).
function pushIfLive() { /* intentionally no-op — staging never auto-projects */ }
function goLive(payload, label) {
  isLive = true; liveSlide = payload; liveLabel = label || '';
  project(payload);
  renderLiveBadge();
}
function sendLive() { const s = currentSlide(); goLive(s, s.foot || s.pos || 'Live'); }
function renderLiveBadge() {
  const el = $('live');
  if (!el) return;
  el.classList.toggle('idle', !isLive);
  el.textContent = isLive ? liveLabel : 'Nothing live';
}

const $ = (id) => document.getElementById(id);

/* ---------- view routing ---------- */
function show(view) {
  $('view-home').classList.toggle('hidden', view !== 'home');
  $('view-op').classList.toggle('hidden', view === 'home');
}
function setTab(tab) {
  state.tab = tab;
  $('left-songs').classList.toggle('hidden', tab !== 'songs');
  $('left-bible').classList.toggle('hidden', tab !== 'bible');
  $('lyric-row').classList.toggle('hidden', tab === 'bible');   // Lyrics toggle is songs-only

  $('op-label').textContent = (tab === 'songs' ? 'Songs' : 'Bible') + ' — Operator panel';
  document.querySelectorAll('#seg button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $('seg').classList.toggle('bible', tab === 'bible');
  $('send').classList.toggle('bible', tab === 'bible');
  renderPreview();
}

/* ---------- songs ---------- */
const BOOK_LABEL = { bhajan: 'Bhajan', chorus: 'Chorus', children: 'Bal Chorus', other: 'Other' };
function rowHTML(s) {
  return `<li class="result book-${s.book} ${state.song && state.song.id === s.id && state.song.book === s.book ? 'active' : ''}" data-id="${s.id}" data-book="${s.book}">
      <span class="rnum">${String(s.number).padStart(3, '0')}</span>
      <span class="rname"><b class="deva">${s.title_ne || s.title}</b><div class="ne">${s.title}</div></span>
      <span class="rcount"><span class="tag tag-${s.book}">${BOOK_LABEL[s.book] || s.book}</span><div class="cnt">${s.verses.length ? s.verses.length + ' v' : 'title'}</div></span>
    </li>`;
}
function renderResults(list) {
  if (state.sbook === 'other') return renderByArtist(list);
  // cap the rendered rows; 751 songs at once is a lot of DOM and you always filter anyway
  const shown = list.slice(0, 60);
  $('results').innerHTML = shown.map(rowHTML).join('')
    + (list.length === 0 ? `<li class="label" style="padding:14px;">No songs match.</li>` : '')
    + (list.length > shown.length ? `<li class="label" style="padding:10px;">+${list.length - shown.length} more — keep typing to narrow</li>` : '');
}
// Other book: group by artist (section) into an accordion. Groups auto-open while searching.
function renderByArtist(list) {
  const searching = $('num').value.trim() || $('q').value.trim();
  const groups = new Map();
  for (const s of list) { const a = s.section || '—'; (groups.get(a) || groups.set(a, []).get(a)).push(s); }
  const html = [...groups].map(([artist, items]) => {
    const open = searching || state.openArtists.has(artist);
    return `<li class="artist-head ${open ? 'open' : ''}" data-artist="${artist}">
        <span class="deva">${artist}</span>
        <span class="cnt">${items.length} songs ${open ? '▾' : '▸'}</span>
      </li>${open ? items.map(rowHTML).join('') : ''}`;
  }).join('');
  $('results').innerHTML = html || `<li class="label" style="padding:14px;">No songs match.</li>`;
}
function selectSong(book, id) {
  state.song = songs.find(s => s.book === book && s.id === id) || null;
  state.vi = 0;
  renderResults(lastList);
  renderPreview();
  // scroll selected song into view
  const active = $('results').querySelector('.result.active');
  if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
let lastList = songs;
function filterSongs() {
  const num = $('num').value.trim();
  const q = $('q').value.trim().toLowerCase();
  let list = state.sbook === 'all' ? songs.slice() : songs.filter(s => s.book === state.sbook);
  if (num) list = list.filter(s => String(s.number) === num || String(s.number).startsWith(num));
  if (q) list = list.filter(s => s.title.toLowerCase().includes(q) || (s.title_ne && s.title_ne.includes(q)) || s.section.toLowerCase().includes(q) || (s.tags && s.tags.some(t => t.includes(q))));
  if (state.tag) list = list.filter(s => s.tags && s.tags.includes(state.tag));
  lastList = list;
  renderResults(list);
}
// tag filter chips, built from whatever tags exist in the data (e.g. Christmas)
function renderTags() {
  const tags = [...new Set(songs.flatMap(s => s.tags || []))].sort();
  const row = $('tag-row');
  if (!tags.length) { row.hidden = true; return; }
  row.hidden = false;
  const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
  $('tag-chips').innerHTML = tags.map(t =>
    `<button class="tag-chip ${state.tag === t ? 'active' : ''}" data-tag="${t}">${cap(t)}</button>`).join('');
}

/* ---------- bible ---------- */
function verses(trans) {
  const t = bible.text[trans] || {};
  return (t[state.book] && t[state.book][state.chap]) || {};
}
// which translation's verse numbers drive the grid/navigation (Nepali primary)
function gridVerses() { return verses(state.trans === 'KJV' ? 'KJV' : 'NE'); }
// chapter numbers for the current book (KJV is the complete canon; fall back to NE)
function chapterKeys() {
  const t = (bible.text.KJV && bible.text.KJV[state.book]) || (bible.text.NE && bible.text.NE[state.book]) || {};
  return Object.keys(t);
}
function renderBible() {
  $('book').innerHTML = bible.books.map(b =>
    `<option value="${b.code}" ${b.code === state.book ? 'selected' : ''}>${b.en} · ${b.ne}</option>`).join('');
  const chaps = chapterKeys();
  $('chapters').innerHTML = chaps.map(c =>
    `<button class="${String(c) === String(state.chap) ? 'sel' : ''}" data-c="${c}">${c}</button>`).join('')
    || '<span class="label">—</span>';
  const vs = Object.keys(gridVerses());
  $('verses').innerHTML = vs.map(v => `<button class="${String(v) === String(state.verse) ? 'sel' : ''}" data-v="${v}">${v}</button>`).join('')
    || '<span class="label">No verses in this chapter</span>';
  const transName = { KJV: 'King James Version', NE: 'NNRV', BOTH: 'KJV + NNRV' }[state.trans];
  $('selnote').textContent = state.verse
    ? `Reference selected: ${bookEn(state.book)} ${state.chap}:${state.verse} · ${transName}`
    : 'Reference selected: —';
  renderPreview();
}

/* ---------- preview + project ---------- */
function mediaSrc() {
  return state.mediaBg ? ('file://' + state.mediaDir + '/' + state.mediaBg) : null;
}
function slideBase() {
  return { bg: state.bg, text: state.text, mediaBg: mediaSrc() };
}
function currentSlide() {
  const base = slideBase();
  if (state.tab === 'songs' && state.song) {
    const song = state.song;
    const foot = `#${String(song.number).padStart(3, '0')} · ${song.title}`;
    if (song.verses.length) {
      const v = song.verses[state.vi];
      const roman = v.en || '';                      // romanized lyrics live in en
      const ne = state.lyric === 'roman' ? roman : v.ne;
      const en = state.lyric === 'both' ? roman : '';
      return { ...base, ne, en, foot, pos: `Verse ${state.vi + 1} of ${song.verses.length}` };
    }
    return { ...base, ne: song.title_ne || '', en: song.title, foot, pos: song.section };
  }
  if (state.tab === 'bible' && state.verse) {
    const ne = (verses('NE')[state.verse]) || '';
    const en = (verses('KJV')[state.verse]) || '';
    const label = state.trans === 'BOTH' ? 'KJV + NNRV' : state.trans;
    return {
      ...base,
      ne: state.trans === 'KJV' ? '' : ne,
      en: state.trans === 'NE' ? '' : en,
      foot: `${bookEn(state.book)} ${state.chap}:${state.verse} · ${label}`,
      pos: `${bookEn(state.book)} ${state.chap}:${state.verse} · ${label}`,
    };
  }
  return { ...base, ne: '', en: '', foot: '', pos: '' };
}
const GRAD_BG = 'linear-gradient(135deg,#1B1A33,#0B0B12)';
function isVideo(src) { return /\.(mp4|webm|mov)$/i.test(src || ''); }
function renderPreview() {
  const s = currentSlide();
  const empty = !s.ne && !s.en;
  $('pv-empty').style.display = empty ? '' : 'none';
  $('pv-ne').innerHTML = sanctuary.lyricHTML(s.ne);
  $('pv-en').innerHTML = sanctuary.lyricHTML(s.en);
  $('pv-foot').textContent = s.foot;
  $('pos').textContent = s.pos;
  $('preview').style.background = s.bg === 'gradient' ? GRAD_BG : s.bg;
  // media background in preview
  const img = $('pv-media-img'), vid = $('pv-media-vid');
  if (s.mediaBg) {
    if (isVideo(s.mediaBg)) {
      img.style.display = 'none';
      vid.src = s.mediaBg; vid.style.display = 'block'; vid.play();
    } else {
      vid.style.display = 'none'; vid.pause();
      img.src = s.mediaBg; img.style.display = 'block';
    }
  } else {
    img.style.display = 'none';
    vid.style.display = 'none'; vid.pause();
  }
  const color = s.text === 'gradient' ? '#2B2B27' : s.text;
  $('pv-ne').style.color = color;
  $('pv-en').style.color = color;
  $('pv-foot').style.color = color;
}

function renderSwatches() {
  $('bg-swatches').innerHTML = BG_COLORS.map(c => swatchHTML(c, state.bg === c)).join('');
  $('text-swatches').innerHTML = TEXT_COLORS.map(c => swatchHTML(c, state.text === c)).join('');
}
function swatchHTML(c, sel) {
  const bg = c === 'gradient' ? 'background:linear-gradient(135deg,#ff8a00,#e52e71,#2af598)' : `background:${c}`;
  return `<span class="swatch ${sel ? 'sel' : ''}" data-c="${c}" style="${bg}"></span>`;
}

/* ---------- events ---------- */
$('song-count').textContent = `${songs.length} songs in book`;

document.querySelectorAll('[data-go]').forEach(el =>
  el.addEventListener('click', () => { show('op'); setTab(el.dataset.go); }));
$('go-home').addEventListener('click', () => show('home'));

$('seg').addEventListener('click', e => { if (e.target.dataset.tab) setTab(e.target.dataset.tab); });

$('book-seg').addEventListener('click', e => {
  if (!e.target.dataset.book) return;
  state.sbook = e.target.dataset.book;
  document.querySelectorAll('#book-seg button').forEach(b => b.classList.toggle('active', b.dataset.book === state.sbook));
  $('num').value = ''; $('q').value = '';
  filterSongs();
});
$('tag-chips').addEventListener('click', e => {
  const t = e.target.dataset.tag;
  if (!t) return;
  state.tag = state.tag === t ? null : t;   // click active chip again to clear
  renderTags();
  filterSongs();
});
$('num').addEventListener('input', filterSongs);
$('q').addEventListener('input', filterSongs);
$('results').addEventListener('click', e => {
  const head = e.target.closest('.artist-head');
  if (head) {
    const a = head.dataset.artist;
    state.openArtists.has(a) ? state.openArtists.delete(a) : state.openArtists.add(a);
    renderResults(lastList);
    return;
  }
  const li = e.target.closest('.result');
  if (li && li.dataset.id !== undefined) selectSong(li.dataset.book, Number(li.dataset.id));
});

$('trans').addEventListener('click', e => {
  if (!e.target.dataset.t) return;
  state.trans = e.target.dataset.t;
  document.querySelectorAll('#trans button').forEach(b => b.classList.toggle('active', b.dataset.t === state.trans));
  state.verse = null;
  renderBible();
});
$('book').addEventListener('change', e => { state.book = e.target.value; state.chap = chapterKeys()[0] || 1; state.verse = null; renderBible(); });
$('chapters').addEventListener('click', e => { if (e.target.dataset.c) { state.chap = e.target.dataset.c; state.verse = null; renderBible(); } });
$('verses').addEventListener('click', e => { if (e.target.dataset.v) { state.verse = e.target.dataset.v; renderBible(); } });

$('controls-toggle').addEventListener('click', () => {
  const open = $('controls-body').classList.toggle('open');
  $('controls-toggle').setAttribute('aria-expanded', String(open));
});

$('bg-swatches').addEventListener('click', e => { if (e.target.dataset.c) { state.bg = e.target.dataset.c; renderSwatches(); renderPreview(); pushIfLive(); } });
$('text-swatches').addEventListener('click', e => { if (e.target.dataset.c) { state.text = e.target.dataset.c; renderSwatches(); renderPreview(); pushIfLive(); } });
$('bg-picker').addEventListener('input', e => { state.bg = e.target.value; renderSwatches(); renderPreview(); pushIfLive(); });
$('text-picker').addEventListener('input', e => { state.text = e.target.value; renderSwatches(); renderPreview(); pushIfLive(); });

$('lyric-seg').addEventListener('click', e => {
  if (!e.target.dataset.lyric) return;
  state.lyric = e.target.dataset.lyric;
  document.querySelectorAll('#lyric-seg button').forEach(b => b.classList.toggle('active', b.dataset.lyric === state.lyric));
  renderPreview(); pushIfLive();
});

$('prev').addEventListener('click', () => step(-1));
$('next').addEventListener('click', () => step(1));
function step(d) {
  if (state.tab === 'songs' && state.song) {
    state.vi = Math.max(0, Math.min(state.song.verses.length - 1, state.vi + d));
  } else if (state.tab === 'bible' && state.verse) {
    const vs = Object.keys(gridVerses());
    const i = vs.indexOf(String(state.verse)) + d;
    if (i >= 0 && i < vs.length) { state.verse = vs[i]; renderBible(); stepLive(); return; }
  }
  renderPreview();
  stepLive();
}
// Next/Previous follow through to the projector once something is live — an operator stepping
// verses mid-song shouldn't have to press Send again. Staging (colours, picking another song)
// still waits for Send. Freeze still wins: project() drops the slide while frozen.
function stepLive() { if (isLive) sendLive(); }

$('send').addEventListener('click', () => sendLive());
$('blank').addEventListener('click', () => goLive({ blank: true }, 'Blank screen'));
$('logo').addEventListener('click', () => goLive({ logo: true }, 'Logo'));

function setFreeze(on) {
  frozen = on;
  const b = $('freeze');
  b.classList.toggle('active', on);
  b.textContent = on ? 'Resume' : 'Freeze';
  if (!on && isLive && liveSlide) project(liveSlide);   // resume: re-show the actual live slide
}
$('freeze').addEventListener('click', () => setFreeze(!frozen));
$('close-present').addEventListener('click', () => { isLive = false; liveSlide = null; liveLabel = ''; renderLiveBadge(); setFreeze(false); closeProjector(); });

// arrow keys for stage navigation
document.addEventListener('keydown', e => {
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;  // don't hijack typing
  if (e.key === 'ArrowRight') step(1);
  if (e.key === 'ArrowLeft') step(-1);
  if (e.key === ' ') { e.preventDefault(); sendLive(); }
});
// arrow keys forwarded from the projector window when it has focus
sanctuary.onNav(d => step(d));

/* ---------- media backgrounds ---------- */
function renderMediaGallery() {
  const gallery = $('media-gallery');
  const thumbs = state.mediaList.map(name => {
    const src = 'file://' + state.mediaDir + '/' + name;
    const sel = state.mediaBg === name ? 'sel' : '';
    const isVid = isVideo(name);
    const thumb = isVid
      ? `<video class="media-thumb ${sel}" src="${src}" data-media="${name}" muted></video>`
      : `<img class="media-thumb ${sel}" src="${src}" data-media="${name}" />`;
    return `<span class="media-item">${thumb}<button class="media-rm" data-rm="${name}">&times;</button></span>`;
  }).join('');
  gallery.innerHTML = thumbs + '<button class="media-add" id="media-add" title="Add image or video">+</button>';
}

$('media-gallery').addEventListener('click', async (e) => {
  // remove button
  const rm = e.target.closest('[data-rm]');
  if (rm) {
    const name = rm.dataset.rm;
    await sanctuary.removeMedia(name);
    if (state.mediaBg === name) { state.mediaBg = null; renderPreview(); pushIfLive(); }
    state.mediaList = await sanctuary.listMedia();
    renderMediaGallery();
    return;
  }
  // add button
  if (e.target.closest('.media-add')) {
    const added = await sanctuary.pickMedia();
    if (added.length) {
      state.mediaList = await sanctuary.listMedia();
      renderMediaGallery();
    }
    return;
  }
  // select thumbnail
  const thumb = e.target.closest('[data-media]');
  if (thumb) {
    const name = thumb.dataset.media;
    // toggle: click again to deselect
    state.mediaBg = state.mediaBg === name ? null : name;
    renderMediaGallery();
    renderPreview();
    pushIfLive();
  }
});

// clear media when picking a solid bg color
$('bg-swatches').addEventListener('click', e => { if (e.target.dataset.c) state.mediaBg = null; renderMediaGallery(); }, true);
$('bg-picker').addEventListener('input', () => { state.mediaBg = null; renderMediaGallery(); }, true);

/* ---------- init ---------- */
async function init() {
  state.mediaDir = await sanctuary.mediaPath();
  state.mediaList = await sanctuary.listMedia();
  renderTags();
  filterSongs();
  renderSwatches();
  renderMediaGallery();
  renderBible();
  renderLiveBadge();
  show('home');
}
init();
