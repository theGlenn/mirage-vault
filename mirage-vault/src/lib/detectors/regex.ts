import type { Detection, EntityType } from './types';

const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

const PHONE_REGEX =
	/(?<!\w)(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\w)/g;

const AMOUNT_REGEX =
	/(?:[$€£]\s?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s?(?:[KMBT])?)(?!\w)/gi;

// AWS AKIA keys, long hex strings (32+), base64 tokens with key-like prefixes
const API_KEY_REGEX =
	/(?<!\w)(?:AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{32,}|[A-Fa-f0-9]{32,64}|(?:api[_-]?key|token|secret)[=:\s]["']?[A-Za-z0-9_\-/.+]{20,}["']?)(?!\w)/g;

function scanRegex(text: string, regex: RegExp, type: EntityType): Detection[] {
	const results: Detection[] = [];
	regex.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = regex.exec(text)) !== null) {
		const value = match[0];
		if (!value) continue;
		results.push({ type, value, start: match.index, end: match.index + value.length });
	}
	return results;
}

export function detectRegex(text: string): Detection[] {
	if (!text) return [];
	return [
		...scanRegex(text, EMAIL_REGEX, 'EMAIL'),
		...scanRegex(text, PHONE_REGEX, 'PHONE'),
		...scanRegex(text, AMOUNT_REGEX, 'AMT'),
		...scanRegex(text, API_KEY_REGEX, 'API_KEY')
	];
}
