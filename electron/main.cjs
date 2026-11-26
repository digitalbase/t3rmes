const { app, BrowserWindow, Menu, ipcMain, nativeTheme, shell } = require('electron');
const path = require('node:path');
const { createHermesService } = require('./hermes.cjs');
const { readOmarchyTheme, watchOmarchyTheme } = require('./omarchyTheme.cjs');

const isDev = !app.isPackaged && process.env.T3RMES_PRODUCTION !== '1';
// Lets agents drive and screenshot the dev window over CDP (127.0.0.1 only).
if (isDev) app.commandLine.appendSwitch('remote-debugging-port', '9333');
let mainWindow = null;
const hermes = createHermesService({ getWindow: () => mainWindow });

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 848,
    minHeight: 560,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#000000' : '#ffffff',
    titleBarStyle: 'hiddenInset',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  // Links in chat open in the system browser, never inside the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('http://127.0.0.1:5175') || url.startsWith('file:')) return;
    event.preventDefault();
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
  });

  if (isDev) mainWindow.loadURL('http://127.0.0.1:5175');
  else mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
}

const profileQuery = (profile, sep) => (profile ? `${sep}profile=${encodeURIComponent(profile)}` : '');
ipcMain.handle('hermes:connections:list', () => hermes.list());
ipcMain.handle('hermes:connections:health', () => hermes.health());
ipcMain.handle('hermes:connections:select', (_event, id) => hermes.select(id));
ipcMain.handle('hermes:connections:add', (_event, input) => hermes.add(input));
ipcMain.handle('hermes:connections:update', (_event, id, input) => hermes.update(id, input));
ipcMain.handle('hermes:connections:import', () => hermes.importFromHermesDesktop());
ipcMain.handle('hermes:connections:remove', (_event, id) => hermes.remove(id));
ipcMain.handle('hermes:connections:sign-in', (_event, id) => hermes.signIn(id));
ipcMain.handle('hermes:connections:sign-out', (_event, id) => hermes.signOut(id));
ipcMain.handle('hermes:request', (_event, method, params) => hermes.request(method, params));
// Every profile's sessions in one recency-ordered list, each row tagged with its `profile`.
ipcMain.handle('hermes:sessions:list', (_event, { limit = 100, offset = 0, profile = null, excludeSources = [] } = {}) => {
  const exclude = excludeSources.length ? `&exclude_sources=${encodeURIComponent(excludeSources.join(','))}` : '';
  return hermes.rest(
    'GET',
    `/api/profiles/sessions?limit=${limit}&offset=${offset}&order=recent&archived=include&profile=${encodeURIComponent(profile || 'all')}${exclude}`,
  );
});
ipcMain.handle('hermes:sessions:search', (_event, query, profile) =>
  hermes.rest('GET', `/api/sessions/search?q=${encodeURIComponent(query)}&limit=20${profileQuery(profile, '&')}`),
);
ipcMain.handle('hermes:sessions:update', (_event, id, patch, profile) => hermes.updateSession(id, patch, profile));
// Stored rows keep display-only timeline markers (model switches) that session.resume drops.
ipcMain.handle('hermes:sessions:messages', (_event, id, profile) =>
  hermes.rest('GET', `/api/sessions/${encodeURIComponent(id)}/messages?order=latest&limit=500&inline_images=false${profileQuery(profile, '&')}`),
);
// Runtime-side files (e.g. a turn's `@image:` upload) as a data URL, like Hermes Desktop's remote fs.
ipcMain.handle('hermes:fs:read-data-url', async (_event, filePath, sessionId) => {
  const query = `path=${encodeURIComponent(filePath)}${sessionId ? `&session_id=${encodeURIComponent(sessionId)}` : ''}`;
  const result = await hermes.rest('GET', `/api/fs/read-data-url?${query}`);
  return typeof result === 'string' ? result : result?.dataUrl || '';
});
ipcMain.handle('theme:omarchy:get', () => readOmarchyTheme());
// Native context menu; resolves with the clicked item id or null.
ipcMain.handle('context-menu:show', (event, items) =>
  new Promise((resolve) => {
    let picked = null;
    const menu = Menu.buildFromTemplate(
      items.flatMap((item) => [
        ...(item.separatorBefore ? [{ type: 'separator' }] : []),
        { label: item.label, click: () => (picked = item.id) },
      ]),
    );
    menu.popup({
      window: BrowserWindow.fromWebContents(event.sender),
      callback: () => setImmediate(() => resolve(picked)),
    });
  }),
);

app.whenReady().then(() => {
  createWindow();
  hermes.start();
  watchOmarchyTheme((theme) => mainWindow?.webContents.send('theme:omarchy', theme));
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => hermes.stop());
