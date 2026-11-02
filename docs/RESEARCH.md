# Momo 调研:相似开源项目

调研时间:2026-11-02。目的:为桌宠形态、语音交互、智能家居和实体网关工单寻找可借鉴的成熟方案。

## 基准项目

### 第一梯队

| 项目 | Stars | 技术栈 | 定位 |
| --- | --- | --- | --- |
| [Open-LLM-VTuber](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber) | 14.5k | Python 后端 + Web/Electron 前端 | 赛道标杆:Live2D + 语音 + MCP |
| [VPet](https://github.com/LorisYounger/VPet) | 7.1k | C#/WPF | 纯桌宠模拟器,MOD 生态标杆 |

**Open-LLM-VTuber** 要点:语音打断(免耳机回声处理)、桌宠模式(透明置顶 + 点击穿透)、可插拔 ASR/TTS(sherpa-onnx、Faster-Whisper、GPT-SoVITS、Edge TTS 等)、MCP 工具调用、可完全离线。长期记忆"暂时移除待回归",v2.0 重写中——记忆系统在此领域仍是未解难题。

**VPet** 要点:32 种动画 × 4 状态、摸头/提起/爬墙等物理交互、Steam 创意工坊级 MOD 生态(动画/物品/主题/代码插件)。AI 只是附加功能,不做围绕 LLM 的设计。代表桌宠表现力上限。

### 第二梯队(与 Momo 架构相近)

| 项目 | Stars | 与 Momo 的关系 |
| --- | --- | --- |
| [AI-Desktop-Pet](https://github.com/ruguo0119/AI-Desktop-Pet) | 22 | 同栈参照物:Electron + React + Vite + OpenAI 兼容 API;多出 Live2D、Silero VAD、ChromaDB 向量记忆、情绪字段驱动表情、主动搭话与打断 |
| [moepet](https://github.com/zhuge-Tom/moepet) | 12 | 安全理念最近:Key 存 Windows 凭据管理器、云端图像理解须显式授权、数据默认只存本机;分层记忆(近期摘要 + 长期记忆 + 时间归档)+ Rust 检索核心 |
| [live2dpet](https://github.com/f25h-233/live2dpet) | 7 | "Claude Code 开发"对照面:无工具调用与权限控制,截屏只是定时调视觉 API |
| [desktop-pet-with-llms-linux](https://github.com/linhanmo/desktop-pet-with-llms-linux) | - | Qt + Live2D 全离线路线(本地 LLM + 离线 TTS) |

## 硬件与智能家居(MOMO-006/007 相关)

- [Willow](https://github.com/HeyWillow/willow):ESP32-S3-BOX 开源语音助手,片上唤醒词 + 服务端 Whisper + HA 深度集成,验证了"ESP32 前端 + 服务端推理"路径;2025 年后无重大更新。
- Home Assistant 官方语音管线(assist + Voice PE)已接管该生态位。MOMO-007 的 ESP32 原型建议优先对齐 ESPHome/HA Voice 既有协议,而非自造协议。
- Open-LLM-VTuber 已支持 MCP;Momo 引入 MCP 作为工具层标准是顺理成章的后续选项。

## 对 Momo 路线图的启示

社区项目普遍在卷五件事,按投入产出比排序:

1. **情绪驱动表情**:回复附带 emotion 字段驱动桌宠表情,改动小、效果直观(→ MOMO-008)。
2. **流式输出**:竞品全部支持;整段等待的感知延迟差距明显(→ MOMO-009)。
3. **记忆系统**:从近期对话摘要起步,不上向量库(moepet 分层摘要思路贴合 Momo 轻量风格)。
4. **语音打断与回声消除**:参考 Open-LLM-VTuber;Momo 目前 TTS 播报时用户说话会被录进去。
5. **Live2D 形象**:表现力天花板但成本最高(pixi-live2d-display + 模型授权),排在语音和记忆之后。

Momo 已有且上述项目几乎都没有的:**完整的权限安全模型**——受控应用启动 + 用户确认、`safeStorage` 加密凭据、严格 CSP 和 IPC 来源校验、桌宠形态重构(MOMO-011)延续点击穿透的透明窗口方案。若项目有公开或分发计划,这是最值得保持和宣传的差异点。

## 来源

- [Open-LLM-VTuber](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber) / [官网文档](https://open-llm-vtuber.github.io)
- [VPet 虚拟桌宠模拟器](https://github.com/LorisYounger/VPet)
- [AI-Desktop-Pet](https://github.com/ruguo0119/AI-Desktop-Pet)
- [moepet](https://github.com/zhuge-Tom/moepet)
- [live2dpet](https://github.com/f25h-233/live2dpet)
- [desktop-pet-with-llms-linux](https://github.com/linhanmo/desktop-pet-with-llms-linux)
- [Willow](https://github.com/HeyWillow/willow)
- [GitHub desktop-pet 主题页](https://github.com/topics/desktop-pet)
