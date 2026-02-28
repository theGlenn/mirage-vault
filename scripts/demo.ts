import * as assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import { clearTabSession, getTabState, maskTextForTab, rehydrateTextForTab, setTabEnabled } from "../src/background/state";
import { detectEntities } from "../src/shared/tokenizer";

const TOKEN_REGEX = /\[\[[A-Z]+_\d+\]\]/g;
const DEFAULT_TAB_ID = 4242;
const DEFAULT_PROMPT =
  "Jane Doe is reviewing Q3 revenue for OpenAI: $5.2M. Email jane.doe@example.com or call +1 (415) 555-1212.";

interface CliOptions {
  prompt: string;
  strict: boolean;
}

function parseCliOptions(argv: string[]): CliOptions {
  const options: CliOptions = {
    prompt: DEFAULT_PROMPT,
    strict: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--strict") {
      options.strict = true;
      continue;
    }
    if (arg === "--prompt") {
      options.prompt = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printUsageAndExit();
    }
  }

  return options;
}

function printUsageAndExit(): never {
  console.log("AETHER SHROUD Demo");
  console.log("");
  console.log("Usage:");
  console.log("  npm run demo");
  console.log("  npm run demo -- --prompt \"Text with sensitive values\"");
  console.log("  npm run demo -- --strict");
  process.exit(0);
}

function collectUniqueTokens(text: string): string[] {
  const matches = text.match(TOKEN_REGEX) ?? [];
  return [...new Set(matches)];
}

function renderSection(title: string) {
  const rule = "-".repeat(72);
  console.log(`\n${rule}`);
  console.log(title);
  console.log(rule);
}

function run() {
  const options = parseCliOptions(process.argv.slice(2));
  const prompt = options.prompt.trim() || DEFAULT_PROMPT;

  clearTabSession(DEFAULT_TAB_ID);

  renderSection("1) CLIENT INPUT");
  console.log(prompt);

  const detections = detectEntities(prompt);
  renderSection("2) LOCAL DETECTIONS (ON DEVICE)");
  if (!detections.length) {
    console.log("No entities detected.");
  } else {
    for (const entity of detections) {
      console.log(`${entity.type.padEnd(6)} | "${entity.value}" | span ${entity.start}-${entity.end}`);
    }
  }

  const maskStart = performance.now();
  const masked = maskTextForTab(DEFAULT_TAB_ID, prompt);
  const maskLatencyMs = performance.now() - maskStart;

  renderSection("3) OUTBOUND PAYLOAD SENT TO CLOUD LLM");
  console.log(masked.maskedText);
  console.log(`\nMasked entities (this send): ${masked.entitiesCount}`);
  console.log(`Session masked count: ${masked.maskedCount}`);
  console.log(`Masking latency: ${maskLatencyMs.toFixed(2)}ms`);

  const observedTokens = collectUniqueTokens(masked.maskedText);
  const simulatedAssistantText = [
    "Acknowledged. I will keep these placeholders in the plan:",
    observedTokens.join(", ") || "(none)",
    "Unknown token passthrough check: [[ORG_999]]."
  ].join(" ");

  renderSection("4) SIMULATED LLM RESPONSE (TOKENIZED)");
  console.log(simulatedAssistantText);

  const rehydrated = rehydrateTextForTab(DEFAULT_TAB_ID, simulatedAssistantText).restoredText;
  renderSection("5) USER-VISIBLE RESPONSE AFTER REHYDRATION");
  console.log(rehydrated);

  const state = getTabState(DEFAULT_TAB_ID);
  renderSection("6) SESSION STATE");
  console.log(`Protection enabled: ${state.enabled}`);
  console.log(`Total masked entities in session: ${state.maskedCount}`);

  const toggled = setTabEnabled(DEFAULT_TAB_ID, false);
  const pausedMask = maskTextForTab(DEFAULT_TAB_ID, "Send to jane.doe@example.com and OpenAI for $900.");
  renderSection("7) TOGGLE OFF BEHAVIOR");
  console.log(`Protection enabled: ${toggled.enabled}`);
  console.log(`Text with protection OFF remains unchanged: ${pausedMask.maskedText}`);

  let failed = false;
  try {
    if (detections.length > 0) {
      assert.ok(masked.entitiesCount > 0, "Expected masked entities count > 0 when detections exist");
    }
    assert.ok(maskLatencyMs < 50, "Expected masking latency under 50ms for MVP target");
    assert.ok(rehydrated.includes("[[ORG_999]]"), "Unknown token should remain unchanged");
    for (const token of observedTokens) {
      assert.ok(!rehydrated.includes(token), `Expected token to be rehydrated: ${token}`);
    }
    assert.equal(pausedMask.entitiesCount, 0, "Expected no masking while protection is disabled");
  } catch (error) {
    failed = true;
    renderSection("DEMO ASSERTIONS");
    console.log(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!failed) {
    renderSection("DEMO ASSERTIONS");
    console.log("PASS: reversible anonymization flow validated.");
  }

  if (failed && options.strict) {
    process.exit(1);
  }
}

run();
