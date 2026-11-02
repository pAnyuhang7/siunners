const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_MODEL = 'gpt-6.1-sol';
const DEFAULT_BASE_URL = 'https://docode.cc/v1';

function normalizeBaseUrl(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_BASE_URL;
  if (typeof value !== 'string' || value.trim().length > 200) {
    throw new Error('API 请求地址无效。');
  }
  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error('API 请求地址格式无效。');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('API 请求地址必须以 http(s) 开头。');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('API 请求地址请填写不含账号密码和参数的接口根地址。');
  }
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
}

function normalizeVoiceModel(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new Error('语音模型名称格式无效。');
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!/^[A-Za-z0-9._/-]{1,120}$/.test(trimmed)) throw new Error('语音模型名称格式无效。');
  return trimmed;
}

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

  function storedBaseUrl(data) {
    try {
      return normalizeBaseUrl(data.baseUrl);
    } catch {
      return DEFAULT_BASE_URL;
    }
  }

  function storedVoiceBaseUrl(data) {
    if (typeof data.voiceBaseUrl === 'string' && data.voiceBaseUrl) {
      try {
        return normalizeBaseUrl(data.voiceBaseUrl);
      } catch {
        return storedBaseUrl(data);
      }
    }
    return storedBaseUrl(data);
  }

  function getPublicSettings() {
    const data = readRaw();
    return {
      model: typeof data.model === 'string' ? data.model : DEFAULT_MODEL,
      baseUrl: storedBaseUrl(data),
      voiceBaseUrl: storedVoiceBaseUrl(data),
      voiceTranscribeModel: typeof data.voiceTranscribeModel === 'string' ? data.voiceTranscribeModel : '',
      voiceSpeechModel: typeof data.voiceSpeechModel === 'string' ? data.voiceSpeechModel : '',
      voiceKeyConfigured: typeof data.voiceApiKeyEncrypted === 'string',
      apiKeyConfigured: typeof data.apiKeyEncrypted === 'string',
      secureStorageAvailable: safeStorage.isEncryptionAvailable()
    };
  }

  function writeSettings(next) {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(next), { encoding: 'utf8', mode: 0o600 });
  }

  function save({ apiKey, model, baseUrl, voiceBaseUrl, voiceApiKey, voiceTranscribeModel, voiceSpeechModel }) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Windows 凭据加密不可用，无法安全保存 API Key。');
    }
    if (typeof model !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/.test(model.trim())) {
      throw new Error('模型名称格式无效。');
    }
    const nextBaseUrl = normalizeBaseUrl(baseUrl === undefined ? readRaw().baseUrl : baseUrl);
    const current = readRaw();
    let nextVoiceBaseUrl;
    if (typeof voiceBaseUrl === 'string') {
      const trimmed = voiceBaseUrl.trim();
      nextVoiceBaseUrl = trimmed ? normalizeBaseUrl(trimmed) : '';
    } else {
      nextVoiceBaseUrl = typeof current.voiceBaseUrl === 'string' ? current.voiceBaseUrl : '';
    }
    const nextTranscribeModel = normalizeVoiceModel(voiceTranscribeModel);
    const nextSpeechModel = normalizeVoiceModel(voiceSpeechModel);

    const next = { model: model.trim(), baseUrl: nextBaseUrl, voiceBaseUrl: nextVoiceBaseUrl };
    next.voiceTranscribeModel = nextTranscribeModel === undefined
      ? (typeof current.voiceTranscribeModel === 'string' ? current.voiceTranscribeModel : '')
      : nextTranscribeModel;
    next.voiceSpeechModel = nextSpeechModel === undefined
      ? (typeof current.voiceSpeechModel === 'string' ? current.voiceSpeechModel : '')
      : nextSpeechModel;
    if (typeof apiKey === 'string' && apiKey.trim()) {
      next.apiKeyEncrypted = safeStorage.encryptString(apiKey.trim()).toString('base64');
    } else if (typeof current.apiKeyEncrypted === 'string') {
      next.apiKeyEncrypted = current.apiKeyEncrypted;
    }
    if (typeof voiceApiKey === 'string' && voiceApiKey.trim()) {
      next.voiceApiKeyEncrypted = safeStorage.encryptString(voiceApiKey.trim()).toString('base64');
    } else if (voiceApiKey === undefined && typeof current.voiceApiKeyEncrypted === 'string') {
      next.voiceApiKeyEncrypted = current.voiceApiKeyEncrypted;
    }

    writeSettings(next);
    return getPublicSettings();
  }

  function clearApiKey() {
    const data = readRaw();
    const next = {
      model: typeof data.model === 'string' ? data.model : DEFAULT_MODEL,
      baseUrl: storedBaseUrl(data),
      voiceBaseUrl: typeof data.voiceBaseUrl === 'string' ? data.voiceBaseUrl : '',
      voiceTranscribeModel: typeof data.voiceTranscribeModel === 'string' ? data.voiceTranscribeModel : '',
      voiceSpeechModel: typeof data.voiceSpeechModel === 'string' ? data.voiceSpeechModel : ''
    };
    writeSettings(next);
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
    const apiKey = safeStorage.decryptString(Buffer.from(data.apiKeyEncrypted, 'base64'));
    const voiceApiKey = typeof data.voiceApiKeyEncrypted === 'string'
      ? safeStorage.decryptString(Buffer.from(data.voiceApiKeyEncrypted, 'base64'))
      : apiKey;
    return {
      model: typeof data.model === 'string' ? data.model : DEFAULT_MODEL,
      baseUrl: storedBaseUrl(data),
      voiceBaseUrl: storedVoiceBaseUrl(data),
      voiceTranscribeModel: typeof data.voiceTranscribeModel === 'string' ? data.voiceTranscribeModel : '',
      voiceSpeechModel: typeof data.voiceSpeechModel === 'string' ? data.voiceSpeechModel : '',
      apiKey,
      voiceApiKey
    };
  }

  return { clearApiKey, getCredentials, getPublicSettings, save };
}

module.exports = { DEFAULT_BASE_URL, DEFAULT_MODEL, createSettingsStore };
