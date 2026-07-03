const { songs, bible, project: sendSlide, closeProjector } = window.sanctuary;

let frozen = false;                       // when true, projector holds its last frame
function project(payload) { if (!frozen) sendSlide(payload); }

const BG_COLORS = ['#FFFFFF', '#FAF8F3', '#2B2B27', '#0B0B12', '#1B1A33', 'gradient'];
const TEXT_COLORS = ['#000000', '#2B2B27', '#6E7656', '#B06A44', '#FFFFFF', 'gradient'];

const state = {
  tab: 'songs',
  lyric: 'ne',             // song lyrics on screen: ne | roman | both
  sbook: 'all',            // songs book filter: all | bhajan | chorus | children | other
  openArtists: new Set(),  // expanded artist groups in the Other accordion
  bg: '#FFFFFF',
  text: '#000000',
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
function pushIfLive() { if (isLive) project(currentSlide()); }

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
}
let lastList = songs;
function filterSongs() {
  const num = $('num').value.trim();
  const q = $('q').value.trim().toLowerCase();
  let list = state.sbook === 'all' ? songs.slice() : songs.filter(s => s.book === state.sbook);
  if (num) list = list.filter(s => String(s.number) === num || String(s.number).startsWith(num));
  if (q) list = list.filter(s => s.title.toLowerCase().includes(q) || (s.title_ne && s.title_ne.includes(q)) || s.section.toLowerCase().includes(q));
  lastList = list;
  renderResults(list);
}

/* ---------- bible ---------- */
function verses(trans) {
  const t = bible.text[trans] || {};
  return (t[state.book] && t[state.book][state.chap]) || {};
}
// which translation's verse numbers drive the grid/navigation (Nepali primary)
function gridVerses() { return verses(state.trans === 'KJV' ? 'KJV' : 'NE'); }
function renderBible() {
  $('book').innerHTML = bible.books.map(b =>
    `<option value="${b.code}" ${b.code === state.book ? 'selected' : ''}>${b.en} · ${b.ne}</option>`).join('');
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
function currentSlide() {
  if (state.tab === 'songs' && state.song) {
    const song = state.song;
    const foot = `#${String(song.number).padStart(3, '0')} · ${song.title}`;
    if (song.verses.length) {
      const v = song.verses[state.vi];
      const roman = v.en || '';                      // romanized lyrics live in en
      const ne = state.lyric === 'roman' ? roman : v.ne;
      const en = state.lyric === 'both' ? roman : '';
      return { ne, en, foot, pos: `Verse ${state.vi + 1} of ${song.verses.length}`, bg: state.bg, text: state.text };
    }
    // title-only (no lyrics yet): show the title itself
    return { ne: song.title_ne || '', en: song.title, foot, pos: song.section, bg: state.bg, text: state.text };
  }
  if (state.tab === 'bible' && state.verse) {
    const ne = (verses('NE')[state.verse]) || '';
    const en = (verses('KJV')[state.verse]) || '';
    const label = state.trans === 'BOTH' ? 'KJV + NNRV' : state.trans;
    return {
      ne: state.trans === 'KJV' ? '' : ne,
      en: state.trans === 'NE' ? '' : en,
      foot: `${bookEn(state.book)} ${state.chap}:${state.verse} · ${label}`,
      pos: `${bookEn(state.book)} ${state.chap}:${state.verse} · ${label}`,
      bg: state.bg, text: state.text,
    };
  }
  return { ne: '', en: '', foot: '', pos: '', bg: state.bg, text: state.text };
}
const GRAD_BG = 'linear-gradient(135deg,#1B1A33,#0B0B12)';
function renderPreview() {
  const s = currentSlide();
  $('pv-ne').innerHTML = sanctuary.lyricHTML(s.ne);
  $('pv-en').innerHTML = sanctuary.lyricHTML(s.en);
  $('pv-foot').textContent = s.foot;
  $('pos').textContent = s.pos;
  $('preview').style.background = s.bg === 'gradient' ? GRAD_BG : s.bg;
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

$('seg').addEventListener('click', e => { if (e.target.dataset.tab) setTab(e.target.dataset.tab); });

$('book-seg').addEventListener('click', e => {
  if (!e.target.dataset.book) return;
  state.sbook = e.target.dataset.book;
  document.querySelectorAll('#book-seg button').forEach(b => b.classList.toggle('active', b.dataset.book === state.sbook));
  $('num').value = ''; $('q').value = '';
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
$('book').addEventListener('change', e => { state.book = e.target.value; state.verse = null; renderBible(); });
$('chap').addEventListener('input', e => { state.chap = Number(e.target.value) || 1; state.verse = null; renderBible(); });
$('verses').addEventListener('click', e => { if (e.target.dataset.v) { state.verse = e.target.dataset.v; renderBible(); } });

$('bg-swatches').addEventListener('click', e => { if (e.target.dataset.c) { state.bg = e.target.dataset.c; renderSwatches(); renderPreview(); pushIfLive(); } });
$('text-swatches').addEventListener('click', e => { if (e.target.dataset.c) { state.text = e.target.dataset.c; renderSwatches(); renderPreview(); pushIfLive(); } });
$('bg-picker').addEventListener('input', e => { state.bg = e.target.value; renderSwatches(); renderPreview(); pushIfLive(); });
$('text-picker').addEventListener('input', e => { state.text = e.target.value; renderSwatches(); renderPreview(); pushIfLive(); });

$('lyric-mode').addEventListener('change', e => { state.lyric = e.target.value; renderPreview(); pushIfLive(); });

$('prev').addEventListener('click', () => step(-1));
$('next').addEventListener('click', () => step(1));
function step(d) {
  if (state.tab === 'songs' && state.song) {
    state.vi = Math.max(0, Math.min(state.song.verses.length - 1, state.vi + d));
  } else if (state.tab === 'bible' && state.verse) {
    const vs = Object.keys(gridVerses());
    const i = vs.indexOf(String(state.verse)) + d;
    if (i >= 0 && i < vs.length) { state.verse = vs[i]; renderBible(); pushIfLive(); return; }
  }
  renderPreview();
  pushIfLive();
}

$('send').addEventListener('click', () => { isLive = true; project(currentSlide()); });
$('blank').addEventListener('click', () => { isLive = false; project({ blank: true }); });
$('logo').addEventListener('click', () => { isLive = false; project({ logo: true }); });

function setFreeze(on) {
  frozen = on;
  const b = $('freeze');
  b.classList.toggle('active', on);
  b.textContent = on ? '▶ Resume' : '❄ Freeze';
  if (!on && isLive) project(currentSlide());   // resume: catch projector up to live state
}
$('freeze').addEventListener('click', () => setFreeze(!frozen));
$('close-present').addEventListener('click', () => { isLive = false; setFreeze(false); closeProjector(); });

// arrow keys for stage navigation
document.addEventListener('keydown', e => {
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;  // don't hijack typing
  if (e.key === 'ArrowRight') step(1);
  if (e.key === 'ArrowLeft') step(-1);
  if (e.key === ' ') { e.preventDefault(); isLive = true; project(currentSlide()); }
});
// arrow keys forwarded from the projector window when it has focus
sanctuary.onNav(d => step(d));

/* ---------- init ---------- */
filterSongs();
renderSwatches();
renderBible();
show('home');
