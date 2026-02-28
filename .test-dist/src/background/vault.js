"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionVault = void 0;
const tokenizer_1 = require("../shared/tokenizer");
function createCounterMap() {
    return {
        EMAIL: 0,
        PHONE: 0,
        AMT: 0,
        ORG: 0,
        PERSON: 0
    };
}
class SessionVault {
    reverseKeyToToken = new Map();
    tokenToOriginal = new Map();
    counters = createCounterMap();
    maskText(text) {
        const entities = (0, tokenizer_1.detectEntities)(text);
        return (0, tokenizer_1.applyMasking)(text, entities, (entity) => this.getOrCreateToken(entity.type, entity.value));
    }
    rehydrateText(text) {
        return (0, tokenizer_1.replaceKnownTokens)(text, (token) => this.tokenToOriginal.get(token) ?? null);
    }
    getOrCreateToken(type, original) {
        const reverseKey = `${type}\u0000${original}`;
        const existing = this.reverseKeyToToken.get(reverseKey);
        if (existing) {
            return existing;
        }
        this.counters[type] += 1;
        const token = `[[${type}_${this.counters[type]}]]`;
        this.reverseKeyToToken.set(reverseKey, token);
        this.tokenToOriginal.set(token, original);
        return token;
    }
}
exports.SessionVault = SessionVault;
