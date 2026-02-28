import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectNlp } from './nlp.js';

describe('detectNlp', () => {
	describe('PERSON detection', () => {
		it('detects full names', () => {
			const results = detectNlp('Please contact John Smith for more details.');
			const people = results.filter((r) => r.type === 'PERSON');
			assert.equal(people.length, 1);
			assert.equal(people[0].value, 'John Smith');
		});

		it('detects multiple person names', () => {
			const results = detectNlp(
				'Alice Johnson met with Bob Williams at the conference.'
			);
			const people = results.filter((r) => r.type === 'PERSON');
			assert.ok(people.length >= 2, `Expected at least 2 people, got ${people.length}`);
			const names = people.map((p) => p.value);
			assert.ok(names.some((n) => n.includes('Alice')));
			assert.ok(names.some((n) => n.includes('Bob')));
		});

		it('detects first names in context', () => {
			const results = detectNlp('Sarah called the office yesterday.');
			const people = results.filter((r) => r.type === 'PERSON');
			assert.ok(people.length >= 1, `Expected at least 1 person, got ${people.length}`);
			assert.ok(people[0].value.includes('Sarah'));
		});

		it('returns correct offsets for person names', () => {
			const text = 'Hello, Michael Brown here.';
			const results = detectNlp(text);
			const people = results.filter((r) => r.type === 'PERSON');
			assert.ok(people.length >= 1);
			const person = people[0];
			assert.equal(text.slice(person.start, person.end), person.value);
		});
	});

	describe('ORG detection', () => {
		it('detects well-known organizations', () => {
			const results = detectNlp('She works at Google and previously at Microsoft.');
			const orgs = results.filter((r) => r.type === 'ORG');
			assert.ok(orgs.length >= 1, `Expected at least 1 org, got ${orgs.length}`);
			const orgNames = orgs.map((o) => o.value);
			assert.ok(
				orgNames.some((n) => n.includes('Google') || n.includes('Microsoft')),
				`Expected Google or Microsoft in ${JSON.stringify(orgNames)}`
			);
		});

		it('detects organizations with Inc/Corp suffixes', () => {
			const results = detectNlp(
				'The deal was signed by Acme Corp and Globex Inc.'
			);
			const orgs = results.filter((r) => r.type === 'ORG');
			assert.ok(orgs.length >= 1, `Expected at least 1 org, got ${orgs.length}`);
		});

		it('returns correct offsets for orgs', () => {
			const text = 'I interviewed at Apple last week.';
			const results = detectNlp(text);
			const orgs = results.filter((r) => r.type === 'ORG');
			if (orgs.length > 0) {
				const org = orgs[0];
				assert.equal(text.slice(org.start, org.end), org.value);
			}
		});
	});

	describe('mixed content', () => {
		it('detects both people and orgs in a paragraph', () => {
			const text =
				'Dr. Jane Wilson joined Microsoft as VP of Engineering. She previously led the team at Amazon.';
			const results = detectNlp(text);
			const people = results.filter((r) => r.type === 'PERSON');
			const orgs = results.filter((r) => r.type === 'ORG');
			assert.ok(people.length >= 1, `Expected at least 1 person, got ${people.length}`);
			assert.ok(orgs.length >= 1, `Expected at least 1 org, got ${orgs.length}`);
		});

		it('returns empty array for empty input', () => {
			assert.deepEqual(detectNlp(''), []);
		});

		it('returns empty for text without names or orgs', () => {
			const results = detectNlp('The weather is nice today and the sky is blue.');
			assert.equal(results.length, 0);
		});

		it('handles repeated names correctly', () => {
			const text = 'John called John again.';
			const results = detectNlp(text);
			const people = results.filter((r) => r.type === 'PERSON');
			// Should find both occurrences
			assert.ok(people.length >= 2, `Expected at least 2 occurrences, got ${people.length}`);
		});
	});
});
