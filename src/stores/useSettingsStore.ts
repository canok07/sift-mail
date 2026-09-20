import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type AppTheme = 'light' | 'dark' | 'oled' | 'ocean' | 'forest';
export type AppLanguage = 'tr' | 'en' | 'de';
export type AIProvider = 'gemini' | 'openai' | 'anthropic' | 'ollama';

export interface SettingsState {
  theme: AppTheme;
  language: AppLanguage;
  blockTrackers: boolean;
  requireBiometric: boolean;
  autoDeleteUnsubscribed: boolean;
  aiProvider: AIProvider;
  aiEnabled: boolean;
  ollamaEndpoint: string;
  telegramBotToken: string;
  telegramChatId: string;
  telegramEnabled: boolean;
  accentColor: string;
  backgroundImage: string;
  fontFamily: string;
  fontSize: number;
  pageSize: 10 | 20 | 50 | 100;

  // Actions
  setTheme: (theme: AppTheme) => void;
  setLanguage: (lang: AppLanguage) => void;
  setBlockTrackers: (enabled: boolean) => void;
  setRequireBiometric: (enabled: boolean) => void;
  setAutoDeleteUnsubscribed: (enabled: boolean) => void;
  setAIProvider: (provider: AIProvider) => void;
  setAIEnabled: (enabled: boolean) => void;
  setOllamaEndpoint: (endpoint: string) => void;
  setTelegramConfig: (config: { botToken?: string; chatId?: string; enabled?: boolean }) => void;
  setAppearance: (appearance: Partial<Pick<SettingsState, 'accentColor' | 'backgroundImage' | 'fontFamily' | 'fontSize' | 'pageSize'>>) => void;
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
  aiEnabled: false,
  ollamaEndpoint: 'http://localhost:11434',
  telegramBotToken: '',
  telegramChatId: '',
  telegramEnabled: false,
  accentColor: '#10b981',
  backgroundImage: '',
  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  fontSize: 14,
  pageSize: 20 as const,
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
      setAIEnabled: (aiEnabled) => set({ aiEnabled }),
      setOllamaEndpoint: (ollamaEndpoint) => set({ ollamaEndpoint }),
      setTelegramConfig: (config) =>
        set((state) => ({
          telegramBotToken: config.botToken !== undefined ? config.botToken : state.telegramBotToken,
          telegramChatId: config.chatId !== undefined ? config.chatId : state.telegramChatId,
          telegramEnabled: config.enabled !== undefined ? config.enabled : state.telegramEnabled,
        })),
      setAppearance: (appearance) => set(appearance),
      resetToDefaults: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'sift_user_settings',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
