// node tools/test_search.js — sanity checks for the forgiving song search
const assert = require('assert');
const { norm, within, matchSong } = require('../src/renderer/search');

assert.strictEqual(norm('Yeshoo'), norm('yeshu'));
assert.strictEqual(norm('yeshu'), norm('yesu'));
assert.strictEqual(norm('ईश्वर'), norm('इश्वर'));
assert.ok(within('prabu', 'prabhu'.replace('h', ''), 1));
assert.ok(!within('kitten', 'sitting', 2));

const song = { title: 'Hallelooyaah', title_ne: 'हल्लेलूयाह', section: 'X', verses: [
  { ne: 'पहिलो लाइन\nयेशू प्रभुलाई दिन्छौँ', en: 'pahilo laain\nyeshoo prabhulaaee dinchhaun' }] };
assert.strictEqual(matchSong(song, 'halleluya').rank, 0);                       // title, variant spelling
assert.strictEqual(matchSong(song, 'halelujah').rank, 2);                       // j/y typo -> near match
assert.deepStrictEqual(matchSong(song, 'yesu prabhu'), { rank: 1, line: 'येशू प्रभुलाई दिन्छौँ' });   // lyrics
assert.strictEqual(matchSong(song, 'prabhulai dinchau').rank, 1);
assert.strictEqual(matchSong(song, 'prabulay').rank, 2);                         // typo -> near match
assert.strictEqual(matchSong(song, 'येसु').rank, 1);                              // Devanagari spelling variant
assert.strictEqual(matchSong(song, 'zzzz qqqq'), null);
console.log('search ok');
