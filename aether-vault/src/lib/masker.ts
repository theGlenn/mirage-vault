import type { Detection, EntityType } from './detectors/types';

export interface Mapping {
	token: string;
	original: string;
	type: EntityType;
	start: number;
	end: number;
}

export interface MaskResult {
	maskedText: string;
	mappings: Mapping[];
}

/**
 * Replace detected entities with [[TYPE_N]] tokens.
 *
 * - Counter increments per type (first email → [[EMAIL_1]], second → [[EMAIL_2]]).
 * - Same entity value appearing multiple times maps to the same token.
 * - Already-tokenized patterns ([[...]]) are never re-detected, making masking idempotent.
 *
 * Detections must be non-overlapping and sorted by start ascending (as returned by detect()).
 */
export function mask(text: string, detections: Detection[]): MaskResult {
	const counters = new Map<EntityType, number>();
	const valueToToken = new Map<string, string>();
	const mappings: Mapping[] = [];

	// Sort by start ascending to process left-to-right
	const sorted = [...detections].sort((a, b) => a.start - b.start);

	let result = '';
	let cursor = 0;

	for (const det of sorted) {
		// Append text between previous detection and this one
		result += text.slice(cursor, det.start);

		const key = `${det.type}::${det.value}`;
		let token = valueToToken.get(key);

		if (!token) {
			const count = (counters.get(det.type) ?? 0) + 1;
			counters.set(det.type, count);
			token = `[[${det.type}_${count}]]`;
			valueToToken.set(key, token);
		}

		result += token;
		mappings.push({
			token,
			original: det.value,
			type: det.type,
			start: det.start,
			end: det.end
		});

		cursor = det.end;
	}

	// Append remaining text
	result += text.slice(cursor);

	return { maskedText: result, mappings };
}
