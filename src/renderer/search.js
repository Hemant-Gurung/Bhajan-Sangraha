// Forgiving song search: matches title, artist, tags AND lyrics, tolerating spelling variants and small typos.
// Shared by operator.js (browser) and tools/test_search.js (node).

// Fold spelling variants so "yeshu", "yesu" and "yeshoo" (or ईश्वर / इश्वर) compare equal.
function norm(s) {
  return (s || '').toLowerCase().normalize('NFC')
    // Devanagari: drop virama/nasal marks, merge long/short vowels and common letter swaps
    .replace(/[्ँंः़‌‍]/g, '')
    .replace(/ी/g, 'ि').replace(/ू/g, 'ु').replace(/ई/g, 'इ').replace(/ऊ/g, 'उ')
    .replace(/[शष]/g, 'स').replace(/व/g, 'ब')
    // Roman: long vowels, w/v→b, ph→f, drop h (sh/bh/chh...), collapse doubled letters
    .replace(/ee/g, 'i').replace(/oo/g, 'u').replace(/[wv]/g, 'b').replace(/ph/g, 'f').replace(/z/g, 'j')
    .replace(/h/g, '').replace(/(.)\1+/g, '$1')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim()
    .replace(/(\w)a(?= |$)/g, '$1');   // word-final "a" is often dropped: bhagera = bhaager
}

// edit distance, bailing out once it's clearly more than max
function within(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (Math.min(...cur) > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

const index = new WeakMap();   // song -> normalized fields, built on first search
function indexOf(s) {
  let ix = index.get(s);
  if (!ix) {
    const head = norm([s.title, s.title_ne, s.section, ...(s.tags || [])].join(' '));
    const lines = s.verses.flatMap(v => v.ne.split('\n').map((ne, i) => ({
      text: ne, n: norm(ne + ' ' + ((v.en || '').split('\n')[i] || '')) })));
    const words = [...new Set((head + ' ' + lines.map(l => l.n).join(' ')).split(' '))];
    ix = { head, lines, words };
    index.set(s, ix);
  }
  return ix;
}

// -> null (no match) or { rank, line }: rank 0 = title/artist, 1 = lyrics, 2 = near match; line = lyric to show
function matchSong(s, query) {
  const qs = norm(query).split(' ').filter(Boolean);
  if (!qs.length) return { rank: 0, line: '' };
  const ix = indexOf(s);
  if (qs.every(w => ix.head.includes(w))) return { rank: 0, line: '' };
  const all = ix.head + ' ' + ix.lines.map(l => l.n).join(' ');
  let rank = 1;
  const found = qs.map(w => {
    if (all.includes(w)) return w;
    if (w.length < 4) return null;                       // too short to guess at
    rank = 2;
    return ix.words.find(x => within(w, x, w.length >= 7 ? 2 : 1)) || null;
  });
  if (found.includes(null)) return null;
  const hit = ix.lines.find(l => found.every(w => l.n.includes(w))) || ix.lines.find(l => l.n.includes(found[0]));
  return { rank, line: hit ? hit.text : '' };
}

if (typeof module !== 'undefined') module.exports = { norm, within, matchSong };
