/**
 * Unified Masking Module
 * 
 * Provides a single interface for masking that switches between:
 * - NLP (fast, local)
 * - Ollama LLM (thorough, slower)
 * - Hybrid (NLP + LLM refinement)
 */

import { detect } from './detectors';
import { mask } from './masker';
import { maskWithLlm } from './llm/hashMasking';
import { ollamaClient } from './llm/ollama';
import { maskingConfig, getEffectiveStrategy } from './stores/maskingConfig';
import { get } from 'svelte/store';
import type { StrategyConfig } from './stores/maskingConfig';
import type { EntityType } from './detectors/types';

export interface UnifiedMaskResult {
  maskedText: string;
  mappings: Array<{
    hash?: string;
    token?: string;
    original: string;
    type: string;
    start: number;
    end: number;
  }>;
  strategy: 'nlp' | 'ollama' | 'hybrid';
  timing: {
    totalMs: number;
    nlpMs?: number;
    llmMs?: number;
  };
}

const OLLAMA_TYPE_ALIASES: Record<string, string> = {
  AMOUNT: 'AMT',
  MONEY: 'AMT',
  ORGANIZATION: 'ORG',
  COMPANY: 'ORG',
};

function normalizeEntityType(type: string): string {
  const normalized = type.trim().toUpperCase();
  return OLLAMA_TYPE_ALIASES[normalized] ?? normalized;
}

function extractEntityTypesByHash(maskedText: string): Map<string, string> {
  const typesByHash = new Map<string, string>();
  const tokenPattern = /\[\[([A-Z_]+):([a-z0-9]+)\]\]/gi;

  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(maskedText)) !== null) {
    const [, type, hash] = match;
    if (!hash) continue;
    typesByHash.set(hash.toLowerCase(), normalizeEntityType(type));
  }

  return typesByHash;
}

/**
 * Main masking function - uses configured strategy
 */
export async function maskWithStrategy(text: string): Promise<UnifiedMaskResult> {
  const config = get(maskingConfig);
  const effective = getEffectiveStrategy(config);
  
  // Strategy: Ollama (full LLM masking)
  if (effective.primary === 'ollama') {
    return await maskWithOllama(text, config);
  }
  
  // Strategy: NLP with optional LLM refinement
  if (effective.useLlm) {
    return await maskWithHybrid(text, config);
  }
  
  // Strategy: NLP only
  return await maskWithNlp(text);
}

/**
 * Pure NLP masking (fast)
 */
async function maskWithNlp(text: string): Promise<UnifiedMaskResult> {
  const startTime = performance.now();
  
  const detections = detect(text);
  const result = mask(text, detections);
  
  const mappings = result.mappings.map(m => ({
    hash: m.hash,
    token: m.token,
    original: m.original,
    type: m.type,
    start: m.start,
    end: m.end,
  }));
  
  return {
    maskedText: result.maskedText,
    mappings,
    strategy: 'nlp',
    timing: {
      totalMs: performance.now() - startTime,
    },
  };
}

/**
 * Pure Ollama masking (thorough)
 * Falls back to NLP if Ollama is unavailable
 */
async function maskWithOllama(
  text: string, 
  config: StrategyConfig
): Promise<UnifiedMaskResult> {
  const startTime = performance.now();
  
  // Apply full Ollama config
  ollamaClient.setConfig({
    baseUrl: config.ollama.baseUrl,
    model: config.ollama.model,
    timeoutMs: config.ollama.timeoutMs,
  });
  
  // Check if Ollama is available
  const available = await ollamaClient.isAvailable();
  
  if (!available) {
    console.warn('Ollama is not available, falling back to NLP masking');
    return await maskWithNlp(text);
  }
  
  const result = await maskWithLlm(text, config.ollama.useJsonFormat);
  const typesByHash = extractEntityTypesByHash(result.maskedText);
  
  const mappings = Array.from(result.mappings.entries()).map(([hash, original]) => ({
    hash,
    original,
    type: typesByHash.get(hash.toLowerCase()) ?? 'PII',
    start: 0,
    end: 0,
  }));
  
  return {
    maskedText: result.maskedText,
    mappings,
    strategy: 'ollama',
    timing: {
      totalMs: performance.now() - startTime,
      llmMs: result.metadata.durationMs,
    },
  };
}

/**
 * Hybrid: NLP first, then LLM refinement
 */
async function maskWithHybrid(
  text: string,
  config: StrategyConfig
): Promise<UnifiedMaskResult> {
  const totalStart = performance.now();
  
  // Step 1: Fast NLP detection
  const nlpStart = performance.now();
  const detections = detect(text);
  mask(text, detections);
  const nlpMs = performance.now() - nlpStart;
  
  // Convert NLP result to format for LLM refinement
  const preliminaryEntities = detections.map(d => ({
    type: d.type,
    value: d.value,
    start: d.start,
    end: d.end,
  }));
  
  // Apply full Ollama config
  ollamaClient.setConfig({
    baseUrl: config.ollama.baseUrl,
    model: config.ollama.model,
    timeoutMs: config.ollama.timeoutMs,
  });
  
  // Step 2: LLM verification and enhancement
  const { detectWithLlm } = await import('./llm/detector');
  const llmStart = performance.now();
  
  const llmResult = await detectWithLlm(text, {
    useLlm: true,
    llmModel: config.ollama.model,
  });
  
  const llmMs = performance.now() - llmStart;
  
  // Use LLM entities if available, fall back to NLP
  const finalEntities = llmResult.llmUsed && llmResult.entities.length > 0
    ? llmResult.entities
    : preliminaryEntities;
  
  // Remask with final entity set
  // Map entities to Detection format (type needs to be EntityType)
  const finalMask = mask(text, finalEntities.map(e => ({
    type: e.type as EntityType,
    value: e.value,
    start: e.start,
    end: e.end,
  })));
  
  const mappings = finalMask.mappings.map(m => ({
    hash: m.hash,
    token: m.token,
    original: m.original,
    type: m.type,
    start: m.start,
    end: m.end,
  }));
  
  return {
    maskedText: finalMask.maskedText,
    mappings,
    strategy: 'hybrid',
    timing: {
      totalMs: performance.now() - totalStart,
      nlpMs,
      llmMs,
    },
  };
}

/**
 * Get current masking strategy info for display
 */
export function getCurrentStrategyInfo(): {
  name: string;
  description: string;
  icon: string;
} {
  const config = get(maskingConfig);
  const effective = getEffectiveStrategy(config);
  
  if (effective.primary === 'ollama') {
    return {
      name: 'Ollama LLM',
      description: 'Comprehensive LLM-based detection',
      icon: '🧠',
    };
  }
  
  if (effective.useLlm) {
    return {
      name: 'Hybrid (NLP + LLM)',
      description: 'Fast detection with LLM refinement',
      icon: '⚡🧠',
    };
  }
  
  return {
    name: 'NLP Only',
    description: 'Fast local detection',
    icon: '⚡',
  };
}
