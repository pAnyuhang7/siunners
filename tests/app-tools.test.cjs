const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { APP_CATALOG, launchAllowedApp, parseOpenAppCall, toolDefinition } = require('../src/main/app-tools.cjs');

test('model tool schema only exposes fixed application IDs', () => {
  assert.deepEqual(toolDefinition().function.parameters.properties.app_id.enum, Object.keys(APP_CATALOG));
});

test('validates an application request without accepting a command', () => {
  assert.deepEqual(parseOpenAppCall({
    type: 'function',
    function: { name: 'open_application', arguments: '{"app_id":"notepad","command":"calc.exe"}' }
  }), { appId: 'notepad', appName: '记事本' });
});

test('rejects unknown applications and malformed tool calls', () => {
  assert.throws(() => parseOpenAppCall({
    type: 'function',
    function: { name: 'open_application', arguments: '{"app_id":"powershell"}' }
  }));
  assert.throws(() => parseOpenAppCall({
    type: 'function',
    function: { name: 'run_shell', arguments: '{}' }
  }));
});

test('launches only the catalog executable with no model-controlled arguments', async () => {
  let invocation;
  let unreferenced = false;
  const result = await launchAllowedApp('notepad', (command, args, options) => {
    invocation = { command, args, options };
    const child = new EventEmitter();
    child.unref = () => { unreferenced = true; };
    queueMicrotask(() => child.emit('spawn'));
    return child;
  });

  assert.equal(invocation.command.toLowerCase(), 'c:\\windows\\system32\\notepad.exe');
  assert.deepEqual(invocation.args, []);
  assert.equal(invocation.options.detached, true);
  assert.deepEqual(result, { appId: 'notepad', appName: '记事本' });
  assert.equal(unreferenced, true);
});
