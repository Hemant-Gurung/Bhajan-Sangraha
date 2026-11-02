const { contextBridge, ipcRenderer } = require('electron');
const songs = [].concat(
  require('./data/bhajan2.json'),
  require('./data/chorus.json'),
  require('./data/balchorus.json'),
  require('./data/other.json'),
);
const bible = require('./data/bible.json');

// Long verses autofit to tiny text on the projector, so show them as several slides of at most
// MAX_LINES lines, split evenly (6 -> 3+3, 9 -> 3+3+3). Only the display changes; the data stays as is.
const MAX_LINES = 4;
function splitVerse(v) {
  const ne = v.ne.split('\n').filter(l => l.trim()), en = (v.en || '').split('\n').filter(l => l.trim());
  if (ne.length <= MAX_LINES) return [v];
  const size = Math.ceil(ne.length / Math.ceil(ne.length / MAX_LINES));
  const out = [];
  for (let i = 0; i < ne.length; i += size)
    out.push({ ne: ne.slice(i, i + size).join('\n'), en: en.slice(i, i + size).join('\n') });   // en is romanized line-by-line
  return out;
}
for (const s of songs) s.verses = s.verses.flatMap(splitVerse);

// Render a verse as escaped HTML, one <br> per source line break.
function lyricHTML(text) {
  return (text || '')
    .split('\n').map(l => l.trim()).filter(Boolean)
    .map(l => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
    .join('<br>');
}

contextBridge.exposeInMainWorld('sanctuary', {
  songs,
  bible,
  lyricHTML,
  project: (payload) => ipcRenderer.send('project', payload),
  closeProjector: () => ipcRenderer.send('close-projector'),
  onSlide: (cb) => ipcRenderer.on('slide', (_e, payload) => cb(payload)),
  nav: (dir) => ipcRenderer.send('nav', dir),                 // projector -> operator step
  onNav: (cb) => ipcRenderer.on('nav', (_e, dir) => cb(dir)),
  toggleProjectorFullscreen: () => ipcRenderer.invoke('toggle-projector-fullscreen'),
  // media backgrounds
  pickMedia: () => ipcRenderer.invoke('pick-media'),
  listMedia: () => ipcRenderer.invoke('list-media'),
  removeMedia: (name) => ipcRenderer.invoke('remove-media', name),
  mediaPath: () => ipcRenderer.invoke('media-path'),
});
