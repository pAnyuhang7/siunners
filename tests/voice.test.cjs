const test = require('node:test');
const assert = require('node:assert/strict');
const { MAX_AUDIO_BYTES, MAX_SPEECH_CHARS, synthesizeSpeech, transcribeAudio } = require('../src/main/voice.cjs');

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  };
}

test('transcribes recorded audio through the online provider', async (context) => {
  let request;
  context.mock.method(globalThis, 'fetch', async (...args) => {
    request = args;
    return jsonResponse({ text: '  打开记事本  ' });
  });

  const result = await transcribeAudio(new Uint8Array([1, 2, 3]), { apiKey: 'test-key-never-written-to-disk' });

  assert.equal(result.text, '打开记事本');
  assert.equal(request[0], 'https://docode.cc/v1/audio/transcriptions');
  assert.equal(request[1].headers.authorization, 'Bearer test-key-never-written-to-disk');
  assert.ok(request[1].body instanceof FormData);
  assert.equal(request[1].body.get('model'), 'whisper-1');
  const file = request[1].body.get('file');
  assert.ok(file instanceof Blob);
  assert.equal(file.type, 'audio/webm');
});

test('rejects invalid recordings before any network request', async (context) => {
  let calls = 0;
  context.mock.method(globalThis, 'fetch', async () => { calls += 1; return jsonResponse({ text: 'x' }); });

  await assert.rejects(
    transcribeAudio(new Uint8Array(0), { apiKey: 'test-key' }),
    (error) => error.message === '没有录到声音，请再试一次。'
  );
  await assert.rejects(
    transcribeAudio(new Uint8Array(MAX_AUDIO_BYTES + 1), { apiKey: 'test-key' }),
    (error) => error.message === '录音太长，请缩短后重试。'
  );
  await assert.rejects(
    transcribeAudio('not-a-buffer', { apiKey: 'test-key' }),
    (error) => error.message === '没有录到声音，请再试一次。'
  );
  assert.equal(calls, 0);
});

test('maps transcription failures without returning secret response content', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => jsonResponse({
    error: { message: 'sensitive provider response must not be shown' }
  }, 401));

  await assert.rejects(
    transcribeAudio(new Uint8Array([1]), { apiKey: 'test-key' }),
    (error) => error.message === '语音识别失败（HTTP 401），请检查 API Key。'
  );
});

test('rejects transcriptions that contain no speech', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => jsonResponse({ text: '   ' }));

  await assert.rejects(
    transcribeAudio(new Uint8Array([1]), { apiKey: 'test-key' }),
    (error) => error.message === '没有识别到语音内容，请靠近麦克风再试。'
  );
});

test('surfaces wrapped provider errors from transcriptions', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => jsonResponse({
    code: 500, msg: '404 NOT_FOUND', success: false, error: { message: '模型不存在' }
  }));

  await assert.rejects(
    transcribeAudio(new Uint8Array([1]), { apiKey: 'test-key' }),
    (error) => error.message.includes('模型不存在') && error.message.includes('OpenAI 兼容 /audio/transcriptions')
  );
});

test('synthesizes speech audio for assistant replies', async (context) => {
  let request;
  const bytes = Uint8Array.from([9, 8, 7]);
  context.mock.method(globalThis, 'fetch', async (...args) => {
    request = args;
    return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer };
  });

  const result = await synthesizeSpeech('记事本已打开。', { apiKey: 'test-key-never-written-to-disk' });

  assert.equal(result.mimeType, 'audio/mpeg');
  assert.deepEqual(Array.from(result.audio), [9, 8, 7]);
  assert.equal(request[0], 'https://docode.cc/v1/audio/speech');
  assert.equal(request[1].headers.authorization, 'Bearer test-key-never-written-to-disk');
  const body = JSON.parse(request[1].body);
  assert.deepEqual(body, { model: 'tts-1', input: '记事本已打开。', voice: 'alloy', response_format: 'mp3' });
});

test('truncates speech synthesis input to the allowed length', async (context) => {
  let request;
  context.mock.method(globalThis, 'fetch', async (...args) => {
    request = args;
    return { ok: true, status: 200, arrayBuffer: async () => Uint8Array.from([1]).buffer };
  });

  await synthesizeSpeech('播'.repeat(MAX_SPEECH_CHARS + 500), { apiKey: 'test-key' });
  assert.equal(JSON.parse(request[1].body).input.length, MAX_SPEECH_CHARS);
});

test('maps speech synthesis failures without returning secret response content', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 500, arrayBuffer: async () => new ArrayBuffer(0) }));

  await assert.rejects(
    synthesizeSpeech('你好', { apiKey: 'test-key' }),
    (error) => error.message === '语音播报失败（HTTP 500），请稍后重试。'
  );
});

test('rejects empty speech audio', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) }));

  await assert.rejects(
    synthesizeSpeech('你好', { apiKey: 'test-key' }),
    (error) => error.message === '语音播报返回了空音频。'
  );
});

test('sends voice requests to a custom endpoint when configured', async (context) => {
  const urls = [];
  context.mock.method(globalThis, 'fetch', async (url) => {
    urls.push(String(url));
    if (String(url).endsWith('/audio/transcriptions')) return jsonResponse({ text: '你好' });
    return { ok: true, status: 200, arrayBuffer: async () => Uint8Array.from([1]).buffer };
  });

  const credentials = { apiKey: 'test-key', baseUrl: 'http://127.0.0.1:8000/v1' };
  await transcribeAudio(new Uint8Array([1]), credentials);
  await synthesizeSpeech('你好', credentials);
  assert.deepEqual(urls, [
    'http://127.0.0.1:8000/v1/audio/transcriptions',
    'http://127.0.0.1:8000/v1/audio/speech'
  ]);
});

test('prefers the dedicated voice endpoint over the chat endpoint', async (context) => {
  const requests = [];
  context.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push({ url: String(url), authorization: init.headers.authorization });
    if (String(url).endsWith('/audio/transcriptions')) return jsonResponse({ text: '你好' });
    return { ok: true, status: 200, arrayBuffer: async () => Uint8Array.from([1]).buffer };
  });

  const credentials = {
    apiKey: 'chat-key',
    voiceApiKey: 'voice-key',
    baseUrl: 'https://chat.example.com/v1',
    voiceBaseUrl: 'https://voice.example.com/v1'
  };
  await transcribeAudio(new Uint8Array([1]), credentials);
  await synthesizeSpeech('你好', credentials);
  assert.equal(requests[0].url, 'https://voice.example.com/v1/audio/transcriptions');
  assert.equal(requests[0].authorization, 'Bearer voice-key');
  assert.equal(requests[1].authorization, 'Bearer voice-key');
});

test('falls back to the chat key when no voice key is configured', async (context) => {
  let authorization;
  context.mock.method(globalThis, 'fetch', async (_url, init) => {
    authorization = init.headers.authorization;
    return jsonResponse({ text: '你好' });
  });

  await transcribeAudio(new Uint8Array([1]), { apiKey: 'chat-key' });
  assert.equal(authorization, 'Bearer chat-key');
});

test('uses the configured voice model names when provided', async (context) => {
  let transcribeForm;
  let speechBody;
  context.mock.method(globalThis, 'fetch', async (_url, init) => {
    if (String(init.body) === '[object FormData]' || init.body instanceof FormData) {
      transcribeForm = init.body;
      return jsonResponse({ text: '你好' });
    }
    speechBody = JSON.parse(init.body);
    return { ok: true, status: 200, arrayBuffer: async () => Uint8Array.from([1]).buffer };
  });

  const credentials = {
    apiKey: 'test-key',
    voiceTranscribeModel: 'FunAudioLLM/SenseVoiceSmall',
    voiceSpeechModel: 'FunAudioLLM/CosyVoice2-0.5B',
    voiceSpeechVoice: 'FunAudioLLM/CosyVoice2-0.5B:alex'
  };
  await transcribeAudio(new Uint8Array([1]), credentials);
  await synthesizeSpeech('你好', credentials);
  assert.equal(transcribeForm.get('model'), 'FunAudioLLM/SenseVoiceSmall');
  assert.equal(speechBody.model, 'FunAudioLLM/CosyVoice2-0.5B');
  assert.equal(speechBody.voice, 'FunAudioLLM/CosyVoice2-0.5B:alex');
});

test('reports a missing voice endpoint clearly', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 404, json: async () => ({}) }));

  await assert.rejects(
    transcribeAudio(new Uint8Array([1]), { apiKey: 'test-key' }),
    (error) => error.message === '语音识别失败（HTTP 404），该服务没有这个语音接口，请确认语音地址支持 OpenAI 兼容 /audio 接口。'
  );
});

test('surfaces plain wrapped error fields from transcriptions', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => jsonResponse({
    code: 500, msg: '404 NOT_FOUND', success: false
  }));

  await assert.rejects(
    transcribeAudio(new Uint8Array([1]), { apiKey: 'test-key' }),
    (error) => error.message.includes('404 NOT_FOUND') && error.message.includes('/audio/transcriptions')
  );
});
