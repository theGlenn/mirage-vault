import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectRegex } from './regex.js';

describe('detectRegex', () => {
	describe('EMAIL detection', () => {
		it('detects simple email addresses', () => {
			const results = detectRegex('Contact us at alice@example.com for details.');
			assert.equal(results.length, 1);
			assert.equal(results[0].type, 'EMAIL');
			assert.equal(results[0].value, 'alice@example.com');
			assert.equal(results[0].start, 14);
			assert.equal(results[0].end, 31);
		});

		it('detects multiple emails', () => {
			const results = detectRegex('bob@test.org and carol@domain.co.uk');
			assert.equal(results.length, 2);
			assert.equal(results[0].value, 'bob@test.org');
			assert.equal(results[1].value, 'carol@domain.co.uk');
		});

		it('detects emails with plus addressing', () => {
			const results = detectRegex('Send to user+tag@gmail.com');
			assert.equal(results.length, 1);
			assert.equal(results[0].value, 'user+tag@gmail.com');
		});

		it('does not match non-email text', () => {
			const results = detectRegex('This is just a regular sentence with no PII.');
			const emails = results.filter((r) => r.type === 'EMAIL');
			assert.equal(emails.length, 0);
		});
	});

	describe('PHONE detection', () => {
		it('detects US phone numbers with dashes', () => {
			const results = detectRegex('Call me at 555-123-4567.');
			const phones = results.filter((r) => r.type === 'PHONE');
			assert.equal(phones.length, 1);
			assert.equal(phones[0].value.replace(/\D/g, ''), '5551234567');
		});

		it('detects phone numbers with parentheses', () => {
			const results = detectRegex('Phone: (212) 555-0199');
			const phones = results.filter((r) => r.type === 'PHONE');
			assert.equal(phones.length, 1);
		});

		it('detects international phone with country code', () => {
			const results = detectRegex('Reach me at +1 415-555-2671');
			const phones = results.filter((r) => r.type === 'PHONE');
			assert.equal(phones.length, 1);
		});

		it('does not match short number sequences', () => {
			const results = detectRegex('Order #12345 was placed.');
			const phones = results.filter((r) => r.type === 'PHONE');
			assert.equal(phones.length, 0);
		});
	});

	describe('AMT detection', () => {
		it('detects dollar amounts', () => {
			const results = detectRegex('The total is $1,234.56.');
			const amts = results.filter((r) => r.type === 'AMT');
			assert.equal(amts.length, 1);
			assert.equal(amts[0].value, '$1,234.56');
		});

		it('detects euro amounts', () => {
			const results = detectRegex('Price: €500');
			const amts = results.filter((r) => r.type === 'AMT');
			assert.equal(amts.length, 1);
			assert.equal(amts[0].value, '€500');
		});

		it('detects pound amounts', () => {
			const results = detectRegex('Cost is £2,500.00');
			const amts = results.filter((r) => r.type === 'AMT');
			assert.equal(amts.length, 1);
			assert.equal(amts[0].value, '£2,500.00');
		});

		it('detects amounts with K/M/B suffixes', () => {
			const results = detectRegex('Revenue of $5M this quarter');
			const amts = results.filter((r) => r.type === 'AMT');
			assert.equal(amts.length, 1);
			assert.equal(amts[0].value, '$5M');
		});

		it('does not match plain numbers without currency', () => {
			const results = detectRegex('There are 1234 items in stock.');
			const amts = results.filter((r) => r.type === 'AMT');
			assert.equal(amts.length, 0);
		});
	});

	describe('API_KEY detection', () => {
		it('detects AWS AKIA keys', () => {
			const results = detectRegex('Key: AKIAIOSFODNN7EXAMPLE');
			const keys = results.filter((r) => r.type === 'API_KEY');
			assert.equal(keys.length, 1);
			assert.equal(keys[0].value, 'AKIAIOSFODNN7EXAMPLE');
		});

		it('detects sk- prefixed keys', () => {
			const results = detectRegex(
				'Token: sk-abcdefghijklmnopqrstuvwxyz123456'
			);
			const keys = results.filter((r) => r.type === 'API_KEY');
			assert.equal(keys.length, 1);
			assert.ok(keys[0].value.startsWith('sk-'));
		});

		it('detects long hex strings (32+ chars)', () => {
			const hex = 'a'.repeat(32);
			const results = detectRegex(`Config hash: ${hex}`);
			const keys = results.filter((r) => r.type === 'API_KEY');
			assert.equal(keys.length, 1);
			assert.equal(keys[0].value, hex);
		});

		it('detects api_key=value patterns', () => {
			const results = detectRegex(
				'api_key=abcdefghijklmnopqrstuvwxyz1234'
			);
			const keys = results.filter((r) => r.type === 'API_KEY');
			assert.equal(keys.length, 1);
		});

		it('does not match short strings', () => {
			const results = detectRegex('id=abc123');
			const keys = results.filter((r) => r.type === 'API_KEY');
			assert.equal(keys.length, 0);
		});
	});

	describe('mixed content', () => {
		it('detects multiple entity types in one text', () => {
			const text =
				'Email alice@test.com, call 555-123-4567, pay $99.99 with key AKIAIOSFODNN7EXAMPLE';
			const results = detectRegex(text);
			const types = new Set(results.map((r) => r.type));
			assert.ok(types.has('EMAIL'));
			assert.ok(types.has('PHONE'));
			assert.ok(types.has('AMT'));
			assert.ok(types.has('API_KEY'));
		});

		it('returns empty array for empty input', () => {
			assert.deepEqual(detectRegex(''), []);
		});

		it('returns empty array for text with no PII', () => {
			const results = detectRegex(
				'The quick brown fox jumps over the lazy dog.'
			);
			assert.equal(results.length, 0);
		});
	});
});
