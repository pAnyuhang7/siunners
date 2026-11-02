const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('momo', Object.freeze({
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (value) => ipcRenderer.invoke('settings:save', value),
  clearApiKey: () => ipcRenderer.invoke('settings:clear-key'),
  sendMessage: (messages) => ipcRenderer.invoke('assistant:send', messages),
  resolveAction: (requestId, approved) => ipcRenderer.invoke('assistant:resolve', requestId, approved),
  transcribeVoice: (audio) => ipcRenderer.invoke('voice:transcribe', audio),
  speak: (text) => ipcRenderer.invoke('voice:speak', text),
  hide: () => ipcRenderer.invoke('window:hide')
}));
