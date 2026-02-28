import type { GetStateResponse, SetEnabledResponse } from "../shared/types";

const toggleEl = document.getElementById("enabledToggle") as HTMLInputElement | null;
const countEl = document.getElementById("maskedCount") as HTMLElement | null;
const statusEl = document.getElementById("statusText") as HTMLElement | null;

let activeTabId: number | null = null;

function setStatus(message: string) {
  if (statusEl) {
    statusEl.textContent = message;
  }
}

function setCount(count: number) {
  if (countEl) {
    countEl.textContent = String(count);
  }
}

function setToggle(enabled: boolean, disabled = false) {
  if (!toggleEl) {
    return;
  }
  toggleEl.checked = enabled;
  toggleEl.disabled = disabled;
}

function queryActiveTab(): Promise<chrome.tabs.Tab | null> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(tabs[0] ?? null);
    });
  });
}

function sendMessageToBackground<T>(message: object): Promise<T | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response: T | undefined) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(response ?? null);
    });
  });
}

async function refreshState() {
  if (activeTabId === null) {
    setStatus("Open ChatGPT in the active tab.");
    setToggle(false, true);
    setCount(0);
    return;
  }

  const response = await sendMessageToBackground<GetStateResponse>({
    kind: "getState",
    tabId: activeTabId
  });

  if (!response || !response.ok || response.kind !== "getState") {
    setStatus("Unable to read tab session state.");
    return;
  }

  setToggle(response.enabled, false);
  setCount(response.maskedCount);
  setStatus(response.enabled ? "Protection is active for this tab session." : "Protection is paused for this tab session.");
}

async function handleToggleChange() {
  if (!toggleEl || activeTabId === null) {
    return;
  }
  const enabled = toggleEl.checked;
  setToggle(enabled, true);
  const response = await sendMessageToBackground<SetEnabledResponse>({
    kind: "setEnabled",
    tabId: activeTabId,
    enabled
  });
  if (!response || !response.ok || response.kind !== "setEnabled") {
    setStatus("Unable to update protection state.");
    setToggle(!enabled, false);
    return;
  }
  setToggle(response.enabled, false);
  setCount(response.maskedCount);
  setStatus(response.enabled ? "Protection is active for this tab session." : "Protection is paused for this tab session.");
}

async function init() {
  setStatus("Loading active tab…");
  const activeTab = await queryActiveTab();
  activeTabId = typeof activeTab?.id === "number" ? activeTab.id : null;

  if (activeTabId === null) {
    setStatus("No active tab detected.");
    setToggle(false, true);
    return;
  }

  toggleEl?.addEventListener("change", () => {
    void handleToggleChange();
  });

  await refreshState();
}

void init();
