const { app, BrowserWindow, ipcMain, Menu, nativeImage, safeStorage, Tray } = require('electron');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { APP_CATALOG, launchAllowedApp, parseOpenAppCall } = require('./app-tools.cjs');
const { validateConversation } = require('./conversation.cjs');
const { requestAssistant } = require('./provider.cjs');
const { createSettingsStore } = require('./settings-store.cjs');

let mainWindow;
let tray;
let isQuitting = false;
let trustedPageUrl;
const pendingActions = new Map();
const settingsStore = createSettingsStore({ app, safeStorage });

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 720,
    minWidth: 380,
    minHeight: 600,
    show: false,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  trustedPageUrl = app.isPackaged
    ? pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).href
    : 'http://127.0.0.1:5173/';
  mainWindow.webContents.on('will-navigate', (event, target) => {
    if (target !== trustedPageUrl) event.preventDefault();
  });
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  } else {
    mainWindow.loadURL('http://127.0.0.1:5173');
  }
}

function createTray() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect x="5" y="5" width="54" height="54" rx="18" fill="#40b6a1"/><circle cx="24" cy="29" r="3" fill="#183a38"/><circle cx="40" cy="29" r="3" fill="#183a38"/><path d="M24 39c4 5 12 5 16 0" fill="none" stroke="#183a38" stroke-linecap="round" stroke-width="3"/></svg>';
  tray = new Tray(nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`));
  tray.setToolTip('Momo 桌宠');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示 Momo', click: () => mainWindow?.show() },
    { label: '退出', click: () => { isQuitting = true; app.quit(); } }
  ]));
  tray.on('double-click', () => mainWindow?.show());
}

function assertTrustedSender(event) {
  if (event.sender !== mainWindow?.webContents || event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== trustedPageUrl) {
    throw new Error('调用来源无效。');
  }
}

ipcMain.handle('settings:get', (event) => { assertTrustedSender(event); return settingsStore.getPublicSettings(); });
ipcMain.handle('settings:save', (event, value) => {
  assertTrustedSender(event);
  if (!value || typeof value !== 'object') throw new Error('设置内容无效。');
  return settingsStore.save({ apiKey: value.apiKey, model: value.model });
});
ipcMain.handle('settings:clear-key', (event) => { assertTrustedSender(event); return settingsStore.clearApiKey(); });
ipcMain.handle('window:hide', (event) => { assertTrustedSender(event); return mainWindow?.hide(); });
ipcMain.handle('assistant:send', async (event, rawMessages) => {
  assertTrustedSender(event);
  const messages = validateConversation(rawMessages);
  const credentials = settingsStore.getCredentials();
  const reply = await requestAssistant(messages, credentials);
  if (reply.kind === 'message') return reply;

  const toolCall = reply.message.tool_calls[0];
  if (typeof toolCall?.id !== 'string' || toolCall.id.length > 200) throw new Error('在线 AI 返回的操作编号无效。');
  const requested = parseOpenAppCall(toolCall);
  const requestId = randomUUID();
  pendingActions.set(requestId, {
    messages,
    credentials,
    assistantMessage: reply.message,
    toolCallId: toolCall.id,
    ...requested
  });
  setTimeout(() => pendingActions.delete(requestId), 90_000).unref();
  return {
    kind: 'confirmation',
    requestId,
    appId: requested.appId,
    appName: requested.appName,
    text: typeof reply.message.content === 'string' ? reply.message.content : ''
  };
});
ipcMain.handle('assistant:resolve', async (event, requestId, approved) => {
  assertTrustedSender(event);
  if (typeof requestId !== 'string' || typeof approved !== 'boolean') throw new Error('操作确认信息无效。');
  const pending = pendingActions.get(requestId);
  pendingActions.delete(requestId);
  if (!pending) throw new Error('这项操作已过期，请重新提出请求。');
  if (!approved) return { kind: 'message', text: '好的，我没有打开应用。' };

  let toolResult;
  try {
    const opened = await launchAllowedApp(pending.appId);
    toolResult = { ok: true, app_id: opened.appId, app_name: opened.appName };
  } catch (error) {
    toolResult = { ok: false, error: error.code || 'launch_failed' };
  }

  const messages = [
    ...pending.messages,
    pending.assistantMessage,
    { role: 'tool', tool_call_id: pending.toolCallId, content: JSON.stringify(toolResult) }
  ];
  const reply = await requestAssistant(messages, pending.credentials);
  if (reply.kind === 'tool_call') {
    return { kind: 'message', text: '这次操作已处理。若还需要打开其他应用，请再告诉我应用名称。' };
  }
  return reply;
});

app.setAppUserModelId('com.momo.desktop-pet');
const hasSingleInstance = app.requestSingleInstanceLock();
if (!hasSingleInstance) {
  app.quit();
} else {
  app.on('second-instance', () => mainWindow?.show());
  app.whenReady().then(() => {
    createWindow();
    createTray();
  });
  app.on('before-quit', () => { isQuitting = true; });
  app.on('activate', () => mainWindow?.show());
}

