// ponytail: browser-only stand-in for preload.js, so UI work doesn't need the Electron binary
// (npm run start:web). Does nothing under Electron — preload already set window.sanctuary.
// Classic script + sync XHR on purpose: module scripts are blocked at file://, which is how
// Electron loads this page. Projector and media are stubs.
if (!window.sanctuary) {
  const read = (f) => {
    const x = new XMLHttpRequest();
    x.open('GET', `../data/${f}`, false);   // sync: operator.js runs in the next tag
    x.send();
    return JSON.parse(x.responseText);
  };
  window.sanctuary = {
    songs: [].concat(read('bhajan2.json'), read('chorus.json'), read('balchorus.json'), read('other.json')),
    bible: read('bible.json'),
    lyricHTML: (t) => (t || '').split('\n').map((l) => l.trim()).filter(Boolean)
      .map((l) => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')).join('<br>'),
    project: (p) => console.log('project', p),
    closeProjector() {}, onSlide() {}, nav() {}, onNav() {},
    toggleProjectorFullscreen: async () => {},
    pickMedia: async () => null,
    listMedia: async () => [],
    removeMedia: async () => {},
    mediaPath: async () => '',
  };
}
