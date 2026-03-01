/**
 * LLM-Based Hash Masking
 * 
 * Uses Ollama to mask documents and generate hash-based mappings.
 * Each masked entity gets a unique hash that maps back to the original.
 */

import { ollamaClient } from './ollama';

export interface HashMaskingResult {
  maskedText: string;
  mappings: Map<string, string>; // hash -> original
  metadata: {
    model: string;
    durationMs: number;
    entitiesMasked: number;
  };
}

export interface HashMapping {
  hash: string;
  original: string;
  type: string; // entity type (PERSON, EMAIL, etc.)
  position?: { start: number; end: number };
}

/**
 * Generate a short unique hash from text
 * Uses first 8 chars of SHA-256 for readability
 */
function generateHash(text: string): string {
  // Simple hash function for demo - in production use crypto.subtle
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Convert to positive hex string, take first 8 chars
  return Math.abs(hash).toString(16).padStart(8, '0').substring(0, 8);
}

/**
 * Prompt for hash-based masking
 * 
 * This prompt instructs the LLM to:
 * 1. Identify all PII in the text
 * 2. Replace each PII with [[TYPE:HASH]] format
 * 3. Return a JSON mapping of HASH -> original value
 */
const MASKING_PROMPT = `You are a PII (Personally Identifiable Information) masking system.

TASK: Mask all sensitive information in the provided text.

INSTRUCTIONS:
1. Identify ALL PII including: names, emails, phone numbers, addresses, dates of birth, SSNs, credit cards, company names, locations, amounts of money
2. For each PII found:
   - Generate a unique 8-character hash (alphanumeric)
   - Replace the PII with [[TYPE:HASH]] where TYPE is the entity type
   - Entity types: PERSON, EMAIL, PHONE, ADDRESS, DATE, SSN, CARD, ORG, LOCATION, AMOUNT
3. Return ONLY a JSON object in this exact format:

{
  "masked_text": "the full text with [[TYPE:HASH]] replacements",
  "mappings": [
    {"hash": "abc123de", "original": "John Smith", "type": "PERSON"},
    {"hash": "fgh456ij", "original": "john@email.com", "type": "EMAIL"}
  ]
}

RULES:
- Generate UNIQUE hashes for each entity (use text content + position if needed)
- Preserve all non-PII text exactly as-is
- The masked_text must be reconstructable using the mappings
- Include ALL detected entities in the mappings array
- Hashes should be 8 characters: a-z, 0-9

EXAMPLE:
Input: "Contact John Smith at john.smith@acme.com or call +1-555-123-4567"
Output:
{
  "masked_text": "Contact [[PERSON:a3f7b2d1]] at [[EMAIL:e8c9a4f2]] or call [[PHONE:b5d8e1a7]]",
  "mappings": [
    {"hash": "a3f7b2d1", "original": "John Smith", "type": "PERSON"},
    {"hash": "e8c9a4f2", "original": "john.smith@acme.com", "type": "EMAIL"},
    {"hash": "b5d8e1a7", "original": "+1-555-123-4567", "type": "PHONE"}
  ]
}`;

/**
 * Alternative prompt using simpler format for smaller models
 * Returns text with embedded mapping comments that we parse
 */
const SIMPLE_MASKING_PROMPT = `You are a PII masking system. Mask all sensitive info.

Replace each PII with: [[TYPE:HASH|original_value]]

TYPES: PERSON, EMAIL, PHONE, ADDRESS, DATE, ORG, LOCATION, AMOUNT
HASH: Generate unique 8-char alphanumeric (e.g., a3f7b2d1)

Format: [[TYPE:HASH|original]]

EXAMPLE:
Input: "John Smith emailed john@email.com"
Output: "[[PERSON:a3f7b2d1|John Smith]] emailed [[EMAIL:e8c9a4f2|john@email.com]]"

RULES:
- Use the EXACT format: [[TYPE:HASH|original]]
- Hash must be unique per entity
- Preserve all other text exactly
- Do not add explanations, only return the masked text

MASK THIS TEXT:`;

/**
 * Parse simple format [[TYPE:HASH|original]] from LLM output
 */
function parseSimpleFormat(text: string): HashMaskingResult {
  const mappings = new Map<string, string>();
  const hashMappings: HashMapping[] = [];
  
  // Regex to find [[TYPE:HASH|original]]
  const pattern = /\[\[([A-Z]+):([a-z0-9]{8})\|([^\]]+)\]\]/g;
  
  let maskedText = text;
  let match;
  
  while ((match = pattern.exec(text)) !== null) {
    const [fullMatch, type, hash, original] = match;
    mappings.set(hash, original);
    hashMappings.push({
      hash,
      original,
      type,
    });
    // Replace with [[TYPE:HASH]] for clean output
    maskedText = maskedText.replace(fullMatch, `[[${type}:${hash}]]`);
  }
  
  return {
    maskedText,
    mappings,
    metadata: {
      model: '',
      durationMs: 0,
      entitiesMasked: mappings.size,
    },
  };
}

/**
 * Parse JSON format from LLM output
 */
function parseJsonFormat(jsonText: string): HashMaskingResult {
  try {
    const parsed = JSON.parse(jsonText);
    const mappings = new Map<string, string>();
    
    if (parsed.mappings && Array.isArray(parsed.mappings)) {
      for (const mapping of parsed.mappings) {
        if (mapping.hash && mapping.original) {
          mappings.set(mapping.hash, mapping.original);
        }
      }
    }
    
    return {
      maskedText: parsed.masked_text || parsed.maskedText || '',
      mappings,
      metadata: {
        model: '',
        durationMs: 0,
        entitiesMasked: mappings.size,
      },
    };
  } catch (error) {
    console.error('Failed to parse JSON format:', error);
    // Try simple format as fallback
    return parseSimpleFormat(jsonText);
  }
}

/**
 * Mask text using LLM with hash-based mappings
 * 
 * @param text - Original text to mask
 * @param useJsonFormat - Whether to use JSON format (better for large models) or simple format (better for small models)
 */
export async function maskWithLlm(
  text: string,
  useJsonFormat: boolean = false
): Promise<HashMaskingResult> {
  const startTime = performance.now();
  
  const prompt = useJsonFormat 
    ? `${MASKING_PROMPT}\n\nTEXT TO MASK:\n${text}`
    : `${SIMPLE_MASKING_PROMPT}\n${text}`;
  
  const response = await ollamaClient.generate({
    system: useJsonFormat 
      ? 'You are a PII masking system. Return only valid JSON.'
      : undefined,
    prompt,
    format: useJsonFormat ? 'json' : undefined,
    options: {
      temperature: 0.1,
      num_predict: text.length * 2, // Estimate based on input length
    },
  });
  
  const durationMs = performance.now() - startTime;
  
  // Parse the response
  const result = useJsonFormat 
    ? parseJsonFormat(response)
    : parseSimpleFormat(response);
  
  result.metadata.durationMs = durationMs;
  result.metadata.model = ollamaClient.getConfig().model;
  
  return result;
}

/**
 * Rehydrate masked text using hash mappings
 * 
 * @param maskedText - Text with [[TYPE:HASH]] placeholders
 * @param mappings - Map of hash -> original value
 */
export function rehydrateWithHashes(
  maskedText: string,
  mappings: Map<string, string>
): string {
  let rehydrated = maskedText;
  
  // Find all [[TYPE:HASH]] patterns and replace with original
  const pattern = /\[\[[A-Z]+:([a-z0-9]{8})\]\]/g;
  
  rehydrated = rehydrated.replace(pattern, (match, hash) => {
    const original = mappings.get(hash);
    return original || match; // Return original if found, else keep hash
  });
  
  return rehydrated;
}

/**
 * Validate that a hash mapping is complete
 * (all hashes in text have corresponding mappings)
 */
export function validateHashMapping(
  maskedText: string,
  mappings: Map<string, string>
): { valid: boolean; missingHashes: string[] } {
  const pattern = /\[\[[A-Z]+:([a-z0-9]{8})\]\]/g;
  const missingHashes: string[] = [];
  
  let match;
  while ((match = pattern.exec(maskedText)) !== null) {
    const hash = match[1];
    if (!mappings.has(hash)) {
      missingHashes.push(hash);
    }
  }
  
  return {
    valid: missingHashes.length === 0,
    missingHashes,
  };
}

/**
 * Test different models to find best output format
 */
export async function testModelFormat(
  text: string,
  model: string
): Promise<{
  model: string;
  success: boolean;
  format: 'json' | 'simple';
  durationMs: number;
  entityCount: number;
  sample: string;
}> {
  const startTime = performance.now();
  
  try {
    ollamaClient.setConfig({ model });
    
    // Try JSON format first
    let result = await maskWithLlm(text, true);
    let format: 'json' | 'simple' = 'json';
    
    // If JSON fails (no entities detected), try simple format
    if (result.mappings.size === 0) {
      result = await maskWithLlm(text, false);
      format = 'simple';
    }
    
    const durationMs = performance.now() - startTime;
    
    return {
      model,
      success: result.mappings.size > 0,
      format,
      durationMs,
      entityCount: result.mappings.size,
      sample: result.maskedText.substring(0, 200),
    };
  } catch (error) {
    return {
      model,
      success: false,
      format: 'json',
      durationMs: performance.now() - startTime,
      entityCount: 0,
      sample: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
