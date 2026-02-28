import { SessionVault } from "./vault";

export interface TabSessionState {
  enabled: boolean;
  maskedCount: number;
  vault: SessionVault;
}

const sessions = new Map<number, TabSessionState>();

function createSession(): TabSessionState {
  return {
    enabled: true,
    maskedCount: 0,
    vault: new SessionVault()
  };
}

function getOrCreateSession(tabId: number): TabSessionState {
  const existing = sessions.get(tabId);
  if (existing) {
    return existing;
  }
  const created = createSession();
  sessions.set(tabId, created);
  return created;
}

export function maskTextForTab(tabId: number, text: string) {
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

export function rehydrateTextForTab(tabId: number, text: string) {
  const session = getOrCreateSession(tabId);
  return { restoredText: session.vault.rehydrateText(text) };
}

export function getTabState(tabId: number) {
  const session = getOrCreateSession(tabId);
  return {
    enabled: session.enabled,
    maskedCount: session.maskedCount
  };
}

export function setTabEnabled(tabId: number, enabled: boolean) {
  const session = getOrCreateSession(tabId);
  session.enabled = enabled;
  return {
    enabled: session.enabled,
    maskedCount: session.maskedCount
  };
}

export function clearTabSession(tabId: number) {
  sessions.delete(tabId);
}
