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
const state_1 = require("../src/background/state");
const vault_1 = require("../src/background/vault");
(0, node_test_1.test)("SessionVault reuses tokens within a session and rehydrates responses", () => {
    const vault = new vault_1.SessionVault();
    const masked = vault.maskText("OpenAI paid OpenAI $100.");
    assert.equal(masked.maskedText, "[[ORG_1]] paid [[ORG_1]] [[AMT_1]].");
    assert.equal(masked.entitiesCount, 3);
    const restored = vault.rehydrateText("Summary: [[ORG_1]] budget was [[AMT_1]].");
    assert.equal(restored, "Summary: OpenAI budget was $100.");
});
(0, node_test_1.test)("per-tab state tracks counts, respects toggle, and resets on clear", () => {
    (0, state_1.clearTabSession)(101);
    (0, state_1.clearTabSession)(202);
    const first = (0, state_1.maskTextForTab)(101, "OpenAI invoice: $200");
    assert.equal(first.maskedText, "[[ORG_1]] invoice: [[AMT_1]]");
    assert.equal(first.entitiesCount, 2);
    assert.equal(first.maskedCount, 2);
    assert.equal(first.enabled, true);
    const secondTab = (0, state_1.maskTextForTab)(202, "OpenAI");
    assert.equal(secondTab.maskedText, "[[ORG_1]]");
    assert.equal(secondTab.maskedCount, 1);
    const toggled = (0, state_1.setTabEnabled)(101, false);
    assert.equal(toggled.enabled, false);
    assert.equal(toggled.maskedCount, 2);
    const disabledMask = (0, state_1.maskTextForTab)(101, "Email jane@example.com");
    assert.equal(disabledMask.maskedText, "Email jane@example.com");
    assert.equal(disabledMask.entitiesCount, 0);
    assert.equal(disabledMask.maskedCount, 2);
    assert.equal(disabledMask.enabled, false);
    const disabledRehydrate = (0, state_1.rehydrateTextForTab)(101, "Paused token [[EMAIL_9]].");
    assert.equal(disabledRehydrate.restoredText, "Paused token [[EMAIL_9]].");
    const restored = (0, state_1.rehydrateTextForTab)(101, "Check [[ORG_1]] and [[AMT_1]].");
    assert.equal(restored.restoredText, "Check OpenAI and $200.");
    (0, state_1.clearTabSession)(101);
    const resetState = (0, state_1.getTabState)(101);
    assert.equal(resetState.enabled, true);
    assert.equal(resetState.maskedCount, 0);
    const afterClearRestore = (0, state_1.rehydrateTextForTab)(101, "Check [[ORG_1]].");
    assert.equal(afterClearRestore.restoredText, "Check [[ORG_1]].");
});
