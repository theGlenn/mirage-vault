import * as assert from "node:assert/strict";
import { test } from "node:test";

import { getTabState, clearTabSession, maskTextForTab, rehydrateTextForTab, setTabEnabled } from "../src/background/state";
import { SessionVault } from "../src/background/vault";

test("SessionVault reuses tokens within a session and rehydrates responses", () => {
  const vault = new SessionVault();

  const masked = vault.maskText("OpenAI paid OpenAI $100.");
  assert.equal(masked.maskedText, "[[ORG_1]] paid [[ORG_1]] [[AMT_1]].");
  assert.equal(masked.entitiesCount, 3);

  const restored = vault.rehydrateText("Summary: [[ORG_1]] budget was [[AMT_1]].");
  assert.equal(restored, "Summary: OpenAI budget was $100.");
});

test("per-tab state tracks counts, respects toggle, and resets on clear", () => {
  clearTabSession(101);
  clearTabSession(202);

  const first = maskTextForTab(101, "OpenAI invoice: $200");
  assert.equal(first.maskedText, "[[ORG_1]] invoice: [[AMT_1]]");
  assert.equal(first.entitiesCount, 2);
  assert.equal(first.maskedCount, 2);
  assert.equal(first.enabled, true);

  const secondTab = maskTextForTab(202, "OpenAI");
  assert.equal(secondTab.maskedText, "[[ORG_1]]");
  assert.equal(secondTab.maskedCount, 1);

  const toggled = setTabEnabled(101, false);
  assert.equal(toggled.enabled, false);
  assert.equal(toggled.maskedCount, 2);

  const disabledMask = maskTextForTab(101, "Email jane@example.com");
  assert.equal(disabledMask.maskedText, "Email jane@example.com");
  assert.equal(disabledMask.entitiesCount, 0);
  assert.equal(disabledMask.maskedCount, 2);
  assert.equal(disabledMask.enabled, false);

  const disabledRehydrate = rehydrateTextForTab(101, "Paused token [[EMAIL_9]].");
  assert.equal(disabledRehydrate.restoredText, "Paused token [[EMAIL_9]].");

  const restored = rehydrateTextForTab(101, "Check [[ORG_1]] and [[AMT_1]].");
  assert.equal(restored.restoredText, "Check OpenAI and $200.");

  clearTabSession(101);
  const resetState = getTabState(101);
  assert.equal(resetState.enabled, true);
  assert.equal(resetState.maskedCount, 0);

  const afterClearRestore = rehydrateTextForTab(101, "Check [[ORG_1]].");
  assert.equal(afterClearRestore.restoredText, "Check [[ORG_1]].");
});
