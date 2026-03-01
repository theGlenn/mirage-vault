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

function resolveDetection(
	text: string,
	detection: Detection,
	cursor: number
): Detection | null {
	const textLength = text.length;
	const boundedStart = Number.isFinite(detection.start)
		? Math.max(0, Math.min(textLength, detection.start))
		: -1;
	const boundedEnd = Number.isFinite(detection.end)
		? Math.max(0, Math.min(textLength, detection.end))
		: -1;

	if (boundedStart >= 0 && boundedEnd > boundedStart) {
		const slice = text.slice(boundedStart, boundedEnd);
		if (slice === detection.value) {
			return {
				...detection,
				value: slice,
				start: boundedStart,
				end: boundedEnd
			};
		}
	}

	if (!detection.value) {
		return null;
	}

	// LLM/refinement can return approximate offsets; anchor to the actual value.
	const searchStart = Math.max(cursor, 0);
	const foundStart = text.indexOf(detection.value, searchStart);
	if (foundStart === -1) {
		return null;
	}

	return {
		...detection,
		start: foundStart,
		end: foundStart + detection.value.length
	};
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
		const resolved = resolveDetection(text, det, cursor);
		if (!resolved || resolved.start < cursor) {
			continue;
		}

		// Append text between previous detection and this one
		result += text.slice(cursor, resolved.start);

		let hash = valueToHash.get(resolved.value);

		if (!hash) {
			hash = generateHash(resolved.value);
			valueToHash.set(resolved.value, hash);
			hashMappings.set(hash, resolved.value);
		}

		const token = `[[${resolved.type}:${hash}]]`;

		result += token;
		mappings.push({
			token,
			hash,
			original: resolved.value,
			type: resolved.type,
			start: resolved.start,
			end: resolved.end
		});

		cursor = resolved.end;
	}

	// Append remaining text
	result += text.slice(cursor);

	return { maskedText: result, mappings, hashMappings };
}
