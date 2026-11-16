const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { createHermesService } = require('./hermes.cjs');

const isDev = !app.isPackaged;
let mainWindow = null;
const hermes = createHermesService({ getWindow: () => mainWindow });

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: '#111214',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isDev) mainWindow.loadURL('http://127.0.0.1:5175');
  else mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
}

ipcMain.handle('hermes:connections:list', () => hermes.list());
ipcMain.handle('hermes:connections:select', (_event, id) => hermes.select(id));
ipcMain.handle('hermes:connections:add', (_event, input) => hermes.add(input));
ipcMain.handle('hermes:connections:remove', (_event, id) => hermes.remove(id));
ipcMain.handle('hermes:connections:sign-in', (_event, id) => hermes.signIn(id));
ipcMain.handle('hermes:connections:sign-out', (_event, id) => hermes.signOut(id));
ipcMain.handle('hermes:request', (_event, method, params) => hermes.request(method, params));

app.whenReady().then(() => {
  createWindow();
  hermes.start();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => hermes.stop());
