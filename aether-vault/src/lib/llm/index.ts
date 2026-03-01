/**
 * LLM-Assisted Detection Module
 * 
 * Provides LLM-enhanced entity detection using local Ollama.
 * 
 * Usage:
 * ```typescript
 * import { detectWithLlm, isLlmAvailable } from '$lib/llm';
 * 
 * // Check if LLM is available
 * const available = await isLlmAvailable();
 * 
 * // Detect with LLM assistance
 * const result = await detectWithLlm(text, { useLlm: true });
 * console.log(result.entities); // Final entity list
 * console.log(result.llmUsed);  // Whether LLM was actually used
 * console.log(result.timing);   // Performance metrics
 * ```
 */

export {
  // Core detection functions
  detectWithLlm,
  detectWithLlmOnly,
  isLlmAvailable,
  getAvailableModels,
} from './detector';

export {
  // Client for advanced usage
  ollamaClient,
  OllamaClient,
} from './ollama';

export type {
  // Types
  DetectedEntity,
  LLMVerificationResult,
  OllamaConfig,
  OllamaGenerateRequest,
  OllamaGenerateResponse,
  DetectionOptions,
  HybridDetectionResult,
} from './detector';
