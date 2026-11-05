const { app, BrowserWindow, ipcMain, screen, dialog, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

let operatorWin = null;
let projectorWin = null;

function createOperator() {
  operatorWin = new BrowserWindow({
    width: 1280,
    height: 860,
    backgroundColor: '#ECEAE3',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: false },
  });
  operatorWin.loadFile(path.join(__dirname, 'renderer', 'operator.html'));
  operatorWin.on('closed', () => { operatorWin = null; if (projectorWin) projectorWin.close(); });
}

// Open the projector on the second display if one exists, else a normal window.
function ensureProjector() {
  if (projectorWin) return projectorWin;
  const displays = screen.getAllDisplays();
  const external = displays.find(d => d.id !== screen.getPrimaryDisplay().id);
  const bounds = external ? external.bounds : { x: 100, y: 100, width: 960, height: 540 };

  projectorWin = new BrowserWindow({
    x: bounds.x, y: bounds.y,
    width: bounds.width, height: bounds.height,
    fullscreen: !!external,
    backgroundColor: '#FFFFFF',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: false },
  });
  projectorWin.loadFile(path.join(__dirname, 'renderer', 'output.html'));
  projectorWin.on('closed', () => { projectorWin = null; });
  return projectorWin;
}

// Operator pushes a slide; we forward it to the projector once its DOM is ready.
ipcMain.on('project', (_e, payload) => {
  const win = ensureProjector();
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', () => win.webContents.send('slide', payload));
  } else {
    win.webContents.send('slide', payload);
  }
});

ipcMain.on('close-projector', () => { if (projectorWin) projectorWin.close(); });

// Projector window forwards arrow-key nav back to the operator (which owns slide state).
ipcMain.on('nav', (_e, dir) => { if (operatorWin) operatorWin.webContents.send('nav', dir); });

ipcMain.handle('toggle-projector-fullscreen', () => {
  if (!projectorWin) return false;
  const f = !projectorWin.isFullScreen();
  projectorWin.setFullScreen(f);
  return f;
});

// ---------- media backgrounds ----------
function mediaDir() {
  const dir = path.join(app.getPath('userData'), 'media');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

ipcMain.handle('pick-media', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(operatorWin, {
    title: 'Add background media',
    filters: [
      { name: 'Images & Videos', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'webm', 'mov'] },
    ],
    properties: ['openFile', 'multiSelections'],
  });
  if (canceled || !filePaths.length) return [];
  const dir = mediaDir();
  const added = [];
  for (const src of filePaths) {
    const name = Date.now() + '-' + path.basename(src);
    const dest = path.join(dir, name);
    await fs.promises.copyFile(src, dest);
    added.push(name);
  }
  return added;
});

ipcMain.handle('list-media', async () => {
  const dir = mediaDir();
  const files = await fs.promises.readdir(dir);
  const exts = /\.(jpg|jpeg|png|webp|gif|mp4|webm|mov)$/i;
  return files.filter(f => exts.test(f)).sort();
});

ipcMain.handle('remove-media', async (_e, filename) => {
  const p = path.join(mediaDir(), path.basename(filename));
  await fs.promises.rm(p, { force: true });
});

ipcMain.handle('media-path', () => mediaDir());

// Auto-update: check GitHub Releases on launch, prompt to restart once downloaded.
// ponytail: no update UI beyond one dialog — a church operator just wants "restart to apply".
autoUpdater.on('update-downloaded', (info) => {
  dialog.showMessageBox(operatorWin, {
    type: 'info',
    buttons: ['Restart now', 'Later'],
    defaultId: 0,
    title: 'Update ready',
    message: `Bachan & Bhajan ${info.version} is ready.`,
    detail: 'Restart to apply the update.',
  }).then(({ response }) => { if (response === 0) autoUpdater.quitAndInstall(); });
});
autoUpdater.on('error', (err) => console.error('auto-update:', err == null ? 'unknown' : err.message));

// File > Check for Updates: same check as on launch, but it answers either way.
async function checkForUpdatesNow() {
  const say = (message, detail) => dialog.showMessageBox(operatorWin, { type: 'info', title: 'Check for Updates', message, detail });
  if (!app.isPackaged) return say('Updates only work in the installed app.');
  try {
    const r = await autoUpdater.checkForUpdates();
    const latest = r && r.updateInfo && r.updateInfo.version;
    if (!latest || latest === app.getVersion()) return say(`You have the latest version (${app.getVersion()}).`);
    say(`Version ${latest} is downloading.`, "You'll be asked to restart when it's ready.");
  } catch (err) {
    say("Couldn't check for updates.", 'Check the internet connection and try again.');
  }
}
// Help > About: plain native box, nothing to load or maintain
function showAbout() {
  dialog.showMessageBox(operatorWin, {
    type: 'info',
    title: 'About Bachan & Bhajan',
    message: `Bachan & Bhajan ${app.getVersion()}`,
    detail: [
      'Offline song lyrics and Bible verses for Nepali churches, shown on a projector or second screen.',
      'Developed by Hemant Gurung',
      'Free to use: free for churches, fellowships and personal worship. Install it on as many computers as you like and share the installer. It may not be sold.',
      'Works offline: songs and the Bible are stored on this computer. The app only goes online to check for updates.',
      'Bible text:\n• King James Version (KJV), public domain\n• Nepali New Revised Version (NNRV), © Nepal Bible Society 1997, 2006, 2009, 2012',
      'Songs: lyrics belong to their writers and composers and are included for worship use.',
      'Updates install automatically. You can also use File › Check for Updates.',
      'Report a wrong lyric or suggest a song: hgurung316@gmail.com',
    ].join('\n\n'),
  });
}
const isMac = process.platform === 'darwin';
const appMenu = () => Menu.setApplicationMenu(Menu.buildFromTemplate([
  ...(isMac ? [{ role: 'appMenu' }] : []),
  { label: 'File', submenu: [
    { label: 'Check for Updates…', click: checkForUpdatesNow },
    { type: 'separator' },
    isMac ? { role: 'close' } : { role: 'quit' },
  ] },
  { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
  { role: 'help', submenu: [{ label: 'About Bachan & Bhajan', click: showAbout }] },
]));

app.whenReady().then(() => {
  appMenu();
  createOperator();
  autoUpdater.checkForUpdatesAndNotify();   // no-op in dev (unpackaged), runs in the installed app
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!operatorWin) createOperator(); });
