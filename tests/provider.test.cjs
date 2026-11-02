const test = require('node:test');
const assert = require('node:assert/strict');
const { parseOpenAppCall } = require('../src/main/app-tools.cjs');
const { API_BASE_URL, requestAssistant } = require('../src/main/provider.cjs');

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  };
}

test('sends online chat requests from the main process and returns the assistant reply', async (context) => {
  let request;
  context.mock.method(globalThis, 'fetch', async (...args) => {
    request = args;
    return response({ choices: [{ message: { content: '你好！' } }] });
  });

  const result = await requestAssistant([{ role: 'user', content: '你好' }], {
    apiKey: 'test-key-never-written-to-disk',
    model: 'gpt-6.1-sol'
  });

  assert.deepEqual(result, { kind: 'message', text: '你好！' });
  assert.equal(API_BASE_URL, 'https://docode.cc/v1');
  assert.equal(request[0], 'https://docode.cc/v1/chat/completions');
  assert.equal(request[1].headers.authorization, 'Bearer test-key-never-written-to-disk');
  const body = JSON.parse(request[1].body);
  assert.equal(body.model, 'gpt-6.1-sol');
  assert.equal(body.messages[0].role, 'system');
  assert.deepEqual(body.messages.at(-1), { role: 'user', content: '你好' });
});

test('round-trips an application tool result through the online provider', async (context) => {
  const requests = [];
  context.mock.method(globalThis, 'fetch', async (_url, init) => {
    const body = JSON.parse(init.body);
    requests.push(body);
    if (requests.length === 1) {
      return response({ choices: [{ message: {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'call-1',
          type: 'function',
          function: { name: 'open_application', arguments: '{"app_id":"notepad"}' }
        }]
      } }] });
    }
    return response({ choices: [{ message: { content: '记事本已打开。' } }] });
  });

  const credentials = { apiKey: 'test-key', model: 'gpt-6.1-sol' };
  const initial = await requestAssistant([{ role: 'user', content: '打开记事本' }], credentials);
  assert.equal(initial.kind, 'tool_call');
  const toolCall = initial.message.tool_calls[0];
  assert.deepEqual(parseOpenAppCall(toolCall), { appId: 'notepad', appName: '记事本' });

  const completed = await requestAssistant([
    { role: 'user', content: '打开记事本' },
    initial.message,
    { role: 'tool', tool_call_id: toolCall.id, content: '{"ok":true,"app_id":"notepad"}' }
  ], credentials);

  assert.deepEqual(completed, { kind: 'message', text: '记事本已打开。' });
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1].messages.slice(-2), [
    initial.message,
    { role: 'tool', tool_call_id: 'call-1', content: '{"ok":true,"app_id":"notepad"}' }
  ]);
});

test('maps online authentication failures without returning secret response content', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => response({
    error: { message: 'sensitive provider response must not be shown' }
  }, 401));

  await assert.rejects(
    requestAssistant([{ role: 'user', content: 'hello' }], { apiKey: 'test-key', model: 'gpt-6.1-sol' }),
    (error) => error.message === '在线 AI 请求失败（HTTP 401），请检查 API Key。'
  );
});
