const MAX_MESSAGES = 24;
const MAX_MESSAGE_LENGTH = 6000;

function validateConversation(value) {
  if (!Array.isArray(value) || value.length > MAX_MESSAGES) {
    throw new Error('对话内容无效，请清空对话后重试。');
  }

  return value.map((message) => {
    if (!message || !['user', 'assistant'].includes(message.role)) {
      throw new Error('对话内容无效，请重新发送。');
    }
    if (typeof message.content !== 'string' || message.content.length > MAX_MESSAGE_LENGTH) {
      throw new Error('单条消息过长，请缩短后重试。');
    }
    return { role: message.role, content: message.content };
  });
}

module.exports = { MAX_MESSAGES, MAX_MESSAGE_LENGTH, validateConversation };
