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

const ENTITY_TYPE_PRIORITY = [
  'EMAIL',
  'PHONE',
  'API_KEY',
  'PERSON',
  'ORG',
  'AMT',
  'DATE',
  'LOCATION',
  'ADDRESS',
  'SSN',
  'CARD',
  'PII',
] as const;

function normalizeEntityType(type: string): string {
  const normalized = type.trim().toUpperCase();
  return OLLAMA_TYPE_ALIASES[normalized] ?? normalized;
}

type UnifiedMapping = UnifiedMaskResult['mappings'][number];

function getEntityTypeScore(type: string): number {
  const normalized = normalizeEntityType(type);
  const idx = ENTITY_TYPE_PRIORITY.indexOf(normalized as (typeof ENTITY_TYPE_PRIORITY)[number]);
  return idx === -1 ? ENTITY_TYPE_PRIORITY.length : idx;
}

function chooseBetterMapping(current: UnifiedMapping, candidate: UnifiedMapping): UnifiedMapping {
  const currentScore = getEntityTypeScore(current.type);
  const candidateScore = getEntityTypeScore(candidate.type);
  if (candidateScore < currentScore) {
    return candidate;
  }
  if (candidateScore > currentScore) {
    return current;
  }

  const currentTokenWeight = current.token ? 1 : 0;
  const candidateTokenWeight = candidate.token ? 1 : 0;
  if (candidateTokenWeight > currentTokenWeight) {
    return candidate;
  }

  const currentHashWeight = current.hash ? 1 : 0;
  const candidateHashWeight = candidate.hash ? 1 : 0;
  if (candidateHashWeight > currentHashWeight) {
    return candidate;
  }

  return current;
}

function getOriginalKey(original: string): string {
  return original.trim().toLowerCase();
}

function dedupeOllamaMappings(
  mappings: UnifiedMaskResult['mappings']
): UnifiedMaskResult['mappings'] {
  if (mappings.length === 0) {
    return mappings;
  }

  const prepared: UnifiedMapping[] = mappings.map((mapping) => {
    const type = normalizeEntityType(mapping.type);
    const hash = mapping.hash?.toLowerCase();
    return {
      ...mapping,
      hash,
      type,
      token: hash ? `[[${type}:${hash}]]` : mapping.token,
    };
  });

  // Force a single canonical type per original value.
  const canonicalTypeByOriginal = new Map<string, string>();
  for (const mapping of prepared) {
    const key = getOriginalKey(mapping.original);
    const currentType = canonicalTypeByOriginal.get(key);
    if (!currentType || getEntityTypeScore(mapping.type) < getEntityTypeScore(currentType)) {
      canonicalTypeByOriginal.set(key, mapping.type);
    }
  }

  const harmonized = prepared.map((mapping) => {
    const canonicalType = canonicalTypeByOriginal.get(getOriginalKey(mapping.original)) ?? mapping.type;
    const hash = mapping.hash;
    return {
      ...mapping,
      type: canonicalType,
      token: hash ? `[[${canonicalType}:${hash}]]` : mapping.token,
    };
  });

  // Remove duplicates that target the same exact text range/value.
  const bySpan = new Map<string, UnifiedMapping>();
  for (const mapping of harmonized) {
    const hasValidSpan = mapping.end > mapping.start;
    const spanKey = hasValidSpan
      ? `span:${mapping.start}:${mapping.end}:${getOriginalKey(mapping.original)}`
      : `value:${getOriginalKey(mapping.original)}`;
    const existing = bySpan.get(spanKey);
    if (!existing) {
      bySpan.set(spanKey, mapping);
      continue;
    }
    bySpan.set(spanKey, chooseBetterMapping(existing, mapping));
  }

  return Array.from(bySpan.values()).sort(
    (a, b) => a.start - b.start || a.end - b.end || a.original.localeCompare(b.original)
  );
}

function normalizeMaskedTextTypes(maskedText: string, mappings: UnifiedMaskResult['mappings']): string {
  const typeByHash = new Map<string, string>();
  for (const mapping of mappings) {
    if (mapping.hash) {
      typeByHash.set(mapping.hash.toLowerCase(), mapping.type);
    }
  }

  if (typeByHash.size === 0) {
    return maskedText;
  }

  return maskedText.replace(/\[\[([A-Z_]+):([A-Za-z0-9]+)\]\]/g, (fullToken, _type, rawHash) => {
    const hash = String(rawHash).toLowerCase();
    const canonicalType = typeByHash.get(hash);
    return canonicalType ? `[[${canonicalType}:${hash}]]` : fullToken;
  });
}

interface MaskTokenMatch {
  type: string;
  hash: string;
  token: string;
}

function extractMaskTokenMatches(maskedText: string): MaskTokenMatch[] {
  const matches: MaskTokenMatch[] = [];
  const tokenPattern = /\[\[([A-Z_]+):([A-Za-z0-9]+)\]\]/g;

  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(maskedText)) !== null) {
    const [, type, rawHash] = match;
    if (!rawHash) continue;
    const hash = rawHash.toLowerCase();
    const normalizedType = normalizeEntityType(type);
    matches.push({
      type: normalizedType,
      hash,
      token: `[[${normalizedType}:${hash}]]`,
    });
  }

  return matches;
}

function extractEntityTypesByHash(maskedText: string): Map<string, string> {
  const typesByHash = new Map<string, string>();
  for (const match of extractMaskTokenMatches(maskedText)) {
    typesByHash.set(match.hash, match.type);
  }

  return typesByHash;
}

function buildFallbackMaskedText(
  text: string,
  originalsByHash: Map<string, string>,
  typesByHash: Map<string, string>
): string {
  let maskedText = text;
  const replacements = Array.from(originalsByHash.entries())
    .filter(([, original]) => original.length > 0)
    .sort((a, b) => b[1].length - a[1].length);

  for (const [hash, original] of replacements) {
    const type = typesByHash.get(hash) ?? 'PII';
    const token = `[[${type}:${hash}]]`;
    maskedText = maskedText.split(original).join(token);
  }

  return maskedText;
}

function buildOllamaMappings(
  originalText: string,
  maskedText: string,
  originalsByHash: Map<string, string>
): UnifiedMaskResult['mappings'] {
  const tokenMatches = extractMaskTokenMatches(maskedText);
  const mappings: UnifiedMaskResult['mappings'] = [];
  const nextSearchStartByValue = new Map<string, number>();

  for (const tokenMatch of tokenMatches) {
    const original = originalsByHash.get(tokenMatch.hash);
    if (!original) continue;

    const searchStart = nextSearchStartByValue.get(original) ?? 0;
    let start = originalText.indexOf(original, searchStart);
    if (start === -1) {
      start = originalText.indexOf(original);
    }
    const end = start === -1 ? 0 : start + original.length;

    if (start !== -1) {
      nextSearchStartByValue.set(original, end);
    }

    mappings.push({
      hash: tokenMatch.hash,
      token: tokenMatch.token,
      original,
      type: tokenMatch.type,
      start: start === -1 ? 0 : start,
      end,
    });
  }

  if (mappings.length > 0) {
    return mappings;
  }

  return Array.from(originalsByHash.entries()).map(([hash, original]) => {
    const start = originalText.indexOf(original);
    return {
      hash,
      token: `[[PII:${hash}]]`,
      original,
      type: 'PII',
      start: start === -1 ? 0 : start,
      end: start === -1 ? 0 : start + original.length,
    };
  });
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
  
  const llmResult = await maskWithLlm(text, config.ollama.useJsonFormat);

  const originalsByHash = new Map<string, string>();
  for (const [hash, original] of llmResult.mappings.entries()) {
    if (!hash || !original) continue;
    originalsByHash.set(hash.toLowerCase(), original);
  }

  let maskedText = llmResult.maskedText;
  let typesByHash = extractEntityTypesByHash(maskedText);

  // Some models return mappings but fail to apply replacements in masked_text.
  if (typesByHash.size === 0 && originalsByHash.size > 0) {
    maskedText = buildFallbackMaskedText(text, originalsByHash, typesByHash);
    typesByHash = extractEntityTypesByHash(maskedText);
  }

  const mappings = dedupeOllamaMappings(
    buildOllamaMappings(text, maskedText, originalsByHash)
  );
  const normalizedMaskedText = normalizeMaskedTextTypes(maskedText, mappings);
  
  return {
    maskedText: normalizedMaskedText,
    mappings,
    strategy: 'ollama',
    timing: {
      totalMs: performance.now() - startTime,
      llmMs: llmResult.metadata.durationMs,
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
