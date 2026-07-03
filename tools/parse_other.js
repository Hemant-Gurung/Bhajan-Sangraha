// Build src/data/other.json from the per-artist files in src/data/other/*.txt.
// One file per artist. In each file:
//   @Artist Name      -> optional first line; sets the display name (else derived from filename)
//   <title>           -> first line of a song block (optionally a 2nd line with a ( key ) header)
//   ...lyric lines...  -> one blank line between lines; TWO blank lines between songs
const fs = require('fs');
const path = require('path');
const { romanizeText } = require('./romanize');
const dir = path.join(__dirname, '..', 'src', 'data');
const otherDir = path.join(dir, 'other');
const tc = s => s.split(/\s+/).map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
const fromSlug = f => tc(f.replace(/\.txt$/, '').replace(/[-_]+/g, ' '));

function isScale(line) {
  const m = line.match(/\(([^)]*)\)\s*$/);
  if (!m) return false;
  const c = m[1];
  return /major|minor|fret|fast|\d\s*\/\s*\d|¾/i.test(c) || /^[\sA-Ga-g#♭b,\/=0-9]+$/.test(c);
}
const stripScale = line => line.replace(/\s*\([^)]*\)\s*$/, '').trim();
const isNoise = line => /^\s*Music\b/i.test(line);

// group lyric lines into verses: accumulate while parens are unbalanced (keeps "(...\n...) २" together)
function toVerses(lines) {
  const verses = []; let buf = [], bal = 0;
  for (const l of lines) {
    buf.push(l);
    bal += (l.split('(').length - 1) - (l.split(')').length - 1);
    if (bal <= 0) { verses.push(buf.join('\n')); buf = []; bal = 0; }
  }
  if (buf.length) verses.push(buf.join('\n'));
  return verses;
}

const files = fs.readdirSync(otherDir).filter(f => f.endsWith('.txt')).sort();
const songs = [];
for (const file of files) {
  const raw = fs.readFileSync(path.join(otherDir, file), 'utf8').replace(/\r/g, '').replace(/￼/g, '');
  let artist = fromSlug(file);
  let body = raw;
  const m = raw.match(/^\s*@(.+)\n/);   // optional @Name header overrides the filename
  if (m) { artist = m[1].trim(); body = raw.slice(m[0].length); }
  const chunks = body.split(/\n[ \t]*\n[ \t]*\n+/).map(c => c.trim()).filter(Boolean);
  for (const chunk of chunks) {
    const lines = chunk.split('\n').map(l => l.trim()).filter(Boolean);
    let h = -1;
    for (let k = 0; k < Math.min(2, lines.length); k++) if (isScale(lines[k])) { h = k; break; }
    const title_ne = stripScale(lines[0]);
    const lyric = lines.slice(h >= 0 ? h + 1 : 1).filter(l => !isNoise(l));
    const verses = toVerses(lyric).map(ne => ({ ne, en: romanizeText(ne) }));
    songs.push({
      id: 0, number: 0, book: 'other',
      title: tc(romanizeText(title_ne)), title_ne,
      section: artist, section_ne: '',
      verses,
    });
  }
}

// sort alphabetically (Nepali) within each artist, keeping artist order by first appearance
const order = [...new Set(songs.map(s => s.section))];
const coll = new Intl.Collator('en', { sensitivity: 'base' });
songs.sort((a, b) =>
  order.indexOf(a.section) - order.indexOf(b.section) || coll.compare(a.title, b.title));
songs.forEach((s, i) => { s.id = i; s.number = i + 1; });

fs.writeFileSync(path.join(dir, 'other.json'), JSON.stringify(songs, null, 1) + '\n');
console.log('songs:', songs.length);
songs.forEach(s => console.log(String(s.number).padStart(2), `${s.verses.length}v`, `[${s.section}]`, s.title_ne));
