export {};

declare global {
  interface PetSettings {
    model: string;
    baseUrl: string;
    apiKeyConfigured: boolean;
    secureStorageAvailable: boolean;
  }

  type AssistantReply =
    | { kind: 'message'; text: string }
    | { kind: 'confirmation'; requestId: string; appId: string; appName: string; text: string };

  interface Window {
    momo?: {
      getSettings: () => Promise<PetSettings>;
      saveSettings: (value: { apiKey: string; model: string; baseUrl: string }) => Promise<PetSettings>;
      clearApiKey: () => Promise<PetSettings>;
      sendMessage: (messages: Array<{ role: 'user' | 'assistant'; content: string }>) => Promise<AssistantReply>;
      resolveAction: (requestId: string, approved: boolean) => Promise<AssistantReply>;
      transcribeVoice: (audio: Uint8Array<ArrayBuffer>) => Promise<{ text: string }>;
      speak: (text: string) => Promise<{ audio: Uint8Array<ArrayBuffer>; mimeType: string }>;
      hide: () => Promise<void>;
      toggleChat: () => Promise<boolean>;
      setClickThrough: (ignore: boolean) => Promise<void>;
    };
  }
}
