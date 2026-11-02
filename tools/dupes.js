// List Other songs stored more than once (same or mostly the same lyrics), across all artist files.
// Run: node tools/dupes.js   (local only: prints titles, so never run it in the public CI)
const fs = require('fs'), path = require('path');
const { splitFile, parseSong } = require('./songfile');
const { lyricLines, overlap, DUP } = require('../src/renderer/search');

const dir = path.join(__dirname, '..', 'src', 'data', 'other');
const songs = fs.readdirSync(dir).filter(f => f.endsWith('.txt')).flatMap(f =>
  splitFile(fs.readFileSync(path.join(dir, f), 'utf8')).chunks.map(parseSong).filter(Boolean)
    .map(s => ({ file: f, title: s.title_ne, lines: lyricLines(s.verses) })));

// ponytail: compares every pair (~7k for 119 songs); index lines -> songs if this ever gets slow
let n = 0;
for (let i = 0; i < songs.length; i++) for (let j = i + 1; j < songs.length; j++) {
  const a = songs[i], b = songs[j], o = overlap(a.lines, b.lines);
  if (o < DUP) continue;
  n++;
  console.log(`${Math.round(o * 100)}% same:\n  ${a.title}  (${a.file})\n  ${b.title}  (${b.file})`);
}
console.log(n ? `\n${n} possible duplicate(s) among ${songs.length} songs` : `No duplicates among ${songs.length} songs`);

if (!n || process.argv.includes('--check')) {
  const assert = require('assert');
  const a = lyricLines(['येशू मेरो प्रभु हुनुहुन्छ\nउहाँ नै मेरो मुक्तिदाता', 'आमेन']);
  assert.strictEqual(a.length, 2);   // short line ignored
  assert.ok(overlap(a, lyricLines(['यीशु मेरो प्रभु हुनुहुन्छ\nउहाँ नै मेरो मुक्तिदाता'])) >= DUP);   // spelling variant still matches
  assert.strictEqual(overlap(a, lyricLines(['अर्कै गीत हो यो त'])), 0);
}
