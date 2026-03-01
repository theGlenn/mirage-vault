/**
 * Test script for hash-based LLM masking
 * Tests different models and formats to find the best approach
 */

import { maskWithLlm, testModelFormat, rehydrateWithHashes } from './src/lib/llm/hashMasking.js';
import { ollamaClient } from './src/lib/llm/ollama.js';

const TEST_TEXT = `Hello,

My name is Sarah Johnson and I'm the CTO at TechCorp International.
You can reach me at sarah.johnson@techcorp.com or on my mobile +1-415-555-0199.

Our office is located at 123 Innovation Drive, San Francisco, CA 94105.
The project budget is $250,000 and we need it completed by March 15, 2024.

My assistant Michael Chen (michael.chen@techcorp.com) will be handling the day-to-day coordination.
His direct line is (415) 555-0234.

Best regards,
Sarah Johnson
CTO, TechCorp International`;

console.log('=== Hash-Based LLM Masking Test ===\n');

// Test 1: Check Ollama availability
console.log('Test 1: Checking Ollama availability...');
const isAvailable = await ollamaClient.isAvailable();
console.log(`  Available: ${isAvailable}`);

if (!isAvailable) {
  console.error('ERROR: Ollama not running');
  process.exit(1);
}

// Get available models
const models = await ollamaClient.listModels();
console.log(`  Models: ${models.join(', ')}`);

// Test 2: Try simple format with ministral
console.log('\nTest 2: Testing simple format with ministral-3:3b...');
try {
  const result = await maskWithLlm(TEST_TEXT, false);
  console.log(`  Duration: ${result.metadata.durationMs.toFixed(2)}ms`);
  console.log(`  Entities masked: ${result.mappings.size}`);
  console.log(`  Mappings:`);
  for (const [hash, original] of result.mappings.entries()) {
    console.log(`    ${hash} -> "${original}"`);
  }
  console.log(`\n  Masked text preview:`);
  console.log(`    ${result.maskedText.substring(0, 200)}...`);
  
  // Test rehydration
  const rehydrated = rehydrateWithHashes(result.maskedText, result.mappings);
  console.log(`\n  Rehydration test: ${rehydrated === TEST_TEXT ? '✅ PASS' : '❌ FAIL'}`);
} catch (error) {
  console.error(`  Error: ${error}`);
}

// Test 3: Try JSON format
console.log('\nTest 3: Testing JSON format with ministral-3:3b...');
try {
  ollamaClient.setConfig({ model: 'ministral-3:3b' });
  const result = await maskWithLlm(TEST_TEXT, true);
  console.log(`  Duration: ${result.metadata.durationMs.toFixed(2)}ms`);
  console.log(`  Entities masked: ${result.mappings.size}`);
  console.log(`  Masked text preview:`);
  console.log(`    ${result.maskedText.substring(0, 200)}...`);
} catch (error) {
  console.error(`  Error: ${error}`);
}

// Test 4: If other models available, compare
if (models.length > 1) {
  console.log('\nTest 4: Comparing models...');
  for (const model of models) {
    if (model === 'ministral-3:3b') continue;
    
    console.log(`\n  Testing ${model}...`);
    const result = await testModelFormat(TEST_TEXT, model);
    console.log(`    Success: ${result.success}`);
    console.log(`    Format: ${result.format}`);
    console.log(`    Duration: ${result.durationMs.toFixed(2)}ms`);
    console.log(`    Entities: ${result.entityCount}`);
  }
}

console.log('\n=== Test Complete ===');
