const { app, BrowserWindow, ipcMain, screen, dialog } = require('electron');
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

app.whenReady().then(() => {
  createOperator();
  autoUpdater.checkForUpdatesAndNotify();   // no-op in dev (unpackaged), runs in the installed app
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!operatorWin) createOperator(); });
