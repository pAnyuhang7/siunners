# Momo 桌宠

Windows 桌面 AI 宠物第一版。AI 通过 docode OpenAI 兼容 API 提供；本地 Electron 进程负责窗口、凭据保护、权限判断和有限的系统工具调用。

## 开发

需要 Node.js 20 或更新版本。

```powershell
pnpm install
pnpm dev
```

设置页只需填写 API Key 和模型名，默认模型为 `gpt-6.1-sol`。请求地址由应用固定为 `https://docode.cc/v1/chat/completions`；请求使用 `Authorization: Bearer` 认证，并按 OpenAI Chat Completions 格式发送模型名、对话和工具定义。密钥只在设置表单的临时状态中输入，经受限 IPC 交给 Electron 主进程，由 `safeStorage` 加密后保存在当前 Windows 用户的数据目录；模型请求由主进程发送，密钥不会进入聊天记录或日志。对话文本会发送到 docode。

## 验证

```powershell
pnpm test
pnpm build
```

## 安全边界

- 渲染进程启用上下文隔离，关闭 Node 集成；只暴露窄范围的 preload API。
- 模型可请求打开固定应用清单中的程序，执行前必须由用户确认。
- 模型不能传入命令行、路径或任意 shell 脚本。
- API 凭据以 Electron `safeStorage` 加密；无法加密时拒绝保存。

## 当前范围

工单见 [docs/WORK_ORDERS.md](docs/WORK_ORDERS.md)。语音、Home Assistant 和硬件连接器保留为后续工单。
