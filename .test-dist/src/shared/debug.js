"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.debugLog = debugLog;
exports.debugWarn = debugWarn;
exports.debugError = debugError;
const DEBUG_FLAG = true;
function prefix(scope) {
    return `[AETHER][${scope}]`;
}
function debugLog(scope, ...args) {
    if (!DEBUG_FLAG) {
        return;
    }
    console.log(prefix(scope), ...args);
}
function debugWarn(scope, ...args) {
    if (!DEBUG_FLAG) {
        return;
    }
    console.warn(prefix(scope), ...args);
}
function debugError(scope, ...args) {
    if (!DEBUG_FLAG) {
        return;
    }
    console.error(prefix(scope), ...args);
}
