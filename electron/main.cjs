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
  nativeTheme,
  nativeImage,
  Tray,
} = require('electron');
const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';
// One River per computer: the browser connection uses a fixed local port.
if (!app.requestSingleInstanceLock()) app.exit(0);
app.on('second-instance', () => showMain());
if (isWindows) app.setAppUserModelId('studio.river.holdem');
let tray = null;
const windowBackground = () => (nativeTheme.shouldUseDarkColors ? '#0f1215' : '#f3f5f8');
const appIcon = () =>
  nativeImage.createFromPath(
    path.join(
      app.isPackaged ? process.resourcesPath : path.resolve(__dirname, '../public'),
      'icon-256.png',
    ),
  );
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
    backgroundColor: windowBackground(),
    // macOS keeps the traffic lights inset; Windows 11 draws its own caption buttons over the
    // app's top bar, coloured to match the theme.
    ...(isMac
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 14 } }
      : {
          titleBarStyle: 'hidden',
          titleBarOverlay: {
            color: windowBackground(),
            symbolColor: nativeTheme.shouldUseDarkColors ? '#e9eef3' : '#0f1720',
            height: 48,
          },
          icon: appIcon(),
        }),
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
function showMain() {
  if (!mainWindow) createMain();
  else {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
}
// Windows has no Dock: closing the window keeps River in the notification area, like macOS.
function createTray() {
  if (!isWindows || tray) return;
  tray = new Tray(appIcon().resize({ width: 16, height: 16 }));
  tray.setToolTip('River · Hold’em Studio');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open River', click: showMain },
      { label: 'Floating HUD', click: showHUD },
      { type: 'separator' },
      {
        label: 'Quit River',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on('click', showMain);
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
    backgroundColor: windowBackground(),
    opacity: 0.98,
    skipTaskbar: isWindows,
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
    nativeImage,
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
    isMac
      ? {
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
        }
      : {
          label: 'File',
          submenu: [
            {
              label: 'Quit River',
              accelerator: 'Ctrl+Q',
              click: () => {
                quitting = true;
                app.quit();
              },
            },
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
    ...(isMac ? [{ role: 'windowMenu' }] : []),
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menu));
  app.setAboutPanelOptions({
    applicationName: 'River · Hold’em Studio',
    applicationVersion: app.getVersion(),
    copyright: 'Copyright 2026 kerol-dev and River contributors. Apache-2.0.',
  });
  createMain();
  createTray();
  // Keep the Windows caption buttons in step with light and dark mode.
  nativeTheme.on('updated', () => {
    if (isWindows && mainWindow)
      mainWindow.setTitleBarOverlay({
        color: windowBackground(),
        symbolColor: nativeTheme.shouldUseDarkColors ? '#e9eef3' : '#0f1720',
      });
  });
  app.on('activate', () => {
    if (!mainWindow) createMain();
    else mainWindow.show();
  });
});
// River keeps running in the background (Dock on macOS, notification area on Windows).
app.on('window-all-closed', () => {
  if (!isMac && !isWindows) app.quit();
});

app.on('before-quit', () => {
  quitting = true;
  readerBridge?.close();
});
