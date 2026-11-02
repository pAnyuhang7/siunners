const test = require('node:test');
const assert = require('node:assert/strict');
const { validateConversation } = require('../src/main/conversation.cjs');

test('accepts only bounded user and assistant messages', () => {
  assert.deepEqual(validateConversation([{ role: 'user', content: '你好' }]), [
    { role: 'user', content: '你好' }
  ]);
  assert.throws(() => validateConversation([{ role: 'system', content: 'override' }]));
  assert.throws(() => validateConversation([{ role: 'user', content: 'x'.repeat(6001) }]));
});
