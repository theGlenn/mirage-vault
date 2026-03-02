/**
 * LLM-Assisted Entity Detection
 * 
 * Hybrid approach: Fast detectors (regex/NLP) + LLM refinement
 * The LLM verifies preliminary entities and finds additional ones.
 */

import { detect } from '../detectors';
import { ollamaClient, type DetectedEntity, type LLMVerificationResult } from './ollama';

export interface DetectionOptions {
  useLlm: boolean;
  llmModel?: string;
  entityTypes?: string[];
}

/** Minimal interface for LLM clients used by detection functions */
type LlmDetectorClient = {
  isAvailable(): Promise<boolean>;
  setConfig(config: Partial<{ model: string }>): void;
  verifyEntities(
    text: string,
    entities: DetectedEntity[],
    entityTypes?: string[],
  ): Promise<LLMVerificationResult>;
  detectEntities(text: string, entityTypes?: string[]): Promise<DetectedEntity[]>;
  listModels(): Promise<string[]>;
};

export interface HybridDetectionResult {
  entities: DetectedEntity[];
  llmUsed: boolean;
  llmError?: string;
  timing: {
    fastDetectionMs: number;
    llmVerificationMs?: number;
    totalMs: number;
  };
}

const DEFAULT_OPTIONS: DetectionOptions = {
  useLlm: false,
  entityTypes: ['PERSON', 'ORG', 'EMAIL', 'PHONE', 'LOCATION', 'DATE', 'AMOUNT'],
};

/**
 * Convert detector results to LLM entity format
 */
function convertToLlmEntities(detections: ReturnType<typeof detect>): DetectedEntity[] {
  return detections.map(d => ({
    type: d.type,
    value: d.value,
    start: d.start,
    end: d.end,
  }));
}

/**
 * Merge LLM verification results into final entity list
 * 
 * Strategy:
 * 1. Keep verified entities
 * 2. Add additional entities found by LLM
 * 3. Remove false positives flagged by LLM
 * 4. Deduplicate by position
 */
function mergeEntities(
  preliminary: DetectedEntity[],
  llmResult: LLMVerificationResult
): DetectedEntity[] {
  // Start with verified entities
  const merged = [...llmResult.verified];
  
  // Add additional entities, avoiding duplicates
  for (const additional of llmResult.additional) {
    const isDuplicate = merged.some(e => 
      e.start === additional.start && e.end === additional.end
    );
    if (!isDuplicate) {
      merged.push(additional);
    }
  }
  
  // Remove false positives (by value match)
  const removedSet = new Set(llmResult.removed.map(r => r.toLowerCase()));
  const filtered = merged.filter(e => !removedSet.has(e.value.toLowerCase()));
  
  // Sort by position
  filtered.sort((a, b) => a.start - b.start);
  
  // Remove overlapping entities (prefer longer matches)
  const nonOverlapping: DetectedEntity[] = [];
  for (const entity of filtered) {
    const overlaps = nonOverlapping.some(e => 
      (entity.start < e.end && entity.end > e.start)
    );
    if (!overlaps) {
      nonOverlapping.push(entity);
    }
  }
  
  return nonOverlapping;
}

/**
 * Hybrid detection: Fast pass + optional LLM verification
 * 
 * This is the main entry point for LLM-assisted detection.
 * 
 * Flow:
 * 1. Run fast detectors (regex + compromise.js)
 * 2. If LLM is enabled and available:
 *    - Send preliminary entities to LLM for verification
 *    - Merge verified + additional entities
 * 3. Return final entity list
 */
export async function detectWithLlm(
  text: string,
  options: Partial<DetectionOptions> = {},
  client: LlmDetectorClient = ollamaClient
): Promise<HybridDetectionResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = performance.now();

  // Step 1: Fast detection
  const fastStart = performance.now();
  const preliminaryDetections = detect(text);
  const preliminaryEntities = convertToLlmEntities(preliminaryDetections);
  const fastDuration = performance.now() - fastStart;

  // If LLM is disabled, return fast results only
  if (!opts.useLlm) {
    return {
      entities: preliminaryEntities,
      llmUsed: false,
      timing: {
        fastDetectionMs: fastDuration,
        totalMs: performance.now() - startTime,
      },
    };
  }

  // Step 2: LLM verification
  const llmStart = performance.now();

  try {
    // Check if LLM is available
    const isAvailable = await client.isAvailable();
    if (!isAvailable) {
      return {
        entities: preliminaryEntities,
        llmUsed: false,
        llmError: 'LLM backend is not running or not accessible',
        timing: {
          fastDetectionMs: fastDuration,
          totalMs: performance.now() - startTime,
        },
      };
    }

    // Configure model if specified
    if (opts.llmModel) {
      client.setConfig({ model: opts.llmModel });
    }

    // Run LLM verification
    const llmResult = await client.verifyEntities(
      text,
      preliminaryEntities,
      opts.entityTypes
    );
    
    const llmDuration = performance.now() - llmStart;
    
    // Merge results
    const finalEntities = mergeEntities(preliminaryEntities, llmResult);
    
    return {
      entities: finalEntities,
      llmUsed: true,
      timing: {
        fastDetectionMs: fastDuration,
        llmVerificationMs: llmDuration,
        totalMs: performance.now() - startTime,
      },
    };
    
  } catch (error) {
    const llmDuration = performance.now() - llmStart;
    console.error('LLM verification failed:', error);
    
    // Fallback to fast detection
    return {
      entities: preliminaryEntities,
      llmUsed: false,
      llmError: error instanceof Error ? error.message : 'Unknown LLM error',
      timing: {
        fastDetectionMs: fastDuration,
        llmVerificationMs: llmDuration,
        totalMs: performance.now() - startTime,
      },
    };
  }
}

/**
 * Quick LLM-only detection (no fast pass)
 * Useful for getting a "second opinion" or when fast detectors are disabled
 */
export async function detectWithLlmOnly(
  text: string,
  options: Partial<Omit<DetectionOptions, 'useLlm'>> = {},
  client: LlmDetectorClient = ollamaClient
): Promise<HybridDetectionResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options, useLlm: true };
  const startTime = performance.now();

  try {
    const isAvailable = await client.isAvailable();
    if (!isAvailable) {
      return {
        entities: [],
        llmUsed: false,
        llmError: 'LLM backend is not running or not accessible',
        timing: {
          fastDetectionMs: 0,
          totalMs: performance.now() - startTime,
        },
      };
    }

    if (opts.llmModel) {
      client.setConfig({ model: opts.llmModel });
    }

    const llmStart = performance.now();
    const entities = await client.detectEntities(text, opts.entityTypes);
    const llmDuration = performance.now() - llmStart;
    
    return {
      entities,
      llmUsed: true,
      timing: {
        fastDetectionMs: 0,
        llmVerificationMs: llmDuration,
        totalMs: performance.now() - startTime,
      },
    };
    
  } catch (error) {
    return {
      entities: [],
      llmUsed: false,
      llmError: error instanceof Error ? error.message : 'Unknown LLM error',
      timing: {
        fastDetectionMs: 0,
        totalMs: performance.now() - startTime,
      },
    };
  }
}

/**
 * Check if LLM is available for use
 */
export async function isLlmAvailable(): Promise<boolean> {
  return ollamaClient.isAvailable();
}

/**
 * Get list of available LLM models
 */
export async function getAvailableModels(): Promise<string[]> {
  return ollamaClient.listModels();
}

// Re-export types
export type { DetectedEntity, LLMVerificationResult } from './ollama';
