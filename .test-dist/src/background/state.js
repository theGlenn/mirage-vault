"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.maskTextForTab = maskTextForTab;
exports.rehydrateTextForTab = rehydrateTextForTab;
exports.getTabState = getTabState;
exports.setTabEnabled = setTabEnabled;
exports.clearTabSession = clearTabSession;
const vault_1 = require("./vault");
const sessions = new Map();
function createSession() {
    return {
        enabled: true,
        maskedCount: 0,
        vault: new vault_1.SessionVault()
    };
}
function getOrCreateSession(tabId) {
    const existing = sessions.get(tabId);
    if (existing) {
        return existing;
    }
    const created = createSession();
    sessions.set(tabId, created);
    return created;
}
function maskTextForTab(tabId, text) {
    const session = getOrCreateSession(tabId);
    if (!session.enabled) {
        return {
            maskedText: text,
            entitiesCount: 0,
            enabled: session.enabled,
            maskedCount: session.maskedCount
        };
    }
    const result = session.vault.maskText(text);
    session.maskedCount += result.entitiesCount;
    return {
        ...result,
        enabled: session.enabled,
        maskedCount: session.maskedCount
    };
}
function rehydrateTextForTab(tabId, text) {
    const session = getOrCreateSession(tabId);
    return { restoredText: session.vault.rehydrateText(text) };
}
function getTabState(tabId) {
    const session = getOrCreateSession(tabId);
    return {
        enabled: session.enabled,
        maskedCount: session.maskedCount
    };
}
function setTabEnabled(tabId, enabled) {
    const session = getOrCreateSession(tabId);
    session.enabled = enabled;
    return {
        enabled: session.enabled,
        maskedCount: session.maskedCount
    };
}
function clearTabSession(tabId) {
    sessions.delete(tabId);
}
