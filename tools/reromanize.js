// Re-apply tools/romanize.js to the romanized lyrics (verse.en) of the fixed song books.
// The "other" book is rebuilt by parse_other.js, which uses the same romanizer.
// Run after any converter (archive/tools/build_children.py, merge_chorus.py) so every book follows the chart.
const fs = require('fs');
const path = require('path');
const { romanizeText } = require('./romanize');
const dir = path.join(__dirname, '..', 'src', 'data');

for (const f of ['bhajan2.json', 'chorus.json', 'balchorus.json']) {
  const file = path.join(dir, f);
  const backup = file + '.pre-chart.bak';
  if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);   // first run only: keep the original
  const songs = JSON.parse(fs.readFileSync(file, 'utf8'));
  let n = 0;
  for (const s of songs) for (const v of s.verses) { v.en = romanizeText(v.ne); n++; }
  fs.writeFileSync(file, JSON.stringify(songs, null, 1) + '\n');
  console.log(f, 'verses:', n);
}
