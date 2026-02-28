import nlp from "compromise";
import { ORG_KEYWORDS } from "./orgDictionary";
import type { DetectedEntity, EntityType } from "./types";
import { TOKEN_REGEX } from "./types";

const PRIORITY: Record<EntityType, number> = {
  EMAIL: 1,
  PHONE: 2,
  AMT: 3,
  ORG: 4,
  PERSON: 5
};

const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_REGEX =
  /(?<!\w)(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}(?!\w)/g;
const AMOUNT_REGEX =
  /(?:[$€£]\s?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s?(?:[KMBT])?)(?!\w)/gi;

const ORG_PATTERNS = [...ORG_KEYWORDS]
  .sort((a, b) => b.length - a.length)
  .map((keyword) => ({
    keyword,
    regex: new RegExp(`\\b${escapeRegex(keyword)}\\b`, "gi")
  }));

// Subset of the compromise out('offset') result we rely on.
type NlpMatch = {
  text: string;
  terms: Array<{ offset: { start: number; length: number } }>;
  offset: { start: number; length: number };
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scanRegexMatches(
  text: string,
  regex: RegExp,
  type: EntityType,
  filter?: (match: string) => boolean
): DetectedEntity[] {
  const matches: DetectedEntity[] = [];
  regex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const value = match[0];
    if (!value) {
      continue;
    }
    if (filter && !filter(value)) {
      continue;
    }
    matches.push({
      type,
      value,
      start: match.index,
      end: match.index + value.length
    });
  }
  return matches;
}

// Convert compromise out('offset') results to DetectedEntity[].
// Uses the last term's boundary to exclude trailing punctuation that
// compromise includes in the phrase-level offset.length.
function nlpMatchesToEntities(matches: NlpMatch[], type: EntityType): DetectedEntity[] {
  const entities: DetectedEntity[] = [];
  for (const m of matches) {
    if (!m.text || m.terms.length === 0) {
      continue;
    }
    const start = m.offset.start;
    const lastTerm = m.terms[m.terms.length - 1];
    const end = lastTerm.offset.start + lastTerm.offset.length;
    const value = m.text.slice(0, end - start);
    if (value.trim().length === 0) {
      continue;
    }
    entities.push({ type, value, start, end });
  }
  return entities;
}

function detectOrgs(text: string): DetectedEntity[] {
  const matches: DetectedEntity[] = [];

  // NLP-based detection for orgs compromise knows about
  const nlpOrgs = nlp(text).organizations().out("offset") as NlpMatch[];
  matches.push(...nlpMatchesToEntities(nlpOrgs, "ORG"));

  // Dictionary supplement for known orgs compromise may not recognise
  for (const { regex } of ORG_PATTERNS) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      if (!match[0]) {
        continue;
      }
      matches.push({
        type: "ORG",
        value: match[0],
        start: match.index,
        end: match.index + match[0].length
      });
    }
  }

  return matches;
}

function detectPersons(text: string): DetectedEntity[] {
  const nlpPeople = nlp(text).people().out("offset") as NlpMatch[];
  return nlpMatchesToEntities(nlpPeople, "PERSON").filter(
    // Require at least two words to avoid single-name false positives
    (e) => e.value.trim().split(/\s+/).length >= 2
  );
}

function resolveOverlaps(candidates: DetectedEntity[]): DetectedEntity[] {
  const sorted = [...candidates].sort((a, b) => {
    if (a.start !== b.start) {
      return a.start - b.start;
    }
    if (PRIORITY[a.type] !== PRIORITY[b.type]) {
      return PRIORITY[a.type] - PRIORITY[b.type];
    }
    return (b.end - b.start) - (a.end - a.start);
  });

  const accepted: DetectedEntity[] = [];
  let lastEnd = -1;
  for (const item of sorted) {
    if (item.start < lastEnd) {
      continue;
    }
    accepted.push(item);
    lastEnd = item.end;
  }
  return accepted;
}

export function detectEntities(text: string): DetectedEntity[] {
  if (!text) {
    return [];
  }
  const candidates: DetectedEntity[] = [
    ...scanRegexMatches(text, EMAIL_REGEX, "EMAIL"),
    ...scanRegexMatches(text, PHONE_REGEX, "PHONE"),
    ...scanRegexMatches(text, AMOUNT_REGEX, "AMT"),
    ...detectOrgs(text),
    ...detectPersons(text)
  ];
  return resolveOverlaps(candidates);
}

export function applyMasking(
  text: string,
  entities: DetectedEntity[],
  tokenFor: (entity: DetectedEntity) => string
): { maskedText: string; entitiesCount: number } {
  if (!entities.length) {
    return { maskedText: text, entitiesCount: 0 };
  }

  let cursor = 0;
  let output = "";
  for (const entity of entities) {
    if (entity.start < cursor) {
      continue;
    }
    output += text.slice(cursor, entity.start);
    output += tokenFor(entity);
    cursor = entity.end;
  }
  output += text.slice(cursor);
  return { maskedText: output, entitiesCount: entities.length };
}

export function replaceKnownTokens(
  text: string,
  resolver: (token: string) => string | null
): string {
  if (!text || !text.includes("[[")) {
    return text;
  }
  return text.replace(TOKEN_REGEX, (fullMatch, innerToken: string) => {
    const token = `[[${innerToken}]]`;
    return resolver(token) ?? fullMatch;
  });
}
