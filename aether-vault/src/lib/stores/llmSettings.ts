import { writable } from 'svelte/store';

export interface LlmSettings {
  enabled: boolean;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

const DEFAULT_SETTINGS: LlmSettings = {
  enabled: false,
  baseUrl: 'http://localhost:11434',
  model: 'phi3:mini',
  timeoutMs: 30000,
};

// Load from localStorage if available
function loadSettings(): LlmSettings {
  if (typeof localStorage === 'undefined') {
    return DEFAULT_SETTINGS;
  }
  
  try {
    const stored = localStorage.getItem('llm-settings');
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch {
    // Ignore parse errors
  }
  
  return DEFAULT_SETTINGS;
}

function createLlmSettingsStore() {
  const { subscribe, set, update } = writable<LlmSettings>(loadSettings());
  
  return {
    subscribe,
    set: (settings: LlmSettings) => {
      localStorage.setItem('llm-settings', JSON.stringify(settings));
      set(settings);
    },
    update: (updater: (s: LlmSettings) => LlmSettings) => {
      update(s => {
        const newSettings = updater(s);
        localStorage.setItem('llm-settings', JSON.stringify(newSettings));
        return newSettings;
      });
    },
    reset: () => {
      localStorage.removeItem('llm-settings');
      set(DEFAULT_SETTINGS);
    },
  };
}

export const llmSettings = createLlmSettingsStore();
