const { contextBridge, ipcRenderer } = require('electron');
const songs = [].concat(
  require('./data/bhajan2.json'),
  require('./data/chorus.json'),
  require('./data/balchorus.json'),
  require('./data/other.json'),
);
const bible = require('./data/bible.json');

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
});
