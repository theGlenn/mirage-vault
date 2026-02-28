export type ComposerElement = HTMLTextAreaElement | HTMLElement;

const COMPOSER_SELECTORS = [
  "#prompt-textarea",
  "textarea[data-testid*='prompt']",
  "div.ProseMirror[contenteditable='true']",
  "div[contenteditable='true'][data-testid*='prompt']",
  "div[role='textbox'][contenteditable='true']",
  "textarea[placeholder*='Message']",
  "textarea"
];

function isVisible(element: Element): boolean {
  const htmlElement = element as HTMLElement;
  const style = window.getComputedStyle(htmlElement);
  const rect = htmlElement.getBoundingClientRect();
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    (rect.width > 0 || rect.height > 0)
  );
}

function isComposerCandidate(element: Element): element is ComposerElement {
  if (!isVisible(element)) {
    return false;
  }
  if (element instanceof HTMLTextAreaElement) {
    return true;
  }
  if (element instanceof HTMLElement && element.isContentEditable) {
    return true;
  }
  return false;
}

export function findComposer(): ComposerElement | null {
  // Chat UIs frequently use hidden helper textareas with rich-text editors (e.g. ProseMirror).
  // Probe specific prompt selectors first, then generic visible editables.
  for (const selector of COMPOSER_SELECTORS) {
    const candidate = document.querySelector(selector);
    if (candidate && isComposerCandidate(candidate)) {
      return candidate;
    }
  }

  const generic = [...document.querySelectorAll("[contenteditable='true'], textarea")];
  for (const node of generic) {
    if (isComposerCandidate(node)) {
      return node;
    }
  }
  return null;
}

export function getComposerText(composer: ComposerElement): string {
  if (composer instanceof HTMLTextAreaElement) {
    return composer.value;
  }
  return (composer.innerText || composer.textContent || "").replace(/\u00a0/g, " ");
}

export function setComposerText(composer: ComposerElement, nextText: string): void {
  if (composer instanceof HTMLTextAreaElement) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
    descriptor?.set?.call(composer, nextText);
    composer.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }

  // Fragile area: ChatGPT sometimes uses Lexical/React contenteditable state. Direct textContent
  // mutation plus input event is the lightweight fallback for MVP.
  composer.focus();
  composer.textContent = nextText;
  composer.dispatchEvent(new InputEvent("input", { bubbles: true, data: nextText, inputType: "insertText" }));
}

export function isNodeInsideComposer(node: Node | null): boolean {
  if (!node) {
    return false;
  }
  const element = node instanceof Element ? node : node.parentElement;
  return Boolean(element?.closest("#prompt-textarea, textarea, [contenteditable='true']"));
}

export function findSendButton(composer: ComposerElement): HTMLButtonElement | null {
  const parentForm = composer.closest("form");
  if (parentForm) {
    const submitButton = parentForm.querySelector("button[type='submit']:not([disabled])");
    if (submitButton instanceof HTMLButtonElement) {
      return submitButton;
    }
  }

  // Fallback strategy for ChatGPT variants that do not use type=submit consistently.
  const nearbyButtons = (composer.closest("form, main, body") ?? document.body).querySelectorAll("button");
  for (const button of nearbyButtons) {
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      continue;
    }
    const label = `${button.getAttribute("aria-label") ?? ""} ${button.getAttribute("data-testid") ?? ""}`.toLowerCase();
    if (label.includes("send")) {
      return button;
    }
  }
  return null;
}

export function isLikelySendButton(button: HTMLButtonElement, composer: ComposerElement): boolean {
  if (button.disabled) {
    return false;
  }
  const form = composer.closest("form");
  if (form && button.closest("form") === form) {
    if (button.type === "submit") {
      return true;
    }
    const label = `${button.getAttribute("aria-label") ?? ""} ${button.getAttribute("data-testid") ?? ""}`.toLowerCase();
    return label.includes("send");
  }

  const label = `${button.getAttribute("aria-label") ?? ""} ${button.getAttribute("data-testid") ?? ""}`.toLowerCase();
  return label.includes("send");
}
