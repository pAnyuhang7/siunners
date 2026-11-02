const { spawn } = require('node:child_process');
const path = require('node:path');

const APP_CATALOG = Object.freeze({
  notepad: Object.freeze({ name: '记事本', executable: 'notepad.exe' }),
  calculator: Object.freeze({ name: '计算器', executable: 'calc.exe' }),
  explorer: Object.freeze({ name: '文件资源管理器', executable: 'explorer.exe' }),
  paint: Object.freeze({ name: '画图', executable: 'mspaint.exe' })
});

function parseOpenAppCall(toolCall) {
  if (!toolCall || toolCall.type !== 'function' || toolCall.function?.name !== 'open_application') {
    throw new Error('不支持的操作。');
  }

  let args;
  if (typeof toolCall.function.arguments !== 'string' || toolCall.function.arguments.length > 1000) {
    throw new Error('应用参数无效。');
  }
  try {
    args = JSON.parse(toolCall.function.arguments);
  } catch {
    throw new Error('应用参数无效。');
  }

  const appId = args?.app_id;
  if (typeof appId !== 'string' || !Object.hasOwn(APP_CATALOG, appId)) {
    throw new Error('这个应用不在可启动清单中。');
  }

  return { appId, appName: APP_CATALOG[appId].name };
}

function launchAllowedApp(appId, spawnProcess = spawn) {
  const app = APP_CATALOG[appId];
  if (!app) throw new Error('这个应用不在可启动清单中。');
  const executable = path.join(process.env.WINDIR || 'C:\\Windows', 'System32', app.executable);

  return new Promise((resolve, reject) => {
    const child = spawnProcess(executable, [], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    });

    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve({ appId, appName: app.name });
    });
  });
}

function toolDefinition() {
  return {
    type: 'function',
    function: {
      name: 'open_application',
      description: '请求打开一个已登记的 Windows 应用。执行前会由用户确认。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          app_id: { type: 'string', enum: Object.keys(APP_CATALOG) }
        },
        required: ['app_id']
      }
    }
  };
}

module.exports = { APP_CATALOG, launchAllowedApp, parseOpenAppCall, toolDefinition };
