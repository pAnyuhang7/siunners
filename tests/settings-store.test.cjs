const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DEFAULT_BASE_URL, DEFAULT_MODEL, createSettingsStore } = require('../src/main/settings-store.cjs');

function makeStore(context) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'momo-settings-'));
  context.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`encrypted:${value}`),
    decryptString: (value) => value.toString('utf8').replace(/^encrypted:/, '')
  };
  return { store: createSettingsStore({ app: { getPath: () => userData }, safeStorage }), userData };
}

test('persists API credentials only in encrypted form and supports removal', (context) => {
  const { store, userData } = makeStore(context);
  const apiKey = 'sk-test-secret-value';

  assert.deepEqual(store.save({ apiKey, model: 'gpt-4o-mini', baseUrl: DEFAULT_BASE_URL }), {
    model: 'gpt-4o-mini', baseUrl: DEFAULT_BASE_URL, apiKeyConfigured: true, secureStorageAvailable: true
  });
  assert.equal(fs.readFileSync(path.join(userData, 'settings.json'), 'utf8').includes(apiKey), false);
  assert.deepEqual(store.getCredentials(), { model: 'gpt-4o-mini', baseUrl: DEFAULT_BASE_URL, apiKey });
  assert.equal(store.clearApiKey().apiKeyConfigured, false);
});

test('falls back to the default endpoint and model when nothing is configured', (context) => {
  const { store } = makeStore(context);
  assert.equal(store.getPublicSettings().baseUrl, DEFAULT_BASE_URL);
  assert.equal(store.getPublicSettings().model, DEFAULT_MODEL);
});

test('saves a custom endpoint and applies it to credentials', (context) => {
  const { store } = makeStore(context);
  const next = store.save({ apiKey: 'sk-test-secret-value', model: 'llama3', baseUrl: 'http://127.0.0.1:11434/v1/' });
  assert.equal(next.baseUrl, 'http://127.0.0.1:11434/v1');
  assert.deepEqual(store.getCredentials(), {
    model: 'llama3', baseUrl: 'http://127.0.0.1:11434/v1', apiKey: 'sk-test-secret-value'
  });

  const updated = store.save({ apiKey: '', model: 'llama3', baseUrl: '' });
  assert.equal(updated.baseUrl, DEFAULT_BASE_URL);
  assert.deepEqual(store.getCredentials(), {
    model: 'llama3', baseUrl: DEFAULT_BASE_URL, apiKey: 'sk-test-secret-value'
  });
});

test('keeps the stored endpoint when saving without one', (context) => {
  const { store } = makeStore(context);
  store.save({ apiKey: 'sk-test-secret-value', model: 'm1', baseUrl: 'https://api.example.com/openai/v1' });
  const next = store.save({ apiKey: '', model: 'm2' });
  assert.equal(next.baseUrl, 'https://api.example.com/openai/v1');
});

test('rejects invalid endpoint values without touching the file', (context) => {
  const { store } = makeStore(context);
  store.save({ apiKey: 'sk-test-secret-value', model: 'm1', baseUrl: 'https://api.example.com/v1' });

  for (const bad of ['ftp://example.com', 'not a url', 'https://user:pass@example.com/v1', `https://${'a'.repeat(220)}.com`, 'https://example.com/v1?x=1']) {
    assert.throws(() => store.save({ apiKey: '', model: 'm1', baseUrl: bad }), /API 请求地址/);
  }
  assert.equal(store.getPublicSettings().baseUrl, 'https://api.example.com/v1');
});

test('treats a corrupted stored endpoint as the default', (context) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'momo-settings-'));
  context.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({ model: 'm1', baseUrl: 'javascript:alert(1)' }));
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`encrypted:${value}`),
    decryptString: (value) => value.toString('utf8').replace(/^encrypted:/, '')
  };
  const store = createSettingsStore({ app: { getPath: () => userData }, safeStorage });
  assert.equal(store.getPublicSettings().baseUrl, DEFAULT_BASE_URL);
});
