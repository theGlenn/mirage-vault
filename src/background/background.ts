import { clearTabSession, getTabState, maskTextForTab, rehydrateTextForTab, setTabEnabled } from "./state";
import type {
  ErrorResponse,
  RuntimeRequest,
  RuntimeResponse,
  SetEnabledRequest,
  StateChangedMessage
} from "../shared/types";
import { debugError, debugLog, debugWarn } from "../shared/debug";

function errorResponse(message: string): ErrorResponse {
  return { ok: false, error: message };
}

function resolveTabId(requestTabId: number | undefined, sender: chrome.runtime.MessageSender): number | null {
  if (typeof requestTabId === "number") {
    debugLog("background", "tab resolved from request", requestTabId);
    return requestTabId;
  }
  if (typeof sender.tab?.id === "number") {
    debugLog("background", "tab resolved from sender", sender.tab.id);
    return sender.tab.id;
  }
  debugWarn("background", "unable to resolve tab id");
  return null;
}

function notifyTabStateChanged(tabId: number, enabled: boolean, maskedCount: number) {
  const message: StateChangedMessage = {
    kind: "stateChanged",
    enabled,
    maskedCount
  };
  debugLog("background", "notify tab state changed", { tabId, enabled, maskedCount });
  chrome.tabs.sendMessage(tabId, message, () => {
    void chrome.runtime.lastError;
  });
}

function handleRequest(request: RuntimeRequest, sender: chrome.runtime.MessageSender): RuntimeResponse {
  debugLog("background", "request received", request.kind);
  switch (request.kind) {
    case "maskText": {
      const tabId = resolveTabId(request.tabId, sender);
      if (tabId === null) {
        return errorResponse("tabId is required for maskText");
      }
      const result = maskTextForTab(tabId, request.text);
      debugLog("background", "maskText processed", {
        tabId,
        entitiesCount: result.entitiesCount,
        enabled: result.enabled,
        maskedCount: result.maskedCount
      });
      return {
        ok: true,
        kind: "maskText",
        maskedText: result.maskedText,
        entitiesCount: result.entitiesCount,
        enabled: result.enabled,
        maskedCount: result.maskedCount
      };
    }
    case "rehydrateText": {
      const tabId = resolveTabId(request.tabId, sender);
      if (tabId === null) {
        return errorResponse("tabId is required for rehydrateText");
      }
      const result = rehydrateTextForTab(tabId, request.text);
      if (result.restoredText !== request.text) {
        debugLog("background", "rehydrated text", { tabId });
      }
      return {
        ok: true,
        kind: "rehydrateText",
        restoredText: result.restoredText
      };
    }
    case "getState": {
      const tabId = resolveTabId(request.tabId, sender);
      if (tabId === null) {
        return errorResponse("tabId is required for getState");
      }
      const result = getTabState(tabId);
      debugLog("background", "getState", { tabId, enabled: result.enabled, maskedCount: result.maskedCount });
      return {
        ok: true,
        kind: "getState",
        enabled: result.enabled,
        maskedCount: result.maskedCount
      };
    }
    case "setEnabled": {
      const result = handleSetEnabled(request);
      debugLog("background", "setEnabled", {
        tabId: request.tabId,
        enabled: result.enabled,
        maskedCount: result.maskedCount
      });
      notifyTabStateChanged(request.tabId, result.enabled, result.maskedCount);
      return {
        ok: true,
        kind: "setEnabled",
        enabled: result.enabled,
        maskedCount: result.maskedCount
      };
    }
    default:
      return errorResponse("Unsupported request");
  }
}

function handleSetEnabled(request: SetEnabledRequest) {
  return setTabEnabled(request.tabId, request.enabled);
}

chrome.runtime.onMessage.addListener(
  (message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response: RuntimeResponse) => void) => {
    try {
      sendResponse(handleRequest(message as RuntimeRequest, sender));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown background error";
      debugError("background", "request handling failed", errorMessage);
      sendResponse(errorResponse(errorMessage));
    }
    return false;
  }
);

chrome.tabs.onRemoved.addListener((tabId) => {
  debugLog("background", "tab removed; clearing session", tabId);
  clearTabSession(tabId);
});
