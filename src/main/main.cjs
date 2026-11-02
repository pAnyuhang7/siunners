const { app, BrowserWindow, ipcMain, Menu, nativeImage, safeStorage, screen, session, Tray } = require('electron');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { APP_CATALOG, launchAllowedApp, parseOpenAppCall } = require('./app-tools.cjs');
const { validateConversation } = require('./conversation.cjs');
const { requestAssistant } = require('./provider.cjs');
const { createSettingsStore } = require('./settings-store.cjs');
const { synthesizeSpeech, transcribeAudio } = require('./voice.cjs');

let petWindow;
let chatWindow;
let tray;
let isQuitting = false;
const trustedUrls = new Set();
const pendingActions = new Map();
const settingsStore = createSettingsStore({ app, safeStorage });

function rendererPageUrl(page) {
  if (!app.isPackaged) {
    return page === 'index.html' ? 'http://127.0.0.1:5173/' : `http://127.0.0.1:5173/${page}`;
  }
  return pathToFileURL(path.join(__dirname, '..', 'dist', page)).href;
}

function hardenWebContents(contents, pageUrl) {
  trustedUrls.add(pageUrl);
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, target) => {
    if (target !== pageUrl) event.preventDefault();
  });
}

function isTrustedContents(contents) {
  return contents === petWindow?.webContents || contents === chatWindow?.webContents;
}

function sharedWebPreferences() {
  return {
    preload: path.join(__dirname, 'preload.cjs'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true
  };
}

function createPetWindow() {
  const pageUrl = rendererPageUrl('pet.html');
  const workArea = screen.getPrimaryDisplay().workArea;
  const width = 212;
  const height = 236;
  petWindow = new BrowserWindow({
    width,
    height,
    x: workArea.x + workArea.width - width - 28,
    y: workArea.y + workArea.height - height - 10,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: sharedWebPreferences()
  });
  hardenWebContents(petWindow.webContents, pageUrl);
  petWindow.setIgnoreMouseEvents(true, { forward: true });
  petWindow.once('ready-to-show', () => petWindow.show());
  petWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      petWindow.hide();
    }
  });
  if (app.isPackaged) petWindow.loadFile(path.join(__dirname, '..', 'dist', 'pet.html'));
  else petWindow.loadURL(pageUrl);
}

function createChatWindow() {
  const pageUrl = rendererPageUrl('index.html');
  chatWindow = new BrowserWindow({
    width: 420,
    height: 720,
    minWidth: 380,
    minHeight: 600,
    show: false,
    frame: false,
    transparent: true,
    resizable: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: sharedWebPreferences()
  });
  hardenWebContents(chatWindow.webContents, pageUrl);
  chatWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      chatWindow.hide();
    }
  });
  if (app.isPackaged) chatWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  else chatWindow.loadURL(pageUrl);
}

function positionChatNearPet() {
  if (!chatWindow || !petWindow) return;
  const petBounds = petWindow.getBounds();
  const chatBounds = chatWindow.getBounds();
  const display = screen.getDisplayNearestPoint({ x: petBounds.x, y: petBounds.y }).workArea;
  let x = petBounds.x + petBounds.width + 12;
  if (x + chatBounds.width > display.x + display.width) x = petBounds.x - chatBounds.width - 12;
  x = Math.min(Math.max(x, display.x), display.x + display.width - chatBounds.width);
  const y = Math.min(Math.max(petBounds.y - 40, display.y), display.y + display.height - chatBounds.height);
  chatWindow.setPosition(Math.round(x), Math.round(y));
}

function createTray() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect x="5" y="5" width="54" height="54" rx="18" fill="#40b6a1"/><circle cx="24" cy="29" r="3" fill="#183a38"/><circle cx="40" cy="29" r="3" fill="#183a38"/><path d="M24 39c4 5 12 5 16 0" fill="none" stroke="#183a38" stroke-linecap="round" stroke-width="3"/></svg>';
  tray = new Tray(nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`));
  tray.setToolTip('Momo 桌宠');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示 Momo', click: () => { petWindow?.show(); chatWindow?.show(); } },
    { label: '退出', click: () => { isQuitting = true; app.quit(); } }
  ]));
  tray.on('double-click', () => { petWindow?.show(); chatWindow?.show(); });
}

function assertTrustedSender(event) {
  const url = event.senderFrame?.url;
  const trusted = (event.sender === petWindow?.webContents || event.sender === chatWindow?.webContents)
    && event.senderFrame === event.sender.mainFrame
    && typeof url === 'string'
    && trustedUrls.has(url);
  if (!trusted) throw new Error('调用来源无效。');
}

function assertPetSender(event) {
  assertTrustedSender(event);
  if (event.sender !== petWindow?.webContents) throw new Error('调用来源无效。');
}

ipcMain.handle('settings:get', (event) => { assertTrustedSender(event); return settingsStore.getPublicSettings(); });
ipcMain.handle('settings:save', (event, value) => {
  assertTrustedSender(event);
  if (!value || typeof value !== 'object') throw new Error('设置内容无效。');
  return settingsStore.save({ apiKey: value.apiKey, model: value.model, baseUrl: value.baseUrl });
});
ipcMain.handle('settings:clear-key', (event) => { assertTrustedSender(event); return settingsStore.clearApiKey(); });
ipcMain.handle('window:hide', (event) => {
  assertTrustedSender(event);
  const target = event.sender === chatWindow?.webContents ? chatWindow : petWindow;
  target?.hide();
});
ipcMain.handle('chat:toggle', (event) => {
  assertPetSender(event);
  if (!chatWindow) return false;
  if (chatWindow.isVisible()) {
    chatWindow.hide();
    return false;
  }
  positionChatNearPet();
  chatWindow.show();
  return true;
});
ipcMain.handle('window:set-click-through', (event, ignore) => {
  assertPetSender(event);
  if (typeof ignore !== 'boolean') throw new Error('点击穿透参数无效。');
  petWindow?.setIgnoreMouseEvents(ignore, { forward: true });
});
ipcMain.handle('voice:transcribe', async (event, audio) => {
  assertTrustedSender(event);
  const credentials = settingsStore.getCredentials();
  return transcribeAudio(audio, credentials);
});
ipcMain.handle('voice:speak', async (event, text) => {
  assertTrustedSender(event);
  const credentials = settingsStore.getCredentials();
  return synthesizeSpeech(text, credentials);
});
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
  app.on('second-instance', () => { petWindow?.show(); chatWindow?.show(); });
  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => {
      callback(permission === 'media' && isTrustedContents(contents));
    });
    session.defaultSession.setPermissionCheckHandler((contents, permission) =>
      permission === 'media' && isTrustedContents(contents));
    createPetWindow();
    createChatWindow();
    createTray();
  });
  app.on('before-quit', () => { isQuitting = true; });
  app.on('activate', () => { petWindow?.show(); chatWindow?.show(); });
}
