"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("node:assert/strict"));
const node_test_1 = require("node:test");
const tokenizer_1 = require("../src/shared/tokenizer");
(0, node_test_1.test)("detectEntities finds MVP entity types including shorthand amounts", () => {
    const input = "Send a note to Jane Doe at jane.doe@example.com or +1 (415) 555-1212 about $5.2M for OpenAI.";
    const entities = (0, tokenizer_1.detectEntities)(input);
    const byType = new Map(entities.map((entity) => [entity.type, entity.value]));
    assert.equal(byType.get("PERSON"), "Jane Doe");
    assert.equal(byType.get("EMAIL"), "jane.doe@example.com");
    assert.equal(byType.get("PHONE"), "+1 (415) 555-1212");
    assert.equal(byType.get("AMT"), "$5.2M");
    assert.equal(byType.get("ORG"), "OpenAI");
});
(0, node_test_1.test)("applyMasking replaces entities in-order and reports count", () => {
    const input = "Email jane@example.com about OpenAI for $1200.";
    const entities = (0, tokenizer_1.detectEntities)(input);
    let nextId = 0;
    const result = (0, tokenizer_1.applyMasking)(input, entities, (entity) => `[[${entity.type}_${++nextId}]]`);
    assert.equal(result.maskedText, "Email [[EMAIL_1]] about [[ORG_2]] for [[AMT_3]].");
    assert.equal(result.entitiesCount, 3);
});
(0, node_test_1.test)("detectEntities prefers ORG over PERSON for identical spans", () => {
    const input = "Prepare a summary for Goldman Sachs.";
    const entities = (0, tokenizer_1.detectEntities)(input);
    const goldman = entities.find((entity) => entity.value === "Goldman Sachs");
    assert.ok(goldman);
    if (!goldman) {
        throw new Error("Expected Goldman Sachs to be detected");
    }
    assert.equal(goldman.type, "ORG");
    assert.equal(entities.some((entity) => entity.type === "PERSON" && entity.value === "Goldman Sachs"), false);
});
(0, node_test_1.test)("replaceKnownTokens restores known values and leaves unknown tokens unchanged", () => {
    const input = "Send [[EMAIL_1]] to [[ORG_1]] and keep [[PHONE_9]] as-is.";
    const output = (0, tokenizer_1.replaceKnownTokens)(input, (token) => {
        if (token === "[[EMAIL_1]]") {
            return "jane@example.com";
        }
        if (token === "[[ORG_1]]") {
            return "OpenAI";
        }
        return null;
    });
    assert.equal(output, "Send jane@example.com to OpenAI and keep [[PHONE_9]] as-is.");
});
(0, node_test_1.test)("replaceKnownTokens leaves drifted or malformed tokens unchanged", () => {
    const input = "Keep [[ORG-1]], [ORG_1], and [[ORG_ABC]] untouched.";
    const output = (0, tokenizer_1.replaceKnownTokens)(input, () => "SHOULD_NOT_REPLACE");
    assert.equal(output, input);
});
