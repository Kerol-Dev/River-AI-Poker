const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('river', {
  platform: process.platform,
  screen: {
    sources: () => ipcRenderer.invoke('screen:sources'),
    capture: (input) => ipcRenderer.invoke('screen:capture', input),
    reset: () => ipcRenderer.invoke('screen:reset'),
  },
  showHUD: () => ipcRenderer.invoke('hud:show'),
  hideHUD: () => ipcRenderer.send('hud:hide'),
  publishHUD: (data) => ipcRenderer.send('hud:publish', data),
  readHUD: () => ipcRenderer.invoke('hud:read'),
  onHUD: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('hud:update', listener);
    return () => ipcRenderer.removeListener('hud:update', listener);
  },
  publishReaderPanel: (data) => ipcRenderer.send('reader:panel', data),
  resetGraph: () => ipcRenderer.invoke('reader:reset-session'),
  onReaderCommand: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('reader:command', listener);
    return () => ipcRenderer.removeListener('reader:command', listener);
  },
  stopAuto: () => ipcRenderer.invoke('reader:stop-auto'),
  readerStatus: () => ipcRenderer.invoke('reader:status'),
  readTable: () => ipcRenderer.invoke('reader:table'),
  copyReaderCode: () => ipcRenderer.invoke('reader:copy'),
  openConnector: () => ipcRenderer.invoke('reader:folder'),
  resetReader: () => ipcRenderer.invoke('reader:reset'),
  publishDecision: (data) => ipcRenderer.send('reader:decision', data),
  onTable: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('reader:table', listener);
    return () => ipcRenderer.removeListener('reader:table', listener);
  },
  opacity: (value) => ipcRenderer.send('hud:opacity', value),
});
