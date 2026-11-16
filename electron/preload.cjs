const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('t3rmes', {
  version: '0.0.1',
  transport: 'fake-hermes',
});
