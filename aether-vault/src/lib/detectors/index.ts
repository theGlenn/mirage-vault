import type { Detection } from './types';
import { detectRegex } from './regex';
import { detectNlp } from './nlp';

/**
 * Deduplicate overlapping detections: when two spans overlap, keep the longer one.
 * Input must be sorted by start offset ascending.
 */
function deduplicateOverlaps(detections: Detection[]): Detection[] {
	if (detections.length === 0) return [];

	const result: Detection[] = [detections[0]];

	for (let i = 1; i < detections.length; i++) {
		const current = detections[i];
		const last = result[result.length - 1];

		// Check if current overlaps with the last kept detection
		if (current.start < last.end) {
			// Overlapping: keep the longer (more specific) one
			const lastLen = last.end - last.start;
			const currentLen = current.end - current.start;
			if (currentLen > lastLen) {
				result[result.length - 1] = current;
			}
			// Otherwise keep the existing one (discard current)
		} else {
			result.push(current);
		}
	}

	return result;
}

/**
 * Run both regex and NLP detectors, deduplicate overlapping spans,
 * and return results sorted by start offset ascending.
 */
export function detect(text: string): Detection[] {
	const regexResults = detectRegex(text);
	const nlpResults = detectNlp(text);

	const combined = [...regexResults, ...nlpResults];

	// Sort by start offset ascending, then by length descending (longer first) for ties
	combined.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

	return deduplicateOverlaps(combined);
}
