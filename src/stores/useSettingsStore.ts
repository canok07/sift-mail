import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type AppTheme = 'light' | 'dark' | 'oled';
export type AppLanguage = 'tr' | 'en' | 'de';
export type AIProvider = 'gemini' | 'openai' | 'anthropic' | 'ollama';

export interface SettingsState {
  theme: AppTheme;
  language: AppLanguage;
  blockTrackers: boolean;
  requireBiometric: boolean;
  autoDeleteUnsubscribed: boolean;
  aiProvider: AIProvider;
  ollamaEndpoint: string;
  telegramBotToken: string;
  telegramChatId: string;
  telegramEnabled: boolean;

  // Actions
  setTheme: (theme: AppTheme) => void;
  setLanguage: (lang: AppLanguage) => void;
  setBlockTrackers: (enabled: boolean) => void;
  setRequireBiometric: (enabled: boolean) => void;
  setAutoDeleteUnsubscribed: (enabled: boolean) => void;
  setAIProvider: (provider: AIProvider) => void;
  setOllamaEndpoint: (endpoint: string) => void;
  setTelegramConfig: (config: { botToken?: string; chatId?: string; enabled?: boolean }) => void;
  resetToDefaults: () => void;
}

const detectDefaultLanguage = (): AppLanguage => {
  if (typeof window === 'undefined') return 'tr';
  const navLang = navigator.language?.toLowerCase() || '';
  if (navLang.startsWith('tr')) return 'tr';
  if (navLang.startsWith('de')) return 'de';
  return 'en';
};

const DEFAULT_SETTINGS = {
  theme: 'dark' as AppTheme, // Default to Dark Mode for premium initial experience
  language: detectDefaultLanguage(),
  blockTrackers: true,
  requireBiometric: false,
  autoDeleteUnsubscribed: false,
  aiProvider: 'gemini' as AIProvider,
  ollamaEndpoint: 'http://localhost:11434',
  telegramBotToken: '',
  telegramChatId: '',
  telegramEnabled: false,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,

      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setBlockTrackers: (blockTrackers) => set({ blockTrackers }),
      setRequireBiometric: (requireBiometric) => set({ requireBiometric }),
      setAutoDeleteUnsubscribed: (autoDeleteUnsubscribed) => set({ autoDeleteUnsubscribed }),
      setAIProvider: (aiProvider) => set({ aiProvider }),
      setOllamaEndpoint: (ollamaEndpoint) => set({ ollamaEndpoint }),
      setTelegramConfig: (config) =>
        set((state) => ({
          telegramBotToken: config.botToken !== undefined ? config.botToken : state.telegramBotToken,
          telegramChatId: config.chatId !== undefined ? config.chatId : state.telegramChatId,
          telegramEnabled: config.enabled !== undefined ? config.enabled : state.telegramEnabled,
        })),
      resetToDefaults: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'sift_user_settings',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
