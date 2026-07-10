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
    // pull out pure hashtag lines (e.g. "#christmas") as tags; strict so lyric "# 1." isn't eaten
    const isTagLine = l => /^#[^\s#]+(\s+#[^\s#]+)*$/.test(l.trim());
    const tags = chunk.split('\n').filter(isTagLine)
      .flatMap(l => l.trim().split(/\s+/)).map(t => t.replace(/^#/, '').toLowerCase()).filter(Boolean);
    // a verse = a stanza (consecutive lines between blank lines). This preserves multi-line verses.
    const stanzas = chunk.split('\n').filter(l => !isTagLine(l)).join('\n')
      .split(/\n[ \t]*\n/)
      .map(s => s.split('\n').map(x => x.trim()).filter(l => l && !isNoise(l)))
      .filter(g => g.length);
    if (!stanzas.length) continue;
    const head = stanzas[0];                       // title (+ optional "( key )" header line)
    const title_ne = stripScale(head[0]);
    const leadExtra = head.slice(1).filter(l => !isScale(l));   // lyrics stuck in the title block
    const verseGroups = (leadExtra.length ? [leadExtra] : []).concat(stanzas.slice(1));
    const verses = verseGroups.map(g => g.join('\n')).filter(Boolean).map(ne => ({ ne, en: romanizeText(ne) }));
    songs.push({
      id: 0, number: 0, book: 'other',
      title: tc(romanizeText(title_ne)), title_ne,
      section: artist, section_ne: '',
      tags,
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
