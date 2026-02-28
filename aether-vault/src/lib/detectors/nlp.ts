import nlp from 'compromise';
import type { Detection } from './types';

export function detectNlp(text: string): Detection[] {
	if (!text) return [];
	const doc = nlp(text);
	const results: Detection[] = [];

	// Detect person names
	const people = doc.people().out('array') as string[];
	for (const name of people) {
		let searchFrom = 0;
		while (searchFrom < text.length) {
			const idx = text.indexOf(name, searchFrom);
			if (idx === -1) break;
			results.push({ type: 'PERSON', value: name, start: idx, end: idx + name.length });
			searchFrom = idx + name.length;
		}
	}

	// Detect organization names
	const orgs = doc.organizations().out('array') as string[];
	for (const org of orgs) {
		let searchFrom = 0;
		while (searchFrom < text.length) {
			const idx = text.indexOf(org, searchFrom);
			if (idx === -1) break;
			results.push({ type: 'ORG', value: org, start: idx, end: idx + org.length });
			searchFrom = idx + org.length;
		}
	}

	return results;
}
