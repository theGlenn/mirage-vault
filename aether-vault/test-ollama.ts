/**
 * Test script for Ollama LLM integration
 * Run this to verify the LLM-assisted detection works correctly
 */

import { ollamaClient, detectWithLlm } from './src/lib/llm/index.js';

// Test 1: Check Ollama availability
console.log('Test 1: Checking Ollama availability...');
const isAvailable = await ollamaClient.isAvailable();
console.log(`  Ollama available: ${isAvailable}`);

if (!isAvailable) {
  console.error('ERROR: Ollama is not running. Please start it with: ollama serve');
  process.exit(1);
}

// Test 2: List models
console.log('\nTest 2: Listing available models...');
const models = await ollamaClient.listModels();
console.log(`  Available models: ${models.join(', ')}`);

// Test 3: Simple entity detection
console.log('\nTest 3: Testing entity detection...');
const testText = `Hello, my name is John Smith and I work at Acme Corp.
You can reach me at john.smith@acme.com or call me at +1-555-123-4567.
The project budget is $50,000 and the deadline is December 15, 2024.`;

console.log('  Input text:', testText.substring(0, 100) + '...');

const result = await detectWithLlm(testText, { useLlm: true });

console.log(`\n  Results:`);
console.log(`    LLM used: ${result.llmUsed}`);
console.log(`    Entities found: ${result.entities.length}`);
console.log(`    Timing:`);
console.log(`      Fast detection: ${result.timing.fastDetectionMs.toFixed(2)}ms`);
if (result.timing.llmVerificationMs) {
  console.log(`      LLM verification: ${result.timing.llmVerificationMs.toFixed(2)}ms`);
}
console.log(`      Total: ${result.timing.totalMs.toFixed(2)}ms`);

console.log(`\n  Detected entities:`);
for (const entity of result.entities) {
  console.log(`    - ${entity.type}: "${entity.value}" (pos ${entity.start}-${entity.end})`);
}

if (result.llmError) {
  console.error(`\n  LLM Error: ${result.llmError}`);
}

// Test 4: Verification with preliminary entities
console.log('\nTest 4: Testing entity verification...');
const preliminaryEntities = [
  { type: 'PERSON', value: 'John Smith', start: 22, end: 32 },
  { type: 'EMAIL', value: 'john.smith@acme.com', start: 74, end: 93 },
];

const verifyResult = await ollamaClient.verifyEntities(testText, preliminaryEntities);
console.log(`  Verified: ${verifyResult.verified.length}`);
console.log(`  Additional: ${verifyResult.additional.length}`);
console.log(`  Removed: ${verifyResult.removed.length}`);

console.log('\n✅ All tests completed!');
