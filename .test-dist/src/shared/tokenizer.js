"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectEntities = detectEntities;
exports.applyMasking = applyMasking;
exports.replaceKnownTokens = replaceKnownTokens;
const compromise_1 = __importDefault(require("compromise"));
const orgDictionary_1 = require("./orgDictionary");
const types_1 = require("./types");
const PRIORITY = {
    EMAIL: 1,
    PHONE: 2,
    AMT: 3,
    ORG: 4,
    PERSON: 5
};
const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_REGEX = /(?<!\w)(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}(?!\w)/g;
const AMOUNT_REGEX = /(?:[$€£]\s?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s?(?:[KMBT])?)(?!\w)/gi;
const ORG_PATTERNS = [...orgDictionary_1.ORG_KEYWORDS]
    .sort((a, b) => b.length - a.length)
    .map((keyword) => ({
    keyword,
    regex: new RegExp(`\\b${escapeRegex(keyword)}\\b`, "gi")
}));
function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function scanRegexMatches(text, regex, type, filter) {
    const matches = [];
    regex.lastIndex = 0;
    let match;
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
function nlpMatchesToEntities(matches, type) {
    const entities = [];
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
function detectOrgs(text) {
    const matches = [];
    // NLP-based detection for orgs compromise knows about
    const nlpOrgs = (0, compromise_1.default)(text).organizations().out("offset");
    matches.push(...nlpMatchesToEntities(nlpOrgs, "ORG"));
    // Dictionary supplement for known orgs compromise may not recognise
    for (const { regex } of ORG_PATTERNS) {
        regex.lastIndex = 0;
        let match;
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
function detectPersons(text) {
    const nlpPeople = (0, compromise_1.default)(text).people().out("offset");
    return nlpMatchesToEntities(nlpPeople, "PERSON").filter(
    // Require at least two words to avoid single-name false positives
    (e) => e.value.trim().split(/\s+/).length >= 2);
}
function resolveOverlaps(candidates) {
    const sorted = [...candidates].sort((a, b) => {
        if (a.start !== b.start) {
            return a.start - b.start;
        }
        if (PRIORITY[a.type] !== PRIORITY[b.type]) {
            return PRIORITY[a.type] - PRIORITY[b.type];
        }
        return (b.end - b.start) - (a.end - a.start);
    });
    const accepted = [];
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
function detectEntities(text) {
    if (!text) {
        return [];
    }
    const candidates = [
        ...scanRegexMatches(text, EMAIL_REGEX, "EMAIL"),
        ...scanRegexMatches(text, PHONE_REGEX, "PHONE"),
        ...scanRegexMatches(text, AMOUNT_REGEX, "AMT"),
        ...detectOrgs(text),
        ...detectPersons(text)
    ];
    return resolveOverlaps(candidates);
}
function applyMasking(text, entities, tokenFor) {
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
function replaceKnownTokens(text, resolver) {
    if (!text || !text.includes("[[")) {
        return text;
    }
    return text.replace(types_1.TOKEN_REGEX, (fullMatch, innerToken) => {
        const token = `[[${innerToken}]]`;
        return resolver(token) ?? fullMatch;
    });
}
