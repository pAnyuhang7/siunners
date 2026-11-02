import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle, Mic, Minus, Send, Settings2, ShieldCheck, Sparkles, Square, Volume2, VolumeX, X } from 'lucide-react';

type Role = 'user' | 'assistant';
type PetMessage = {
  id: string;
  role: Role;
  content: string;
  action?: {
    requestId: string;
    appName: string;
    status: 'pending' | 'running' | 'done' | 'cancelled' | 'failed';
  };
};

const defaultSettings: PetSettings = {
  model: 'gpt-6.1-sol',
  baseUrl: 'https://docode.cc/v1',
  apiKeyConfigured: false,
  secureStorageAvailable: false
};

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function actionStatusText(action: NonNullable<PetMessage['action']>) {
  switch (action.status) {
    case 'running': return `正在打开${action.appName}`;
    case 'done': return `已处理：${action.appName}`;
    case 'failed': return `打开${action.appName}失败`;
    case 'cancelled': return `已取消：${action.appName}`;
    default: return `允许打开${action.appName}？`;
  }
}

function PetCharacter() {
  return (
    <div className="pet-scene" aria-label="Momo 桌宠">
      <div className="pet-shadow" />
      <div className="pet-character">
        <div className="pet-ear pet-ear-left" />
        <div className="pet-ear pet-ear-right" />
        <div className="pet-head">
          <span className="pet-eye pet-eye-left" />
          <span className="pet-eye pet-eye-right" />
          <span className="pet-cheek pet-cheek-left" />
          <span className="pet-cheek pet-cheek-right" />
          <span className="pet-mouth" />
          <span className="pet-forehead-mark"><Sparkles size={14} strokeWidth={2.6} /></span>
        </div>
        <div className="pet-body">
          <span className="pet-badge" />
          <span className="pet-arm pet-arm-left" />
          <span className="pet-arm pet-arm-right" />
        </div>
        <div className="pet-foot pet-foot-left" />
        <div className="pet-foot pet-foot-right" />
      </div>
    </div>
  );
}

function App() {
  const [messages, setMessages] = useState<PetMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [settings, setSettings] = useState(defaultSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(defaultSettings.model);
  const [baseUrl, setBaseUrl] = useState(defaultSettings.baseUrl);
  const [saveState, setSaveState] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceOutput, setVoiceOutput] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderStreamRef = useRef<MediaStream | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  const recorderTimerRef = useRef<ReturnType<typeof setTimeout> | 0>(0);
  const playbackRef = useRef<HTMLAudioElement | null>(null);
  const isDesktop = Boolean(window.momo);
  const recorderMimeType = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : '';

  useEffect(() => {
    window.momo?.getSettings().then((next) => {
      setSettings(next);
      setModel(next.model);
      setBaseUrl(next.baseUrl);
      setOnline(next.apiKeyConfigured);
    }).catch(() => setOnline(false));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const addAssistant = (content: string, action?: PetMessage['action']) => {
    setMessages((current) => [...current, { id: makeId(), role: 'assistant', content, action }]);
  };

  async function dispatchMessage(content: string) {
    if (!content) return;
    const next: PetMessage[] = [...messages, { id: makeId(), role: 'user', content }];
    setMessages(next);
    setError('');
    setBusy(true);
    try {
      if (!window.momo) throw new Error('请在 Momo 桌面程序中配置在线 AI。');
      const result = await window.momo.sendMessage(next.slice(-24).map(({ role, content: text }) => ({ role, content: text })));
      if (result.kind === 'confirmation') {
        const text = result.text || `我可以替你打开${result.appName}。`;
        addAssistant(text, {
          requestId: result.requestId,
          appName: result.appName,
          status: 'pending'
        });
        void speak(text);
      } else {
        addAssistant(result.text);
        void speak(result.text);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '暂时无法连接在线 AI。');
    } finally {
      setBusy(false);
    }
  }

  async function submitMessage(event?: FormEvent) {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || busy || recording) return;
    if (isDesktop && !settings.apiKeyConfigured) {
      setSaveState('先配置 API Key 才能开始对话。');
      setSettingsOpen(true);
      return;
    }
    setDraft('');
    await dispatchMessage(content);
  }

  async function toggleRecording() {
    if (recording) {
      stopRecording();
      return;
    }
    if (busy) return;
    if (!settings.apiKeyConfigured) {
      setSaveState('先配置 API Key 才能使用语音。');
      setSettingsOpen(true);
      return;
    }
    if (!isDesktop) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder || !recorderMimeType) {
      setError('当前环境不支持录音。');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: recorderMimeType });
      recorderChunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) recorderChunksRef.current.push(event.data); };
      recorder.onstop = () => void finishRecording();
      recorder.start();
      recorderStreamRef.current = stream;
      recorderRef.current = recorder;
      setError('');
      setRecording(true);
      recorderTimerRef.current = window.setTimeout(() => stopRecording(), 60_000);
    } catch {
      setError('无法访问麦克风，请确认 Windows 麦克风权限已允许 Momo。');
    } finally {
      stopPlayback();
    }
  }

  function stopRecording() {
    window.clearTimeout(recorderTimerRef.current);
    recorderTimerRef.current = 0;
    const recorder = recorderRef.current;
    if (recorder && recorder.state === 'recording') recorder.stop();
  }

  async function finishRecording() {
    window.clearTimeout(recorderTimerRef.current);
    recorderTimerRef.current = 0;
    recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
    recorderStreamRef.current = null;
    recorderRef.current = null;
    setRecording(false);
    const blob = new Blob(recorderChunksRef.current, { type: recorderMimeType || 'audio/webm' });
    recorderChunksRef.current = [];
    if (blob.size < 1024) {
      setSaveState('没有录到声音，请点击麦克风说话后再结束。');
      return;
    }
    if (busy) {
      setSaveState('上一条消息还在处理，这次录音没有发送。');
      return;
    }
    setBusy(true);
    try {
      if (!window.momo) throw new Error('请在 Momo 桌面程序中使用语音。');
      const { text } = await window.momo.transcribeVoice(new Uint8Array(await blob.arrayBuffer()));
      setBusy(false);
      await dispatchMessage(text);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '语音识别没有完成。');
    } finally {
      setBusy(false);
    }
  }

  async function speak(text: string) {
    if (!voiceOutput || !window.momo || !text) return;
    try {
      stopPlayback();
      const { audio, mimeType } = await window.momo.speak(text);
      const url = URL.createObjectURL(new Blob([audio], { type: mimeType }));
      const player = new Audio(url);
      player.onended = () => URL.revokeObjectURL(url);
      player.onerror = () => URL.revokeObjectURL(url);
      playbackRef.current = player;
      await player.play();
    } catch {
      // 播报失败不打断对话
    }
  }

  function stopPlayback() {
    const player = playbackRef.current;
    if (player) {
      player.pause();
      player.removeAttribute('src');
      playbackRef.current = null;
    }
  }

  async function resolveAction(messageId: string, requestId: string, approved: boolean) {
    if (!window.momo || busy) return;
    setBusy(true);
    setError('');
    setMessages((current) => current.map((message) => message.id === messageId && message.action
      ? { ...message, action: { ...message.action, status: approved ? 'running' : 'cancelled' } }
      : message));
    try {
      const result = await window.momo.resolveAction(requestId, approved);
      setMessages((current) => current.map((message) => message.id === messageId && message.action && approved
        ? { ...message, action: { ...message.action, status: 'done' } }
        : message));
      addAssistant(result.text);
      void speak(result.text);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作没有完成。');
      setMessages((current) => current.map((message) => message.id === messageId && message.action
        ? { ...message, action: { ...message.action, status: 'failed' } }
        : message));
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    setSaveState('');
    if (!window.momo) {
      setSaveState('设置只能在桌面程序中保存。');
      return;
    }
    try {
      const next = await window.momo.saveSettings({ apiKey, model, baseUrl });
      setSettings(next);
      setModel(next.model);
      setBaseUrl(next.baseUrl);
      setApiKey('');
      setOnline(next.apiKeyConfigured);
      setSaveState('已保存');
    } catch (cause) {
      setSaveState(cause instanceof Error ? cause.message : '保存失败');
    }
  }

  async function clearKey() {
    if (!window.momo) return;
    try {
      const next = await window.momo.clearApiKey();
      setSettings(next);
      setOnline(false);
      setSaveState('API Key 已移除');
    } catch (cause) {
      setSaveState(cause instanceof Error ? cause.message : '移除失败');
    }
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submitMessage();
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark"><span className="brand-dot" />Momo</div>
        <div className={`connection ${online ? 'connection-online' : ''}`}>
          <span />{online ? '已配置' : '未连接'}
        </div>
        <div className="window-actions">
          <button
            className={`icon-button ${voiceOutput ? 'toggle-on' : ''}`}
            type="button"
            title={voiceOutput ? '关闭语音播报' : '开启语音播报'}
            aria-label={voiceOutput ? '关闭语音播报' : '开启语音播报'}
            aria-pressed={voiceOutput}
            onClick={() => { if (voiceOutput) stopPlayback(); setVoiceOutput(!voiceOutput); }}
          >
            {voiceOutput ? <Volume2 size={17} /> : <VolumeX size={17} />}
          </button>
          <button className="icon-button" type="button" title="设置在线 AI" aria-label="设置在线 AI" onClick={() => { setSaveState(''); setSettingsOpen(true); }}>
            <Settings2 size={17} />
          </button>
          <button className="icon-button" type="button" title="隐藏到系统托盘" aria-label="隐藏到系统托盘" onClick={() => void window.momo?.hide()}>
            <Minus size={18} />
          </button>
        </div>
      </header>

      <section className="pet-stage">
        <PetCharacter />
        <div className="greeting">
          <span className="greeting-kicker">MOMO / DESKTOP COMPANION</span>
          <h1>嗨，我是 Momo</h1>
          <p>{online ? '我在这里，随时听你说。' : '今天想聊点什么？'}</p>
        </div>
        <div className="stage-sparkle stage-sparkle-one" />
        <div className="stage-sparkle stage-sparkle-two" />
      </section>

      <section className="conversation" aria-label="对话">
        <div className="conversation-label"><span>对话</span><span className="conversation-rule" /></div>
        <div className="message-list" ref={scrollRef} aria-live="polite">
          {messages.length === 0 ? (
            <div className="empty-state">
              <div className="empty-sparkle"><Sparkles size={17} /></div>
              <p>今天有什么想做的？</p>
            </div>
          ) : messages.map((message) => (
            <article key={message.id} className={`message message-${message.role}`}>
              {message.role === 'assistant' && <div className="message-avatar">M</div>}
              <div className="message-body">
                {message.content && <p className="message-text">{message.content}</p>}
                {message.action && (
                  <div className="action-confirmation">
                    <div className="action-confirmation-title">
                      <ShieldCheck size={16} />
                      <span>{actionStatusText(message.action)}</span>
                    </div>
                    {message.action.status === 'pending' && (
                      <div className="action-buttons">
                        <button className="action-approve" type="button" disabled={busy} onClick={() => void resolveAction(message.id, message.action!.requestId, true)}>
                          <Check size={14} />确认
                        </button>
                        <button className="action-cancel" type="button" disabled={busy} onClick={() => void resolveAction(message.id, message.action!.requestId, false)}>
                          <X size={14} />取消
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </article>
          ))}
          {busy && <div className="typing"><span /><span /><span /></div>}
        </div>
      </section>

      <footer className="composer-area">
        {error && <div className="inline-error" role="alert">{error}</div>}
        {!isDesktop && <div className="preview-note">桌面预览</div>}
        <form className="composer" onSubmit={(event) => void submitMessage(event)}>
          <textarea
            aria-label="发送消息给 Momo"
            placeholder={recording ? '正在聆听，再点一次麦克风结束…' : '和 Momo 说说话…'}
            rows={1}
            maxLength={6000}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onComposerKeyDown}
          />
          {isDesktop && (
            <button
              className={`mic-button ${recording ? 'mic-recording' : ''}`}
              type="button"
              title={recording ? '结束录音并发送' : '语音输入'}
              aria-label={recording ? '结束录音并发送' : '开始语音输入'}
              aria-pressed={recording}
              disabled={busy}
              onClick={() => void toggleRecording()}
            >
              {recording ? <Square size={13} /> : <Mic size={16} />}
            </button>
          )}
          <button className="send-button" type="submit" title="发送" aria-label="发送" disabled={!draft.trim() || busy}>
            {busy ? <LoaderCircle className="spin" size={17} /> : <Send size={16} />}
          </button>
        </form>
        <div className="composer-meta"><span>ENTER 发送</span><span>在线 AI</span></div>
      </footer>

      {settingsOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
          <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <header className="modal-header">
              <div><span className="modal-eyebrow">CONNECTION</span><h2 id="settings-title">在线 AI 设置</h2></div>
              <button className="icon-button" type="button" title="关闭设置" aria-label="关闭设置" onClick={() => setSettingsOpen(false)}><X size={18} /></button>
            </header>
            <form onSubmit={(event) => void saveSettings(event)}>
              <label className="field-label" htmlFor="base-url">请求地址</label>
              <input id="base-url" className="text-field" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder={defaultSettings.baseUrl} autoComplete="off" spellCheck={false} />
              <p className="endpoint-note">OpenAI 兼容接口根地址，聊天与语音都走此地址，请求发送到「根地址/chat/completions」。留空恢复默认；也可填写本地服务如 http://127.0.0.1:11434/v1（Ollama）。服务商官网：docode.cc</p>
              <label className="field-label" htmlFor="model">模型</label>
              <input id="model" className="text-field" value={model} onChange={(event) => setModel(event.target.value)} placeholder="gpt-6.1-sol" autoComplete="off" spellCheck={false} />
              <label className="field-label" htmlFor="api-key">API Key</label>
              <input id="api-key" className="text-field" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={settings.apiKeyConfigured ? '已保存，留空则保持不变' : 'sk-…'} autoComplete="new-password" />
              <div className="secure-note"><ShieldCheck size={15} /><span>{settings.secureStorageAvailable ? '凭据将加密保存在此 Windows 用户账户中' : '当前系统不支持安全凭据存储'}</span></div>
              {saveState && <p className="save-state" role="status">{saveState}</p>}
              <div className="modal-actions">
                {settings.apiKeyConfigured && <button className="text-action remove-key" type="button" onClick={() => void clearKey()}>移除密钥</button>}
                <button className="text-action" type="button" onClick={() => setSettingsOpen(false)}>取消</button>
                <button className="save-button" type="submit"><Check size={15} />保存设置</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

export default App;
