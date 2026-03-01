import { writable } from 'svelte/store';

/**
 * Masking Strategy Types
 */
export type MaskingStrategy = 'nlp' | 'ollama';

export interface StrategyConfig {
  /** Primary masking strategy */
  strategy: MaskingStrategy;
  
  /** Whether to use LLM refinement on top of NLP (hybrid mode) */
  useLlmRefinement: boolean;
  
  /** Ollama-specific settings (only used when strategy is 'ollama') */
  ollama: {
    enabled: boolean;
    baseUrl: string;
    model: string;
    timeoutMs: number;
    /** Use JSON format for structured output (more accurate) vs Simple format (faster) */
    useJsonFormat: boolean;
  };
  
  /** NLP-specific settings (only used when strategy is 'nlp') */
  nlp: {
    /** Entity types to detect */
    entityTypes: string[];
    /** Use compromise.js for PERSON/ORG detection */
    useCompromise: boolean;
    /** Use regex for pattern-based detection */
    useRegex: boolean;
  };
}

const DEFAULT_CONFIG: StrategyConfig = {
  strategy: 'nlp', // Default to NLP for speed
  useLlmRefinement: false,
  
  ollama: {
    enabled: false,
    baseUrl: 'http://localhost:11434',
    model: 'ministral-3:3b',
    timeoutMs: 30000,
    useJsonFormat: false, // Simple format is faster
  },
  
  nlp: {
    entityTypes: ['PERSON', 'ORG', 'EMAIL', 'PHONE', 'AMOUNT', 'DATE', 'API_KEY'],
    useCompromise: true,
    useRegex: true,
  },
};

// Load from localStorage if available
function loadConfig(): StrategyConfig {
  if (typeof localStorage === 'undefined') {
    return DEFAULT_CONFIG;
  }
  
  try {
    const stored = localStorage.getItem('masking-config');
    if (stored) {
      const parsed = JSON.parse(stored);
      // Deep merge with defaults to handle new fields
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        ollama: { ...DEFAULT_CONFIG.ollama, ...parsed.ollama },
        nlp: { ...DEFAULT_CONFIG.nlp, ...parsed.nlp },
      };
    }
  } catch {
    // Ignore parse errors
  }
  
  return DEFAULT_CONFIG;
}

function createMaskingConfigStore() {
  const { subscribe, set, update } = writable<StrategyConfig>(loadConfig());
  
  return {
    subscribe,
    
    set: (config: StrategyConfig) => {
      localStorage.setItem('masking-config', JSON.stringify(config));
      set(config);
    },
    
    update: (updater: (s: StrategyConfig) => StrategyConfig) => {
      update(s => {
        const newConfig = updater(s);
        localStorage.setItem('masking-config', JSON.stringify(newConfig));
        return newConfig;
      });
    },
    
    /** Set the primary masking strategy */
    setStrategy: (strategy: MaskingStrategy) => {
      update(s => {
        const newConfig = { 
          ...s, 
          strategy,
          // Auto-enable/disable ollama based on strategy
          ollama: { ...s.ollama, enabled: strategy === 'ollama' }
        };
        localStorage.setItem('masking-config', JSON.stringify(newConfig));
        return newConfig;
      });
    },
    
    /** Toggle LLM refinement (hybrid mode) */
    setLlmRefinement: (enabled: boolean) => {
      update(s => {
        const newConfig = { ...s, useLlmRefinement: enabled };
        localStorage.setItem('masking-config', JSON.stringify(newConfig));
        return newConfig;
      });
    },
    
    /** Update Ollama settings */
    setOllamaConfig: (config: Partial<StrategyConfig['ollama']>) => {
      update(s => {
        const newConfig = { 
          ...s, 
          ollama: { ...s.ollama, ...config }
        };
        localStorage.setItem('masking-config', JSON.stringify(newConfig));
        return newConfig;
      });
    },
    
    /** Update NLP settings */
    setNlpConfig: (config: Partial<StrategyConfig['nlp']>) => {
      update(s => {
        const newConfig = { 
          ...s, 
          nlp: { ...s.nlp, ...config }
        };
        localStorage.setItem('masking-config', JSON.stringify(newConfig));
        return newConfig;
      });
    },
    
    reset: () => {
      localStorage.removeItem('masking-config');
      set(DEFAULT_CONFIG);
    },
  };
}

export const maskingConfig = createMaskingConfigStore();

/**
 * Helper function to get the effective masking strategy
 * Returns the actual strategy to use based on current config
 */
export function getEffectiveStrategy(config: StrategyConfig): {
  primary: MaskingStrategy;
  useLlm: boolean;
} {
  return {
    primary: config.strategy,
    useLlm: config.strategy === 'ollama' || config.useLlmRefinement,
  };
}

// Re-export for backward compatibility
export { maskingConfig as llmSettings };
export type { StrategyConfig as LlmSettings };
