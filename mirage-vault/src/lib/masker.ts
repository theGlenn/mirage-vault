import type { Detection, EntityType } from './detectors/types';

export interface Mapping {
	token: string;
	hash: string;
	original: string;
	type: EntityType;
	start: number;
	end: number;
}

export interface MaskResult {
	maskedText: string;
	mappings: Mapping[];
	hashMappings: Map<string, string>;
}

function generateHash(text: string): string {
	let hash = 0;
	for (let i = 0; i < text.length; i++) {
		const char = text.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash;
	}

	return Math.abs(hash).toString(16).padStart(8, '0').substring(0, 8);
}

export function mask(text: string, detections: Detection[]): MaskResult {
	const valueToHash = new Map<string, string>();
	const hashMappings = new Map<string, string>();
	const mappings: Mapping[] = [];

	// Sort by start ascending to process left-to-right
	const sorted = [...detections].sort((a, b) => a.start - b.start);

	let result = '';
	let cursor = 0;

	for (const det of sorted) {
		// Append text between previous detection and this one
		result += text.slice(cursor, det.start);

		let hash = valueToHash.get(det.value);

		if (!hash) {
			hash = generateHash(det.value);
			valueToHash.set(det.value, hash);
			hashMappings.set(hash, det.value);
		}

		const token = `[[${det.type}:${hash}]]`;

		result += token;
		mappings.push({
			token,
			hash,
			original: det.value,
			type: det.type,
			start: det.start,
			end: det.end
		});

		cursor = det.end;
	}

	// Append remaining text
	result += text.slice(cursor);

	return { maskedText: result, mappings, hashMappings };
}
