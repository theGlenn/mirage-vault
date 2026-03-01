import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { maskWithLlm } from './hashMasking';
import { ollamaClient } from './ollama';

type GenerateFn = typeof ollamaClient.generate;

function collectHashes(maskedText: string, type: string): string[] {
  const pattern = new RegExp(`\\[\\[${type}:([a-z0-9]{8})\\]\\]`, 'g');
  const matches = [...maskedText.matchAll(pattern)];
  return matches.map((m) => m[1]);
}

describe('maskWithLlm() hash normalization', () => {
  it('reuses a single hash for duplicate originals in JSON mode', async () => {
    const originalGenerate = ollamaClient.generate;

    (ollamaClient as { generate: GenerateFn }).generate = async () =>
      JSON.stringify({
        masked_text: 'Contact [[PERSON:aaaabbbb]] and [[PERSON:ccccdddd]]',
        mappings: [
          { hash: 'aaaabbbb', original: 'John Smith', type: 'PERSON' },
          { hash: 'ccccdddd', original: 'John Smith', type: 'PERSON' },
        ],
      });

    try {
      const result = await maskWithLlm('Contact John Smith and John Smith', true);
      const hashes = collectHashes(result.maskedText, 'PERSON');

      assert.equal(hashes.length, 2);
      assert.equal(hashes[0], hashes[1], 'duplicate values should share one hash');
      assert.equal(result.mappings.size, 1);
      assert.equal(result.mappings.get(hashes[0]), 'John Smith');
    } finally {
      (ollamaClient as { generate: GenerateFn }).generate = originalGenerate;
    }
  });

  it('reuses a single hash for duplicate originals in simple mode', async () => {
    const originalGenerate = ollamaClient.generate;

    (ollamaClient as { generate: GenerateFn }).generate = async () =>
      '[[PERSON:11111111|Alice Doe]] met [[PERSON:22222222|Alice Doe]]';

    try {
      const result = await maskWithLlm('Alice Doe met Alice Doe', false);
      const hashes = collectHashes(result.maskedText, 'PERSON');

      assert.equal(hashes.length, 2);
      assert.equal(hashes[0], hashes[1], 'duplicate values should share one hash');
      assert.equal(result.mappings.size, 1);
      assert.equal(result.mappings.get(hashes[0]), 'Alice Doe');
    } finally {
      (ollamaClient as { generate: GenerateFn }).generate = originalGenerate;
    }
  });
});
