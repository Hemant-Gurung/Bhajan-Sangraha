// Read/write one artist file (src/data/other/<artist>.txt). Shared by parse_other.js (node) and mobile/ (browser).
// Format:
//   @Artist Name      -> optional first line; sets the display name (else derived from filename)
//   <title>           -> first line of a song block, optionally ending in "( key )" (or a 2nd "( key )" line)
//   #tag #tag         -> optional tag lines anywhere in the song
//   ...lyric lines...  -> one blank line between verses; TWO blank lines between songs
// Run this file to self-check: every artist file must survive parse -> write -> parse unchanged.

function isScale(line) {
  const m = line.match(/\(([^)]*)\)\s*$/);
  if (!m) return false;
  const c = m[1];
  return /major|minor|fret|fast|\d\s*\/\s*\d|¾/i.test(c) || /^[\sA-Ga-g#♭b,\/=0-9]+$/.test(c);
}
const stripScale = line => line.replace(/\s*\([^)]*\)\s*$/, '').trim();
const isNoise = line => /^\s*Music\b/i.test(line);
// pure hashtag lines (e.g. "#christmas"); strict so lyric "# 1." isn't eaten
const isTagLine = l => /^#[^\s#]+(\s+#[^\s#]+)*$/.test(l.trim());

// raw file -> { artist: '@' header name or null, chunks: one raw text block per song }
function splitFile(raw) {
  let body = raw.replace(/\r/g, '').replace(/￼/g, '');
  let artist = null;
  const m = body.match(/^\s*@(.+)\n/);
  if (m) { artist = m[1].trim(); body = body.slice(m[0].length); }
  return { artist, chunks: body.split(/\n[ \t]*\n[ \t]*\n+/).map(c => c.trim()).filter(Boolean) };
}

// one song block -> { title_ne, key, tags, verses: [ne text] }, or null if it holds no lyrics/title
function parseSong(chunk) {
  const tags = chunk.split('\n').filter(isTagLine)
    .flatMap(l => l.trim().split(/\s+/)).map(t => t.replace(/^#/, '').toLowerCase()).filter(Boolean);
  // a verse = a stanza (consecutive lines between blank lines). This preserves multi-line verses.
  const stanzas = chunk.split('\n').filter(l => !isTagLine(l)).join('\n')
    .split(/\n[ \t]*\n/)
    .map(s => s.split('\n').map(x => x.trim()).filter(l => l && !isNoise(l)))
    .filter(g => g.length);
  if (!stanzas.length) return null;
  const head = stanzas[0];                       // title (+ optional "( key )" header line)
  const keyLine = head.slice(1).find(isScale);
  const titleKey = head[0].match(/\(([^)]*)\)\s*$/);
  const key = (titleKey ? titleKey[1] : keyLine ? keyLine.replace(/^\(|\)$/g, '') : '').trim();
  const leadExtra = head.slice(1).filter(l => !isScale(l));   // lyrics stuck in the title block
  const verses = (leadExtra.length ? [leadExtra] : []).concat(stanzas.slice(1)).map(g => g.join('\n')).filter(Boolean);
  return { title_ne: stripScale(head[0]), key, tags, verses };
}

// { title_ne, key, tags, verses } -> song block text
function songText(s) {
  const head = [s.title_ne.trim() + (s.key ? ` ( ${s.key.trim()} )` : '')];
  if (s.tags && s.tags.length) head.push(s.tags.map(t => '#' + t).join(' '));
  return [head.join('\n'), ...s.verses].join('\n\n');
}

const joinFile = (artist, chunks) => (artist ? `@${artist}\n\n\n` : '') + chunks.join('\n\n\n') + '\n';

if (typeof module !== 'undefined') module.exports = { splitFile, parseSong, songText, joinFile, isScale };

if (typeof require !== 'undefined' && require.main === module) {
  const assert = require('assert'), fs = require('fs'), path = require('path');
  const dir = path.join(__dirname, '..', 'src', 'data', 'other');
  const songsOf = raw => splitFile(raw).chunks.map(parseSong).filter(Boolean);
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.txt'))) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    const { artist, chunks } = splitFile(raw);
    const rewritten = joinFile(artist, chunks.map(c => parseSong(c)).filter(Boolean).map(songText));
    assert.deepStrictEqual(songsOf(rewritten), songsOf(raw), f);
  }
  const s = { title_ne: 'नयाँ गीत', key: 'G major', tags: ['christmas'], verses: ['पद १\nलाइन', 'पद २'] };
  assert.deepStrictEqual(parseSong(songText(s)), s);
  console.log('songfile ok');
}
