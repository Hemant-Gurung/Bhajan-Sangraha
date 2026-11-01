// Devanagari (Nepali) -> Latin romanizer, following the house typing chart (Nepali keyboard reference).
// Single source of truth for every song book: parse_other.js uses it for new songs,
// reromanize.js re-applies it to the existing books.  Run this file to self-check.
const VOW = { 'अ':'a','आ':'aa','इ':'i','ई':'i','उ':'u','ऊ':'oo','ऋ':'ri','ॠ':'rr','ए':'e','ऐ':'ae','ओ':'o','औ':'ao','ॐ':'om' };
const MAT = { 'ा':'aa','ि':'i','ी':'ii','ु':'u','ू':'uu','ृ':'r','ॄ':'rr','ॅ':'e','े':'e','ै':'ai','ॉ':'o','ो':'o','ौ':'au' };
const CON = { 'क':'k','ख':'kh','ग':'g','घ':'gh','ङ':'ng','च':'c','छ':'chh','ज':'j','झ':'jh','ञ':'ny',
  'ट':'t','ठ':'thh','ड':'d','ढ':'dh','ण':'n','त':'t','थ':'th','द':'d','ध':'dh','न':'n',
  'प':'p','फ':'f','ब':'b','भ':'bh','म':'m','य':'y','र':'r','ल':'l','व':'v','श':'sh','ष':'shh','स':'s','ह':'h',
  'ळ':'l','ज्ञ':'gy','क्ष':'ksh',
  // nukta letters, precomposed or as base + ़
  'क़':'q','ख़':'khh','ग़':'ghh','ज़':'z','ड़':'ddd','ढ़':'rh','फ़':'f','य़':'yy',
  'क़':'q','ख़':'khh','ग़':'ghh','ज़':'z','ड़':'ddd','ढ़':'rh','फ़':'f','य़':'yy' };
const SIGN = { 'ं':'m', 'ँ':'n', 'ः':':' };   // अं(am), अः(a:); chandrabindu has no chart key, kept as n
const HALANT = '्';
const TOKEN_RE = /ज्ञ|क्ष|[क-हक़-य़]़?|./gu;

function romanizeWord(w) {
  let out = '', pendingA = false;
  for (const t of w.match(TOKEN_RE) || []) {
    if (CON[t] !== undefined) { if (pendingA) out += 'a'; out += CON[t]; pendingA = true; }
    else if (MAT[t] !== undefined) { out += MAT[t]; pendingA = false; }
    else if (VOW[t] !== undefined) { if (pendingA) out += 'a'; out += VOW[t]; pendingA = false; }
    else if (t === HALANT) { pendingA = false; }
    else if (SIGN[t] !== undefined) { if (pendingA) out += 'a'; out += SIGN[t]; pendingA = false; }
  }
  return out;   // word-final consonant keeps no 'a' (Nepali pronunciation): गर्छन् -> garchhan, भागेर -> bhaager
}

function titleFrom(firstLine) {
  const clean = firstLine.replace(/\([^)]*\)/g, ' ').replace(/[।,–—\-]/g, ' ');
  const words = clean.split(/\s+/).filter(Boolean);
  const take = Math.min(words.length, Math.max(2, Math.ceil(words.length / 2)), 5);
  return words.slice(0, take).map(romanizeWord).filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

// Romanize full text: transliterate Devanagari word-runs, map digits, preserve everything else.
const DIG = { '०':'0','१':'1','२':'2','३':'3','४':'4','५':'5','६':'6','७':'7','८':'8','९':'9' };
const WORD_RE = /[ऀ-ॣॱ-ॿ]+/g;   // all Devanagari letters/matras/signs, excl digits(0966-6F) & danda(0964-65)
function romanizeText(s) {
  return (s || '').replace(WORD_RE, w => romanizeWord(w)).replace(/[०-९]/g, d => DIG[d]);
}

module.exports = { titleFrom, romanizeWord, romanizeText };

if (require.main === module) {
  const assert = require('assert');
  const cases = { 'येशू': 'yeshuu', 'प्रभुलाई': 'prabhulaai', 'सर्वदा': 'sarvadaa', 'चाहिन्छ': 'caahinchh',
    'ठूलो': 'thhuulo', 'विशेष': 'visheshh', 'ज्ञान': 'gyaan', 'संसार': 'samsaar', 'फल': 'fal',
    'गर्छन्': 'garchhan', 'आए': 'aae', 'एक': 'ek', 'इच्छा': 'icchhaa', 'आँट': 'aant', 'दुःख': 'du:kh', 'क्षमा': 'kshamaa', 'पवित्र': 'pavitr' };
  for (const [ne, en] of Object.entries(cases)) assert.strictEqual(romanizeWord(ne), en, ne);
  assert.strictEqual(romanizeText('हल्लेलूयाह (४) ।'), 'halleluuyaah (4) ।');
  console.log('romanize ok');
}
