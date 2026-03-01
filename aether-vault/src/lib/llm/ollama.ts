/**
 * Ollama LLM Client for LLM-Assisted Entity Detection
 * 
 * Connects to local Ollama API for enhancing entity detection.
 * Uses the /api/generate endpoint with structured JSON output.
 */

export interface OllamaConfig {
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  format?: 'json' | object;
  stream?: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
    top_p?: number;
    top_k?: number;
  };
}

export interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  done_reason?: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface DetectedEntity {
  type: string;
  value: string;
  start: number;
  end: number;
}

export interface LLMVerificationResult {
  verified: DetectedEntity[];
  additional: DetectedEntity[];
  removed: string[]; // Values that were false positives
}

const DEFAULT_CONFIG: OllamaConfig = {
  baseUrl: 'http://localhost:11434',
  model: 'ministral-3:3b',
  timeoutMs: 30000,
};

class OllamaClient {
  private config: OllamaConfig;

  constructor(config: Partial<OllamaConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if Ollama is available at the configured URL
   */
  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${this.config.baseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get list of available models
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`, {
        method: 'GET',
      });
      
      if (!response.ok) {
        throw new Error(`Failed to list models: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.models?.map((m: { name: string }) => m.name) || [];
    } catch (error) {
      console.error('Failed to list Ollama models:', error);
      return [];
    }
  }

  /**
   * Generate a response from the LLM
   */
  async generate(request: Omit<OllamaGenerateRequest, 'model'>): Promise<string> {
    const fullRequest: OllamaGenerateRequest = {
      ...request,
      model: this.config.model,
      stream: false,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(`${this.config.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fullRequest),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const data: OllamaGenerateResponse = await response.json();
      return data.response;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Ollama request timed out after ${this.config.timeoutMs}ms`);
      }
      throw error;
    }
  }

  /**
   * Verify and enhance detected entities using LLM
   * 
   * This is the core function for LLM-assisted detection.
   * It takes text and preliminary entities, sends them to the LLM,
   * and gets back verified entities plus any additional ones found.
   */
  async verifyEntities(
    text: string,
    preliminaryEntities: DetectedEntity[],
    entityTypes: string[] = ['PERSON', 'ORG', 'EMAIL', 'PHONE', 'LOCATION', 'DATE', 'AMOUNT']
  ): Promise<LLMVerificationResult> {
    const systemPrompt = `You are a PII (Personally Identifiable Information) detection assistant.
Your task is to verify detected entities and find any additional PII that may have been missed.

Entity Types to look for: ${entityTypes.join(', ')}

Respond ONLY with a JSON object in this exact format:
{
  "verified": [{"type": "ENTITY_TYPE", "value": "exact text", "start": 0, "end": 10}],
  "additional": [{"type": "ENTITY_TYPE", "value": "exact text", "start": 20, "end": 30}],
  "removed": ["value that was a false positive"]
}

Rules:
1. "verified" - entities from the input that are correct (preserve their positions)
2. "additional" - new entities you found that weren't in the input
3. "removed" - values from input that are NOT actually entities (false positives)
4. All positions must be exact character indices in the original text
5. Be thorough - it's better to flag potential PII than to miss it`;

    const userPrompt = `Text to analyze:\n\n${text}\n\nPreliminary entities detected:\n${JSON.stringify(preliminaryEntities, null, 2)}`;

    const response = await this.generate({
      system: systemPrompt,
      prompt: userPrompt,
      format: 'json',
      options: {
        temperature: 0.1, // Low temperature for consistent output
        num_predict: 2000, // Limit response length
      },
    });

    try {
      const result: LLMVerificationResult = JSON.parse(response);
      return {
        verified: result.verified || [],
        additional: result.additional || [],
        removed: result.removed || [],
      };
    } catch (error) {
      console.error('Failed to parse LLM response:', response);
      // Fallback: return preliminary entities as verified
      return {
        verified: preliminaryEntities,
        additional: [],
        removed: [],
      };
    }
  }

  /**
   * Quick entity detection without preliminary entities
   * Useful for getting a "second opinion" on text
   */
  async detectEntities(
    text: string,
    entityTypes: string[] = ['PERSON', 'ORG', 'EMAIL', 'PHONE', 'LOCATION', 'DATE', 'AMOUNT']
  ): Promise<DetectedEntity[]> {
    const systemPrompt = `You are a PII (Personally Identifiable Information) detection assistant.
Analyze the text and identify all entities of the following types: ${entityTypes.join(', ')}

Respond ONLY with a JSON array in this exact format:
[{"type": "ENTITY_TYPE", "value": "exact text", "start": 0, "end": 10}]

Rules:
1. "type" must be one of: ${entityTypes.join(', ')}
2. "value" must be the exact text from the original
3. "start" and "end" must be exact character indices
4. Return an empty array [] if no entities are found`;

    const response = await this.generate({
      system: systemPrompt,
      prompt: text,
      format: 'json',
      options: {
        temperature: 0.1,
        num_predict: 2000,
      },
    });

    try {
      const entities: DetectedEntity[] = JSON.parse(response);
      return Array.isArray(entities) ? entities : [];
    } catch (error) {
      console.error('Failed to parse LLM detection response:', response);
      return [];
    }
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<OllamaConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): OllamaConfig {
    return { ...this.config };
  }
}

// Export singleton instance
export const ollamaClient = new OllamaClient();

// Export class for custom instances
export { OllamaClient };
