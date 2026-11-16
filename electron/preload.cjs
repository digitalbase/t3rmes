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
    select: (id) => ipcRenderer.invoke('hermes:connections:select', id),
    add: (input) => ipcRenderer.invoke('hermes:connections:add', input),
    remove: (id) => ipcRenderer.invoke('hermes:connections:remove', id),
    signIn: (id) => ipcRenderer.invoke('hermes:connections:sign-in', id),
    signOut: (id) => ipcRenderer.invoke('hermes:connections:sign-out', id),
  },
  request: (method, params) => ipcRenderer.invoke('hermes:request', method, params),
  onState: (listener) => subscribe('hermes:state', listener),
  onEvent: (listener) => subscribe('hermes:event', listener),
});
