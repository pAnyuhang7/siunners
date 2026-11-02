const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_MODEL = 'gpt-6.1-sol';

function createSettingsStore({ app, safeStorage }) {
  const settingsPath = path.join(app.getPath('userData'), 'settings.json');

  function readRaw() {
    try {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return {};
      throw new Error('设置文件无法读取。');
    }
  }

  function getPublicSettings() {
    const data = readRaw();
    return {
      model: typeof data.model === 'string' ? data.model : DEFAULT_MODEL,
      apiKeyConfigured: typeof data.apiKeyEncrypted === 'string',
      secureStorageAvailable: safeStorage.isEncryptionAvailable()
    };
  }

  function save({ apiKey, model }) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Windows 凭据加密不可用，无法安全保存 API Key。');
    }
    if (typeof model !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/.test(model.trim())) {
      throw new Error('模型名称格式无效。');
    }

    const current = readRaw();
    const next = { model: model.trim() };
    if (typeof apiKey === 'string' && apiKey.trim()) {
      next.apiKeyEncrypted = safeStorage.encryptString(apiKey.trim()).toString('base64');
    } else if (typeof current.apiKeyEncrypted === 'string') {
      next.apiKeyEncrypted = current.apiKeyEncrypted;
    }

    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(next), { encoding: 'utf8', mode: 0o600 });
    return getPublicSettings();
  }

  function clearApiKey() {
    const data = readRaw();
    const next = { model: typeof data.model === 'string' ? data.model : DEFAULT_MODEL };
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(next), { encoding: 'utf8', mode: 0o600 });
    return getPublicSettings();
  }

  function getCredentials() {
    const data = readRaw();
    if (typeof data.apiKeyEncrypted !== 'string') {
      throw new Error('请先在设置中填写 API Key。');
    }
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Windows 凭据加密不可用。');
    }
    return {
      model: typeof data.model === 'string' ? data.model : DEFAULT_MODEL,
      apiKey: safeStorage.decryptString(Buffer.from(data.apiKeyEncrypted, 'base64'))
    };
  }

  return { clearApiKey, getCredentials, getPublicSettings, save };
}

module.exports = { DEFAULT_MODEL, createSettingsStore };
