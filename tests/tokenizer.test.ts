import * as assert from "node:assert/strict";
import { test } from "node:test";

import { applyMasking, detectEntities, replaceKnownTokens } from "../src/shared/tokenizer";

test("detectEntities finds MVP entity types including shorthand amounts", () => {
  const input =
    "Send a note to Jane Doe at jane.doe@example.com or +1 (415) 555-1212 about $5.2M for OpenAI.";
  const entities = detectEntities(input);

  const byType = new Map(entities.map((entity) => [entity.type, entity.value]));

  assert.equal(byType.get("PERSON"), "Jane Doe");
  assert.equal(byType.get("EMAIL"), "jane.doe@example.com");
  assert.equal(byType.get("PHONE"), "+1 (415) 555-1212");
  assert.equal(byType.get("AMT"), "$5.2M");
  assert.equal(byType.get("ORG"), "OpenAI");
});

test("applyMasking replaces entities in-order and reports count", () => {
  const input = "Email jane@example.com about OpenAI for $1200.";
  const entities = detectEntities(input);
  let nextId = 0;

  const result = applyMasking(input, entities, (entity) => `[[${entity.type}_${++nextId}]]`);

  assert.equal(
    result.maskedText,
    "Email [[EMAIL_1]] about [[ORG_2]] for [[AMT_3]]."
  );
  assert.equal(result.entitiesCount, 3);
});

test("detectEntities prefers ORG over PERSON for identical spans", () => {
  const input = "Prepare a summary for Goldman Sachs.";
  const entities = detectEntities(input);
  const goldman = entities.find((entity) => entity.value === "Goldman Sachs");

  assert.ok(goldman);
  if (!goldman) {
    throw new Error("Expected Goldman Sachs to be detected");
  }
  assert.equal(goldman.type, "ORG");
  assert.equal(
    entities.some((entity) => entity.type === "PERSON" && entity.value === "Goldman Sachs"),
    false
  );
});

test("replaceKnownTokens restores known values and leaves unknown tokens unchanged", () => {
  const input = "Send [[EMAIL_1]] to [[ORG_1]] and keep [[PHONE_9]] as-is.";
  const output = replaceKnownTokens(input, (token) => {
    if (token === "[[EMAIL_1]]") {
      return "jane@example.com";
    }
    if (token === "[[ORG_1]]") {
      return "OpenAI";
    }
    return null;
  });

  assert.equal(output, "Send jane@example.com to OpenAI and keep [[PHONE_9]] as-is.");
});

test("replaceKnownTokens leaves drifted or malformed tokens unchanged", () => {
  const input = "Keep [[ORG-1]], [ORG_1], and [[ORG_ABC]] untouched.";
  const output = replaceKnownTokens(input, () => "SHOULD_NOT_REPLACE");

  assert.equal(output, input);
});
