const { toolDefinition } = require('./app-tools.cjs');
const API_BASE_URL = 'https://docode.cc/v1';

const SYSTEM_MESSAGE = {
  role: 'system',
  content: '你是一个友好、简洁的中文桌面宠物。只有在用户明确要求时才请求打开应用。你只能通过 open_application 请求打开可用清单中的应用；不能声称已经执行，必须等待用户确认和工具结果。'
};

async function requestAssistant(messages, { apiKey, model, baseUrl }) {
  const root = typeof baseUrl === 'string' && baseUrl ? baseUrl.replace(/\/+$/, '') : API_BASE_URL;
  const response = await fetch(`${root}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [SYSTEM_MESSAGE, ...messages],
      tools: [toolDefinition()],
      tool_choice: 'auto',
      temperature: 0.7,
      max_tokens: 700
    }),
    signal: AbortSignal.timeout(45000)
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const reason = response.status === 401
      ? '请检查 API Key'
      : response.status === 429
        ? '服务限流或额度不足'
        : '请稍后重试';
    throw new Error(`在线 AI 请求失败（HTTP ${response.status}），${reason}。`);
  }

  const message = payload?.choices?.[0]?.message;
  if (!message) throw new Error('在线 AI 返回了无法识别的结果。');
  if (Array.isArray(message.tool_calls) && message.tool_calls.length) {
    if (message.tool_calls.length !== 1) throw new Error('一次只能确认一个应用操作。');
    return { kind: 'tool_call', message };
  }

  return {
    kind: 'message',
    text: typeof message.content === 'string' && message.content.trim()
      ? message.content.trim()
      : '我暂时没有生成文字回复。'
  };
}

module.exports = { API_BASE_URL, requestAssistant };
