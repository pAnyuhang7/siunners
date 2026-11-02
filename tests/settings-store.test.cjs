const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSettingsStore } = require('../src/main/settings-store.cjs');

test('persists API credentials only in encrypted form and supports removal', (context) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'momo-settings-'));
  context.after(() => fs.rmSync(userData, { recursive: true, force: true }));

  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`encrypted:${value}`),
    decryptString: (value) => value.toString('utf8').replace(/^encrypted:/, '')
  };
  const store = createSettingsStore({ app: { getPath: () => userData }, safeStorage });
  const apiKey = 'sk-test-secret-value';

  assert.deepEqual(store.save({ apiKey, model: 'gpt-4o-mini' }), {
    model: 'gpt-4o-mini', apiKeyConfigured: true, secureStorageAvailable: true
  });
  assert.equal(fs.readFileSync(path.join(userData, 'settings.json'), 'utf8').includes(apiKey), false);
  assert.deepEqual(store.getCredentials(), { model: 'gpt-4o-mini', apiKey });
  assert.equal(store.clearApiKey().apiKeyConfigured, false);
});
