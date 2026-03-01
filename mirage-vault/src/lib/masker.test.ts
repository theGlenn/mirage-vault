import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mask } from './masker';
import type { Detection } from './detectors/types';

describe('mask()', () => {
	it('returns empty maskedText and no mappings for empty input', () => {
		const result = mask('', []);
		assert.equal(result.maskedText, '');
		assert.equal(result.mappings.length, 0);
	});

	it('returns original text when there are no detections', () => {
		const text = 'Hello world, no sensitive data here.';
		const result = mask(text, []);
		assert.equal(result.maskedText, text);
		assert.equal(result.mappings.length, 0);
	});

	it('masks a single entity', () => {
		const text = 'Contact me at alice@example.com please.';
		const detections: Detection[] = [
			{ type: 'EMAIL', value: 'alice@example.com', start: 14, end: 31 }
		];
		const result = mask(text, detections);
		assert.equal(result.maskedText, 'Contact me at [[EMAIL_1]] please.');
		assert.equal(result.mappings.length, 1);
		assert.equal(result.mappings[0].token, '[[EMAIL_1]]');
		assert.equal(result.mappings[0].original, 'alice@example.com');
		assert.equal(result.mappings[0].type, 'EMAIL');
	});

	it('masks multiple entities of different types', () => {
		const text = 'John Smith emailed john@acme.org about $5,000.';
		const detections: Detection[] = [
			{ type: 'PERSON', value: 'John Smith', start: 0, end: 10 },
			{ type: 'EMAIL', value: 'john@acme.org', start: 19, end: 32 },
			{ type: 'AMT', value: '$5,000', start: 39, end: 45 }
		];
		const result = mask(text, detections);
		assert.equal(result.maskedText, '[[PERSON_1]] emailed [[EMAIL_1]] about [[AMT_1]].');
		assert.equal(result.mappings.length, 3);
	});

	it('increments counter per entity type', () => {
		const text = 'alice@a.com and bob@b.com are friends.';
		const detections: Detection[] = [
			{ type: 'EMAIL', value: 'alice@a.com', start: 0, end: 11 },
			{ type: 'EMAIL', value: 'bob@b.com', start: 16, end: 25 }
		];
		const result = mask(text, detections);
		assert.equal(result.maskedText, '[[EMAIL_1]] and [[EMAIL_2]] are friends.');
		assert.equal(result.mappings[0].token, '[[EMAIL_1]]');
		assert.equal(result.mappings[1].token, '[[EMAIL_2]]');
	});

	it('reuses the same token for duplicate entity values', () => {
		const text = 'Call Alice at alice@example.com or alice@example.com.';
		const detections: Detection[] = [
			{ type: 'EMAIL', value: 'alice@example.com', start: 14, end: 31 },
			{ type: 'EMAIL', value: 'alice@example.com', start: 35, end: 52 }
		];
		const result = mask(text, detections);
		assert.equal(result.maskedText, 'Call Alice at [[EMAIL_1]] or [[EMAIL_1]].');
		// Both mappings exist but share the same token
		assert.equal(result.mappings.length, 2);
		assert.equal(result.mappings[0].token, '[[EMAIL_1]]');
		assert.equal(result.mappings[1].token, '[[EMAIL_1]]');
	});

	it('is idempotent: masking already-masked text produces same output', () => {
		const text = 'Contact me at alice@example.com please.';
		const detections: Detection[] = [
			{ type: 'EMAIL', value: 'alice@example.com', start: 14, end: 31 }
		];
		const firstPass = mask(text, detections);
		assert.equal(firstPass.maskedText, 'Contact me at [[EMAIL_1]] please.');

		// Second pass: no detections in already-masked text → no changes
		const secondPass = mask(firstPass.maskedText, []);
		assert.equal(secondPass.maskedText, firstPass.maskedText);
		assert.equal(secondPass.mappings.length, 0);
	});

	it('idempotency: detect() on masked text does not re-detect tokens', async () => {
		// Import the full detection pipeline to verify end-to-end idempotency
		const { detect } = await import('./detectors/index');

		const text = 'Email alice@example.com and call John Smith at Acme Corp.';
		const detections = detect(text);
		const firstPass = mask(text, detections);

		// Run detect on the masked output
		const secondDetections = detect(firstPass.maskedText);
		const secondPass = mask(firstPass.maskedText, secondDetections);

		// The masked text should be unchanged after a second pass
		assert.equal(secondPass.maskedText, firstPass.maskedText);
	});

	it('handles text with no entities but special characters', () => {
		const text = 'Price is about 5 dollars. Use brackets [like this].';
		const result = mask(text, []);
		assert.equal(result.maskedText, text);
	});

	it('preserves correct offsets in mappings', () => {
		const text = 'Hi John at john@x.com.';
		const detections: Detection[] = [
			{ type: 'PERSON', value: 'John', start: 3, end: 7 },
			{ type: 'EMAIL', value: 'john@x.com', start: 11, end: 21 }
		];
		const result = mask(text, detections);
		assert.equal(result.mappings[0].start, 3);
		assert.equal(result.mappings[0].end, 7);
		assert.equal(result.mappings[1].start, 11);
		assert.equal(result.mappings[1].end, 21);
	});

	it('handles detections at the very start and end of text', () => {
		const text = 'alice@test.com';
		const detections: Detection[] = [
			{ type: 'EMAIL', value: 'alice@test.com', start: 0, end: 14 }
		];
		const result = mask(text, detections);
		assert.equal(result.maskedText, '[[EMAIL_1]]');
		assert.equal(result.mappings.length, 1);
	});
});
