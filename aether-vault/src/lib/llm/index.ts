/**
 * LLM-Assisted Detection Module
 * 
 * Provides LLM-enhanced entity detection and hash-based masking using local Ollama.
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
 * 
 * // Hash-based masking (Ollama does the masking)
 * import { maskWithLlm, rehydrateWithHashes } from '$lib/llm/hashMasking';
 * const masked = await maskWithLlm(text);
 * console.log(masked.maskedText);  // Text with [[TYPE:HASH]]
 * console.log(masked.mappings);    // Map of hash -> original
 * const rehydrated = rehydrateWithHashes(masked.maskedText, masked.mappings);
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

export {
  // Hash-based masking (new approach)
  maskWithLlm,
  rehydrateWithHashes,
  validateHashMapping,
  testModelFormat,
} from './hashMasking';

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

export type {
  // Hash masking types
  HashMaskingResult,
  HashMapping,
} from './hashMasking';
