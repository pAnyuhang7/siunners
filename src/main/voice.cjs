const { API_BASE_URL } = require('./provider.cjs');
const { MAX_MESSAGE_LENGTH } = require('./conversation.cjs');

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const MAX_SPEECH_CHARS = 4000;
const TRANSCRIBE_MODEL = 'whisper-1';
const SPEECH_MODEL = 'tts-1';
const SPEECH_VOICE = 'alloy';

function describeHttpFailure(status) {
  if (status === 401) return '请检查 API Key';
  if (status === 429) return '服务限流或额度不足';
  if (status === 404) return '该服务没有这个语音接口，请确认语音地址支持 OpenAI 兼容 /audio 接口';
  return '请稍后重试';
}

function resolveRoot(baseUrl, voiceBaseUrl) {
  if (typeof voiceBaseUrl === 'string' && voiceBaseUrl) return voiceBaseUrl.replace(/\/+$/, '');
  return typeof baseUrl === 'string' && baseUrl ? baseUrl.replace(/\/+$/, '') : API_BASE_URL;
}

function wrappedErrorDetail(payload) {
  const candidates = [payload?.error?.message, payload?.msg, payload?.message];
  const detail = candidates.find((value) => typeof value === 'string' && value.trim());
  return detail ? detail.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
}

async function transcribeAudio(audio, { apiKey, voiceApiKey, baseUrl, voiceBaseUrl, voiceTranscribeModel }) {
  if (!(audio instanceof Uint8Array) || audio.length === 0) {
    throw new Error('没有录到声音，请再试一次。');
  }
  if (audio.length > MAX_AUDIO_BYTES) {
    throw new Error('录音太长，请缩短后重试。');
  }

  const form = new FormData();
  form.append('file', new Blob([audio], { type: 'audio/webm' }), 'speech.webm');
  form.append('model', voiceTranscribeModel || TRANSCRIBE_MODEL);

  const response = await fetch(`${resolveRoot(baseUrl, voiceBaseUrl)}/audio/transcriptions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${voiceApiKey || apiKey}` },
    body: form,
    signal: AbortSignal.timeout(60_000)
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`语音识别失败（HTTP ${response.status}），${describeHttpFailure(response.status)}。`);
  }

  const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
  if (!text) {
    const detail = wrappedErrorDetail(payload);
    if (detail) throw new Error(`语音识别返回了无法识别的结果：${detail}。请确认语音地址支持 OpenAI 兼容 /audio/transcriptions 接口。`);
    if (!payload) throw new Error('语音服务返回了无法解析的内容，请确认该地址支持语音识别接口。');
    throw new Error('没有识别到语音内容，请靠近麦克风再试。');
  }
  if (text.length > MAX_MESSAGE_LENGTH) throw new Error('识别结果过长，请缩短录音时长。');
  return { text };
}

async function synthesizeSpeech(text, { apiKey, voiceApiKey, baseUrl, voiceBaseUrl, voiceSpeechModel }) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('没有需要播报的内容。');
  }

  const response = await fetch(`${resolveRoot(baseUrl, voiceBaseUrl)}/audio/speech`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${voiceApiKey || apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: voiceSpeechModel || SPEECH_MODEL,
      input: text.trim().slice(0, MAX_SPEECH_CHARS),
      voice: SPEECH_VOICE,
      response_format: 'mp3'
    }),
    signal: AbortSignal.timeout(60_000)
  });

  if (!response.ok) {
    throw new Error(`语音播报失败（HTTP ${response.status}），${describeHttpFailure(response.status)}。`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  if (!audio.length) throw new Error('语音播报返回了空音频。');
  if (audio.length > MAX_AUDIO_BYTES) throw new Error('语音播报返回的音频过大。');
  return { audio, mimeType: 'audio/mpeg' };
}

module.exports = { MAX_AUDIO_BYTES, MAX_SPEECH_CHARS, synthesizeSpeech, transcribeAudio };
