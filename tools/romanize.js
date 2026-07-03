// Pragmatic Devanagari (Nepali) -> Latin romanizer. Readable ASCII, not strict IAST.
const VOW = { 'अ':'a','आ':'aa','इ':'i','ई':'ee','उ':'u','ऊ':'oo','ऋ':'ri','ए':'e','ऐ':'ai','ओ':'o','औ':'au','ॐ':'om' };
const MAT = { 'ा':'aa','ि':'i','ी':'ee','ु':'u','ू':'oo','ृ':'ri','े':'e','ै':'ai','ो':'o','ौ':'au','ॅ':'e' };
const CON = { 'क':'k','ख':'kh','ग':'g','घ':'gh','ङ':'ng','च':'ch','छ':'chh','ज':'j','झ':'jh','ञ':'ny',
  'ट':'t','ठ':'th','ड':'d','ढ':'dh','ण':'n','त':'t','थ':'th','द':'d','ध':'dh','न':'n',
  'प':'p','फ':'ph','ब':'b','भ':'bh','म':'m','य':'y','र':'r','ल':'l','व':'w','श':'sh','ष':'sh','स':'s','ह':'h',
  'ळ':'l','क़':'q','ख़':'kh','ग़':'g','ज़':'z','ड़':'r','ढ़':'rh','फ़':'f','य़':'y' };
const HALANT = '्', ANUS = 'ं', CHANDRA = 'ँ', VISARGA = 'ः', NUKTA = '़';

function romanizeWord(w) {
  let out = '', pendingA = false;
  for (const ch of w) {
    if (CON[ch] !== undefined) { if (pendingA) out += 'a'; out += CON[ch]; pendingA = true; }
    else if (MAT[ch] !== undefined) { out += MAT[ch]; pendingA = false; }
    else if (VOW[ch] !== undefined) { if (pendingA) out += 'a'; out += VOW[ch]; pendingA = false; }
    else if (ch === HALANT) { pendingA = false; }
    else if (ch === ANUS) { if (pendingA) out += 'a'; out += 'n'; pendingA = false; }
    else if (ch === CHANDRA) { if (pendingA) out += 'a'; out += 'n'; pendingA = false; }
    else if (ch === VISARGA) { if (pendingA) out += 'a'; out += 'h'; pendingA = false; }
    else if (ch === NUKTA) { /* skip */ }
  }
  return out.replace(/aa$/, 'a');   // soften word-final 'aa' -> 'a' (schwa)
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
