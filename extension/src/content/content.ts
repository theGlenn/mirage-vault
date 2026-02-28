import { detectEntities } from "../shared/tokenizer";
import type {
  GetStateResponse,
  MaskTextResponse,
  RehydrateTextResponse,
  RuntimeRequest,
  RuntimeResponse,
  StateChangedMessage
} from "../shared/types";
import {
  findComposer,
  findSendButton,
  getComposerText,
  isLikelySendButton,
  isNodeInsideComposer,
  setComposerText,
  type ComposerElement
} from "./detector";
import { debugError, debugLog, debugWarn } from "../shared/debug";

const CUE_ID = "aether-shroud-cue";
const STYLE_ID = "aether-shroud-style";
const MISTRAL_BRIDGE_REQ_SOURCE = "aether-shroud-mistral-page";
const MISTRAL_BRIDGE_RES_SOURCE = "aether-shroud-mistral-content";

let enabled = true;
let maskedCount = 0;
let submitInFlight = false;
let internalClickDepth = 0;
let internalEnterDepth = 0;
let cueRefreshTimer: number | undefined;
let rehydrateTimer: number | undefined;
let rehydrateInFlight = false;
let rehydrateQueued = false;
let eventListenersInstalled = false;
let mistralBridgeInstalled = false;

function sendRuntimeMessage<T extends RuntimeResponse>(request: RuntimeRequest): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(request, (response: T | undefined) => {
        if (chrome.runtime.lastError) {
          debugWarn("content", "runtime message failed", request.kind, chrome.runtime.lastError.message);
          resolve(null);
          return;
        }
        debugLog("content", "runtime message response", request.kind, response ?? null);
        resolve(response ?? null);
      });
    } catch {
      debugError("content", "runtime message threw", request.kind);
      resolve(null);
    }
  });
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${CUE_ID} {
      position: fixed;
      z-index: 2147483646;
      max-width: 420px;
      padding: 6px 8px;
      border-radius: 10px;
      border: 1px solid rgba(15,118,110,0.25);
      background: rgba(255,250,240,0.97);
      color: #1f1c18;
      font: 12px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;
      box-shadow: 0 6px 18px rgba(0,0,0,0.08);
      pointer-events: none;
      opacity: 0;
      transform: translateY(-4px);
      transition: opacity 100ms ease, transform 100ms ease;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    #${CUE_ID}[data-show="true"] {
      opacity: 1;
      transform: translateY(0);
    }
    [data-aether-shroud-flagged="true"] {
      box-shadow: 0 0 0 2px rgba(15,118,110,0.2) inset !important;
      border-radius: 10px;
    }
  `;
  document.documentElement.appendChild(style);
}

function installMistralFetchMaskBridge() {
  if (mistralBridgeInstalled || window.location.hostname !== "chat.mistral.ai") {
    return;
  }
  mistralBridgeInstalled = true;
  debugLog("content", "mistral bridge listener installed");

  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== window) {
      return;
    }
    const data = event.data as {
      source?: string;
      kind?: string;
      requestId?: number;
      text?: string;
    };
    if (
      data?.source !== MISTRAL_BRIDGE_REQ_SOURCE ||
      data.kind !== "maskForRequest" ||
      typeof data.requestId !== "number" ||
      typeof data.text !== "string"
    ) {
      return;
    }

    void (async () => {
      debugLog("content", "mistral bridge request received", {
        requestId: data.requestId,
        textLength: data.text?.length ?? 0
      });
      const response = await sendRuntimeMessage<MaskTextResponse>({
        kind: "maskText",
        text: data.text ?? ""
      });
      const maskedText =
        response?.ok && response.kind === "maskText" ? response.maskedText : data.text ?? "";
      debugLog("content", "mistral bridge response posted", {
        requestId: data.requestId,
        changed: maskedText !== (data.text ?? "")
      });

      window.postMessage(
        {
          source: MISTRAL_BRIDGE_RES_SOURCE,
          kind: "maskForRequestResult",
          requestId: data.requestId,
          maskedText
        },
        "*"
      );
    })();
  });
}

function getCueElement(): HTMLDivElement {
  let element = document.getElementById(CUE_ID);
  if (element instanceof HTMLDivElement) {
    return element;
  }
  ensureStyle();
  element = document.createElement("div");
  element.id = CUE_ID;
  element.setAttribute("data-show", "false");
  document.documentElement.appendChild(element);
  return element as HTMLDivElement;
}

function clearComposerFlags() {
  document.querySelectorAll("[data-aether-shroud-flagged='true']").forEach((node) => {
    if (node instanceof HTMLElement) {
      node.removeAttribute("data-aether-shroud-flagged");
    }
  });
}

function updateComposerCueNow() {
  const cue = getCueElement();
  const composer = findComposer();
  clearComposerFlags();

  if (!composer || !enabled) {
    cue.setAttribute("data-show", "false");
    return;
  }

  const text = getComposerText(composer);
  const allDetections = detectEntities(text);
  const detections = allDetections.slice(0, 3);
  if (!allDetections.length) {
    cue.setAttribute("data-show", "false");
    return;
  }

  (composer as HTMLElement).setAttribute("data-aether-shroud-flagged", "true");
  const rect = (composer as HTMLElement).getBoundingClientRect();
  cue.style.left = `${Math.max(8, rect.left)}px`;
  cue.style.top = `${Math.min(window.innerHeight - 36, rect.bottom + 6)}px`;
  cue.style.maxWidth = `${Math.max(180, Math.min(420, rect.width))}px`;
  cue.textContent = `AETHER SHROUD preview: ${detections
    .map((d) => `${d.type}:${d.value}`)
    .join(" | ")}${allDetections.length > detections.length ? " | …" : ""}`;
  cue.setAttribute("data-show", "true");
}

function scheduleComposerCueRefresh() {
  if (cueRefreshTimer !== undefined) {
    window.clearTimeout(cueRefreshTimer);
  }
  cueRefreshTimer = window.setTimeout(() => {
    cueRefreshTimer = undefined;
    updateComposerCueNow();
  }, 80);
}

function isPlainEnterSubmit(event: KeyboardEvent): boolean {
  return (
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.isComposing
  );
}

function clickInternally(button: HTMLButtonElement) {
  internalClickDepth += 1;
  try {
    button.click();
  } finally {
    internalClickDepth -= 1;
  }
}

function dispatchInternalEnter(composer: ComposerElement) {
  internalEnterDepth += 1;
  try {
    composer.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
        cancelable: true
      })
    );
  } finally {
    internalEnterDepth -= 1;
  }
}

async function refreshLocalState() {
  const response = await sendRuntimeMessage<GetStateResponse>({ kind: "getState" });
  if (response?.ok && response.kind === "getState") {
    enabled = response.enabled;
    maskedCount = response.maskedCount;
    debugLog("content", "state refreshed", { enabled, maskedCount });
    scheduleComposerCueRefresh();
    return;
  }
  debugWarn("content", "failed to refresh state");
}

async function maskAndSubmit(trigger: "enter" | "click", clickedButton: HTMLButtonElement | null = null) {
  if (submitInFlight) {
    debugLog("content", "submit ignored: in flight");
    return;
  }
  const composer = findComposer();
  if (!composer) {
    debugWarn("content", "composer not found", { trigger });
    if (trigger === "click" && clickedButton) {
      clickInternally(clickedButton);
    }
    return;
  }

  const originalText = getComposerText(composer);
  debugLog("content", "submit intercepted", {
    trigger,
    textLength: originalText.length,
    enabled
  });
  if (!originalText.trim()) {
    if (trigger === "click" && clickedButton) {
      clickInternally(clickedButton);
    }
    if (trigger === "enter") {
      const button = findSendButton(composer);
      if (button) {
        clickInternally(button);
      } else {
        dispatchInternalEnter(composer);
      }
    }
    return;
  }

  submitInFlight = true;
  try {
    const response = await sendRuntimeMessage<MaskTextResponse>({ kind: "maskText", text: originalText });
    if (!response?.ok || response.kind !== "maskText") {
      debugWarn("content", "maskText failed, falling back to normal submit", { trigger });
      if (trigger === "click" && clickedButton) {
        clickInternally(clickedButton);
      } else if (trigger === "enter") {
        const button = findSendButton(composer);
        if (button) {
          clickInternally(button);
        } else {
          dispatchInternalEnter(composer);
        }
      }
      return;
    }

    enabled = response.enabled;
    maskedCount = response.maskedCount;
    debugLog("content", "maskText succeeded", {
      trigger,
      entitiesCount: response.entitiesCount,
      maskedCount,
      changed: response.maskedText !== originalText
    });
    const currentText = getComposerText(composer);
    if (currentText !== originalText) {
      debugWarn("content", "composer changed during masking; aborting masked submit");
      return;
    }

    setComposerText(composer, response.maskedText);
    scheduleComposerCueRefresh();

    const submitButton = clickedButton ?? findSendButton(composer);
    if (submitButton) {
      clickInternally(submitButton);
    } else {
      dispatchInternalEnter(composer);
    }
  } finally {
    submitInFlight = false;
  }
}

function collectTokenTextNodes(root: Node): Text[] {
  if (!document.body) {
    return [];
  }
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current: Node | null = walker.nextNode();
  while (current) {
    if (current instanceof Text && current.nodeValue?.includes("[[")) {
      const parent = current.parentElement;
      const inComposer = isNodeInsideComposer(current);
      const skip =
        !parent ||
        inComposer ||
        parent.closest(`#${CUE_ID}`) ||
        parent.closest("script, style");
      if (!skip) {
        nodes.push(current);
      }
    }
    current = walker.nextNode();
  }
  return nodes;
}

async function runRehydratePass() {
  if (rehydrateInFlight) {
    rehydrateQueued = true;
    return;
  }
  rehydrateInFlight = true;
  try {
    const root = document.body;
    if (!root) {
      return;
    }
    const nodes = collectTokenTextNodes(root);
      if (nodes.length > 0) {
        debugLog("content", "rehydrate pass scanning nodes", { nodes: nodes.length });
      }
    const cache = new Map<string, string>();
    for (const node of nodes) {
      const text = node.nodeValue ?? "";
      if (!text.includes("[[")) {
        continue;
      }
      if (cache.has(text)) {
        node.nodeValue = cache.get(text) ?? text;
        continue;
      }
      const response = await sendRuntimeMessage<RehydrateTextResponse>({ kind: "rehydrateText", text });
      if (response?.ok && response.kind === "rehydrateText") {
        cache.set(text, response.restoredText);
        if (response.restoredText !== text) {
          debugLog("content", "rehydrated node", {
            beforeLength: text.length,
            afterLength: response.restoredText.length
          });
          node.nodeValue = response.restoredText;
        }
      }
    }
  } finally {
    rehydrateInFlight = false;
    if (rehydrateQueued) {
      rehydrateQueued = false;
      scheduleRehydrate();
    }
  }
}

function scheduleRehydrate() {
  if (rehydrateTimer !== undefined) {
    return;
  }
  rehydrateTimer = window.setTimeout(() => {
    rehydrateTimer = undefined;
    void runRehydratePass();
  }, 40);
}

function installMutationObserver() {
  if (!document.body) {
    return;
  }
  const observer = new MutationObserver(() => {
    scheduleRehydrate();
    scheduleComposerCueRefresh();
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true
  });
}

function installEventListeners() {
  if (eventListenersInstalled) {
    return;
  }
  eventListenersInstalled = true;

  window.addEventListener(
    "keydown",
    (event) => {
      if (internalEnterDepth > 0 || !enabled || !isPlainEnterSubmit(event)) {
        return;
      }
      if (!isNodeInsideComposer(event.target as Node | null)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
      void maskAndSubmit("enter");
    },
    true
  );

  window.addEventListener(
    "beforeinput",
    (event) => {
      const inputEvent = event as InputEvent;
      if (submitInFlight || !enabled || inputEvent.inputType !== "insertParagraph") {
        return;
      }
      if (!isNodeInsideComposer(event.target as Node | null)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
      void maskAndSubmit("enter");
    },
    true
  );

  document.addEventListener(
    "click",
    (event) => {
      if (internalClickDepth > 0 || !enabled) {
        return;
      }
      const target = event.target as Element | null;
      const button = target?.closest("button");
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }
      const composer = findComposer();
      if (!composer || !isLikelySendButton(button, composer)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
      void maskAndSubmit("click", button);
    },
    true
  );

  document.addEventListener(
    "input",
    (event) => {
      if (isNodeInsideComposer(event.target as Node | null)) {
        scheduleComposerCueRefresh();
      }
    },
    true
  );

  window.addEventListener("resize", scheduleComposerCueRefresh, { passive: true });
  window.addEventListener("scroll", scheduleComposerCueRefresh, { passive: true });
}

function installRuntimeMessageListener() {
  chrome.runtime.onMessage.addListener((message: unknown) => {
    const typed = message as StateChangedMessage;
    if (typed?.kind === "stateChanged") {
      enabled = typed.enabled;
      maskedCount = typed.maskedCount;
      scheduleComposerCueRefresh();
    }
  });
}

function boot() {
  debugLog("content", "boot", {
    hostname: window.location.hostname,
    href: window.location.href
  });
  ensureStyle();
  installMistralFetchMaskBridge();
  void refreshLocalState();
  installEventListeners();
  installRuntimeMessageListener();
  installMutationObserver();
  scheduleRehydrate();
  scheduleComposerCueRefresh();
}

// Install submit interception listeners as early as possible.
installEventListeners();
installMistralFetchMaskBridge();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
