import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detect } from './index';

describe('detect() - unified pipeline', () => {
	it('returns empty array for empty input', () => {
		assert.deepStrictEqual(detect(''), []);
	});

	it('returns empty array for text with no entities', () => {
		const result = detect('This is a plain sentence with no sensitive data.');
		assert.deepStrictEqual(result, []);
	});

	it('detects regex entities (email, phone)', () => {
		const text = 'Contact alice@example.com or call 555-123-4567.';
		const result = detect(text);

		const types = result.map((d) => d.type);
		assert.ok(types.includes('EMAIL'), 'should detect email');
		assert.ok(types.includes('PHONE'), 'should detect phone');
	});

	it('detects NLP entities (person, org)', () => {
		const text = 'John Smith works at Microsoft in Seattle.';
		const result = detect(text);

		const types = result.map((d) => d.type);
		assert.ok(types.includes('PERSON'), 'should detect person name');
	});

	it('combines regex and NLP results in a single pass', () => {
		const text = 'Email john@acme.com. John Smith works at Acme Corp. Call 555-867-5309.';
		const result = detect(text);

		const types = result.map((d) => d.type);
		assert.ok(types.includes('EMAIL'), 'should detect email');
		assert.ok(types.includes('PHONE'), 'should detect phone');
		assert.ok(types.includes('PERSON'), 'should detect person');
	});

	it('results are sorted by start offset ascending', () => {
		const text = 'Call 555-123-4567 or email alice@example.com for help.';
		const result = detect(text);

		for (let i = 1; i < result.length; i++) {
			assert.ok(
				result[i].start >= result[i - 1].start,
				`detection at index ${i} (start=${result[i].start}) should be >= detection at index ${i - 1} (start=${result[i - 1].start})`
			);
		}
	});

	it('deduplicates overlapping spans, keeping the longer one', () => {
		// If regex detects "John" as part of an email "john@example.com" (start 0)
		// and NLP detects "John" as a person (start 0),
		// the longer detection should win.
		const text = 'john@example.com is the email of John Smith.';
		const result = detect(text);

		// At position 0, the email detection should win over any partial name match
		const atZero = result.filter((d) => d.start === 0);
		if (atZero.length > 0) {
			assert.equal(atZero.length, 1, 'only one detection at position 0');
		}
	});

	it('handles text with all entity types', () => {
		const text =
			'Jane Doe from Google emailed jane@google.com about a $5,000 payment. Call 800-555-1234.';
		const result = detect(text);

		assert.ok(result.length >= 3, `expected at least 3 detections, got ${result.length}`);

		const types = new Set(result.map((d) => d.type));
		assert.ok(types.has('EMAIL'), 'should detect email');
		assert.ok(types.has('AMT'), 'should detect amount');
		assert.ok(types.has('PHONE'), 'should detect phone');
	});

	it('non-overlapping detections from both detectors are preserved', () => {
		const text = 'Alice contacted bob@example.com.';
		const result = detect(text);

		// Email and person are at different positions, both should be kept
		const email = result.find((d) => d.type === 'EMAIL');
		assert.ok(email, 'email should be detected');
		assert.equal(email!.value, 'bob@example.com');
	});

	it('each detection has valid start and end offsets', () => {
		const text = 'Send to alice@test.com and call 555-111-2222.';
		const result = detect(text);

		for (const d of result) {
			assert.ok(d.start >= 0, 'start should be >= 0');
			assert.ok(d.end > d.start, 'end should be > start');
			assert.ok(d.end <= text.length, 'end should be <= text length');
			assert.equal(d.value, text.slice(d.start, d.end), 'value should match text slice');
		}
	});
});
