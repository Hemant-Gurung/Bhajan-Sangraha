// Build src/data/other.json from the per-artist files in src/data/other/*.txt.
// One file per artist; file format is documented (and parsed) in songfile.js.
const fs = require('fs');
const path = require('path');
const { romanizeText } = require('./romanize');
const { splitFile, parseSong } = require('./songfile');
const dir = path.join(__dirname, '..', 'src', 'data');
const otherDir = path.join(dir, 'other');
const tc = s => s.split(/\s+/).map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
const fromSlug = f => tc(f.replace(/\.txt$/, '').replace(/[-_]+/g, ' '));

const files = fs.readdirSync(otherDir).filter(f => f.endsWith('.txt')).sort();
const songs = [];
for (const file of files) {
  const { artist, chunks } = splitFile(fs.readFileSync(path.join(otherDir, file), 'utf8'));
  for (const chunk of chunks) {
    const s = parseSong(chunk);
    if (!s) continue;
    songs.push({
      id: 0, number: 0, book: 'other',
      title: tc(romanizeText(s.title_ne)), title_ne: s.title_ne,
      section: artist || fromSlug(file), section_ne: '',
      tags: s.tags,
      verses: s.verses.map(ne => ({ ne, en: romanizeText(ne) })),
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
