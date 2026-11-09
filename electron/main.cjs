const {
  app,
  BrowserWindow,
  ipcMain,
  protocol,
  net,
  Menu,
  clipboard,
  shell,
  desktopCapturer,
  systemPreferences,
} = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createReaderBridge } = require('./reader-bridge.cjs');
const { createScreenReader } = require('./screen-reader.cjs');
let readerBridge;
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'river',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);
let mainWindow,
  hudWindow,
  hudData = null,
  quitting = false;
const baseURL = 'river://app/index.html';
function trusted(event) {
  return (
    event.senderFrame &&
    new URL(event.senderFrame.url).protocol === 'river:' &&
    new URL(event.senderFrame.url).host === 'app'
  );
}
function lockDown(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false),
  );
}
function createMain() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 1050,
    minWidth: 880,
    minHeight: 700,
    title: 'River · Hold’em Studio',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 14 },
    backgroundColor: '#1c1b1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  lockDown(mainWindow);
  mainWindow.loadURL(baseURL);
  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => {
    hudWindow?.destroy();
    hudWindow = null;
    mainWindow = null;
  });
}
function showHUD() {
  if (hudWindow && !hudWindow.isDestroyed()) {
    hudWindow.show();
    hudWindow.focus();
    return;
  }
  hudWindow = new BrowserWindow({
    width: 420,
    height: 760,
    minWidth: 380,
    minHeight: 620,
    title: 'River HUD',
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    backgroundColor: '#1c1b1a',
    opacity: 0.98,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  hudWindow.setAlwaysOnTop(true, 'floating');
  hudWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  lockDown(hudWindow);
  hudWindow.loadURL(`${baseURL}?hud=1`);
  hudWindow.on('closed', () => {
    hudWindow = null;
  });
}
app.whenReady().then(() => {
  const screenReader = createScreenReader({
    desktopCapturer,
    systemPreferences,
    app,
    ownWindowIds: () =>
      BrowserWindow.getAllWindows()
        .map((w) => w.getMediaSourceId())
        .map((id) => Number(id.split(':')[1])),
  });
  const mainOnly = (event) => {
    if (!trusted(event) || event.sender !== mainWindow?.webContents)
      throw Error('Unavailable outside the River workspace.');
  };
  ipcMain.handle('screen:sources', async (event) => {
    mainOnly(event);
    return screenReader.list();
  });
  ipcMain.handle('screen:capture', async (event, input) => {
    mainOnly(event);
    return screenReader.capture(input);
  });
  ipcMain.handle('screen:reset', (event) => {
    mainOnly(event);
    screenReader.reset();
  });
  readerBridge = createReaderBridge({
    onSnapshot: (data) => mainWindow?.webContents.send('reader:table', data),
    onCommand: (command) => mainWindow?.webContents.send('reader:command', command),
  });
  ipcMain.on('reader:panel', (event, data) => {
    if (
      trusted(event) &&
      event.sender === mainWindow?.webContents &&
      data &&
      JSON.stringify(data).length < 60000
    )
      readerBridge.setPanel(data);
  });
  ipcMain.handle('reader:reset-session', (event) => {
    if (trusted(event) && [mainWindow?.webContents, hudWindow?.webContents].includes(event.sender))
      mainWindow?.webContents.send('reader:command', 'reset-session');
  });
  ipcMain.handle('reader:stop-auto', (event) => {
    if (trusted(event) && [mainWindow?.webContents, hudWindow?.webContents].includes(event.sender))
      readerBridge.stopAuto();
  });
  ipcMain.handle('reader:status', (event) =>
    trusted(event) && event.sender === mainWindow?.webContents
      ? { ...readerBridge.status(), token: undefined }
      : null,
  );
  ipcMain.handle('reader:table', (event) =>
    trusted(event) && event.sender === mainWindow?.webContents ? readerBridge.latest() : null,
  );
  ipcMain.handle('reader:copy', (event) => {
    if (trusted(event) && event.sender === mainWindow?.webContents)
      clipboard.writeText(readerBridge.status().token);
  });
  ipcMain.handle('reader:reset', (event) => {
    if (trusted(event) && event.sender === mainWindow?.webContents) readerBridge.rotate();
  });
  ipcMain.handle('reader:folder', async (event) => {
    if (trusted(event) && event.sender === mainWindow?.webContents) {
      const result = await shell.openPath(
        app.isPackaged
          ? path.join(process.resourcesPath, 'browser-extension')
          : path.resolve(__dirname, '../browser-extension'),
      );
      if (result) throw new Error(result);
    }
  });
  ipcMain.on('reader:decision', (event, data) => {
    if (
      trusted(event) &&
      event.sender === mainWindow?.webContents &&
      (!data || JSON.stringify(data).length < 20000)
    )
      readerBridge.setDecision(data);
  });
  const root = path.resolve(__dirname, '../dist');
  protocol.handle('river', (request) => {
    const url = new URL(request.url);
    if (url.host !== 'app') return new Response('Forbidden', { status: 403 });
    let relative;
    try {
      relative = decodeURIComponent(url.pathname);
    } catch {
      return new Response('Bad request', { status: 400 });
    }
    const resolved = path.resolve(root, `.${relative === '/' ? '/index.html' : relative}`);
    if (!resolved.startsWith(root + path.sep)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(resolved).toString());
  });
  ipcMain.handle('hud:show', (event) => {
    if (trusted(event) && event.sender === mainWindow?.webContents) showHUD();
  });
  ipcMain.handle('hud:read', (event) => (trusted(event) ? hudData : null));
  ipcMain.on('hud:hide', (event) => {
    if (trusted(event) && event.sender === hudWindow?.webContents) hudWindow.close();
  });
  ipcMain.on('hud:publish', (event, data) => {
    if (
      !trusted(event) ||
      event.sender !== mainWindow?.webContents ||
      !data ||
      JSON.stringify(data).length > 20000
    )
      return;
    hudData = data;
    hudWindow?.webContents.send('hud:update', data);
  });
  ipcMain.on('hud:opacity', (event, value) => {
    if (
      trusted(event) &&
      event.sender === hudWindow?.webContents &&
      typeof value === 'number' &&
      Number.isFinite(value)
    )
      hudWindow.setOpacity(Math.max(0.45, Math.min(1, value)));
  });
  const menu = [
    {
      label: 'River',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Stop browser automatic play',
          accelerator: 'CommandOrControl+Shift+S',
          click: () => readerBridge.stopAuto(),
        },
        { label: 'Floating HUD', accelerator: 'CommandOrControl+Shift+H', click: showHUD },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menu));
  app.setAboutPanelOptions({
    applicationName: 'River · Hold’em Studio',
    applicationVersion: app.getVersion(),
    copyright: 'Copyright 2026 kerol-dev and River contributors. Apache-2.0.',
  });
  createMain();
  app.on('activate', () => {
    if (!mainWindow) createMain();
    else mainWindow.show();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  quitting = true;
  readerBridge?.close();
});
