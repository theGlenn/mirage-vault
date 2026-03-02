/**
 * Xybrid Embedded LLM Client
 *
 * Drop-in replacement for OllamaClient that uses the embedded Xybrid
 * inference engine via Tauri invoke() instead of HTTP to a local server.
 *
 * Same public API surface as OllamaClient so it can be swapped in
 * anywhere ollamaClient is used.
 */

import { invoke } from '@tauri-apps/api/core';
import type { DetectedEntity, LLMVerificationResult } from './ollama';

class XybridClient {
	/**
	 * Check if the embedded LLM model is loaded and ready
	 */
	async isAvailable(): Promise<boolean> {
		try {
			return await invoke<boolean>('xybrid_is_ready');
		} catch {
			return false;
		}
	}

	/**
	 * List available models (xybrid only has the embedded model)
	 */
	async listModels(): Promise<string[]> {
		try {
			const status = await invoke<{ model_id: string; status: string }>('xybrid_check_model');
			return status.status === 'ready' ? [status.model_id] : [];
		} catch {
			return [];
		}
	}

	/**
	 * Generate a response from the embedded LLM.
	 *
	 * Accepts the same request shape as OllamaClient.generate() so callers
	 * don't need to change their prompt construction code.
	 */
	async generate(request: {
		prompt: string;
		system?: string;
		format?: 'json' | object;
		options?: {
			temperature?: number;
			num_predict?: number;
			top_p?: number;
			top_k?: number;
		};
	}): Promise<string> {
		return await invoke<string>('xybrid_generate', {
			prompt: request.prompt,
			systemPrompt: request.system ?? null,
			temperature: request.options?.temperature ?? 0.1,
			maxTokens: request.options?.num_predict ?? 2000,
		});
	}

	/**
	 * Verify and enhance detected entities using the embedded LLM.
	 * Same prompt logic as OllamaClient.verifyEntities().
	 */
	async verifyEntities(
		text: string,
		preliminaryEntities: DetectedEntity[],
		entityTypes: string[] = ['PERSON', 'ORG', 'EMAIL', 'PHONE', 'LOCATION', 'DATE', 'AMOUNT'],
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
				temperature: 0.1,
				num_predict: 2000,
			},
		});

		try {
			const result: LLMVerificationResult = JSON.parse(response);
			return {
				verified: result.verified || [],
				additional: result.additional || [],
				removed: result.removed || [],
			};
		} catch {
			console.error('Failed to parse Xybrid LLM response:', response);
			return {
				verified: preliminaryEntities,
				additional: [],
				removed: [],
			};
		}
	}

	/**
	 * Quick entity detection without preliminary entities.
	 * Same prompt logic as OllamaClient.detectEntities().
	 */
	async detectEntities(
		text: string,
		entityTypes: string[] = ['PERSON', 'ORG', 'EMAIL', 'PHONE', 'LOCATION', 'DATE', 'AMOUNT'],
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
		} catch {
			console.error('Failed to parse Xybrid detection response:', response);
			return [];
		}
	}

	/**
	 * No-op — xybrid has no external server config.
	 * Accepts the same shape as OllamaClient.setConfig() for compatibility.
	 */
	setConfig(_config: Partial<{ baseUrl: string; model: string; timeoutMs: number }>): void {
		// Embedded model — nothing to configure at runtime
	}

	getConfig(): { baseUrl: string; model: string; timeoutMs: number } {
		return {
			baseUrl: 'embedded',
			model: 'ministral-3-3b',
			timeoutMs: 60000,
		};
	}
}

// Export singleton instance
export const xybridClient = new XybridClient();

// Export class for custom instances
export { XybridClient };
