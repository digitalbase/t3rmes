const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, listener) {
  const handler = (_event, payload) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('t3rmes', {
  version: '0.0.1',
  connections: {
    list: () => ipcRenderer.invoke('hermes:connections:list'),
    health: () => ipcRenderer.invoke('hermes:connections:health'),
    select: (id) => ipcRenderer.invoke('hermes:connections:select', id),
    add: (input) => ipcRenderer.invoke('hermes:connections:add', input),
    update: (id, input) => ipcRenderer.invoke('hermes:connections:update', id, input),
    importFromHermesDesktop: () => ipcRenderer.invoke('hermes:connections:import'),
    remove: (id) => ipcRenderer.invoke('hermes:connections:remove', id),
    signIn: (id) => ipcRenderer.invoke('hermes:connections:sign-in', id),
    signOut: (id) => ipcRenderer.invoke('hermes:connections:sign-out', id),
  },
  request: (method, params) => ipcRenderer.invoke('hermes:request', method, params),
  sessions: {
    list: (options) => ipcRenderer.invoke('hermes:sessions:list', options),
    search: (query, profile) => ipcRenderer.invoke('hermes:sessions:search', query, profile),
    update: (id, patch, profile) => ipcRenderer.invoke('hermes:sessions:update', id, patch, profile),
    messages: (id, profile) => ipcRenderer.invoke('hermes:sessions:messages', id, profile),
  },
  readFileDataUrl: (path, sessionId) => ipcRenderer.invoke('hermes:fs:read-data-url', path, sessionId),
  showContextMenu: (items) => ipcRenderer.invoke('context-menu:show', items),
  omarchyTheme: {
    get: () => ipcRenderer.invoke('theme:omarchy:get'),
    onChange: (listener) => subscribe('theme:omarchy', listener),
  },
  onState: (listener) => subscribe('hermes:state', listener),
  onEvent: (listener) => subscribe('hermes:event', listener),
});
