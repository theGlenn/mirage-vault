# AETHER SHROUD (MVP Chrome Extension)

`AETHER SHROUD` is a Manifest V3 Chrome extension (TypeScript) that performs reversible anonymization in supported web chat UIs (`chat.openai.com`, `chatgpt.com`, and `chat.mistral.ai`) using a session-only in-memory vault stored in the background service worker.

## Features (MVP Scope)

- Outbound masking before submit (content script intercepts Enter/send button)
- Inbound token rehydration in rendered responses via `MutationObserver`
- Session-only vault in background memory (per-tab, no persistence)
- Popup toggle (ON/OFF) and masked entity count
- Entity detection (local, no external APIs):
  - `EMAIL`
  - `PHONE`
  - `AMT` (`$`, `€`, `£`)
  - `ORG` (dictionary keyword match)
  - `PERSON` (basic two-capitalized-words heuristic)
- Stable tokens within a tab session: `[[TYPE_N]]`

## Project Structure

- `src/content/content.ts`: chat UI interception, preview cue, response rehydration
- `src/content/detector.ts`: composer/send button DOM detection helpers (ChatGPT + Le Chat variants)
- `src/background/background.ts`: message router for content/popup
- `src/background/state.ts`: per-tab in-memory session state
- `src/background/vault.ts`: vault/token mapping and masking/rehydration
- `src/shared/tokenizer.ts`: entity detection, masking application, token replacement
- `src/shared/orgDictionary.ts`: sample ORG list (user-editable)
- `src/popup/*`: popup UI and logic
- `src/manifest.json`: MV3 manifest

## Setup

1. Install dependencies:

```bash
npm install
```

2. Build the extension:

```bash
npm run build
```

3. (Optional) Watch mode during development:

```bash
npm run dev
```

4. Run unit tests for core masking/vault logic:

```bash
npm test
```

5. Run an automated demo walkthrough:

```bash
npm run demo
```

Notes:
- Tests compile into a temporary `.test-dist/` folder before execution (ignored by `.gitignore`).
- Coverage focuses on core reversible anonymization logic (detector/tokenizer + session vault/state), not DOM/content-script integration.

## Automated CLI Demo

Run:

```bash
npm run demo
```

What it shows:
- Original client prompt
- Local entity detections
- Masked outbound payload (what cloud LLM receives)
- Simulated LLM response with tokens
- Rehydrated user-visible response
- Session state + protection toggle-off behavior
- Assertion summary (`PASS`/`FAIL`)

Options:

```bash
npm run demo -- --prompt 'Draft an email to Jane Doe at jane@example.com about $1200 for OpenAI.'
npm run demo -- --strict
```

## Load Unpacked Extension

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the repository `dist/` folder.

## Live Browser Demo (Masked Network Payload + Restored UI)

1. Open one of:
   - `https://chatgpt.com`
   - `https://chat.mistral.ai/chat`
2. Enable AETHER SHROUD in the popup.
3. Open DevTools (`F12`) and go to **Network**.
4. Send a prompt containing sensitive values, for example:
   - `Email Jane Doe at jane.doe@example.com and call +1 (415) 555-1212 about $2,450 for OpenAI.`
5. Inspect the chat request payload in Network.
   - Expected: outbound payload includes tokens like `[[EMAIL_1]]`, `[[PHONE_1]]`, `[[AMT_1]]`, `[[ORG_1]]`, `[[PERSON_1]]` instead of the originals.
6. Let the assistant respond and watch the page output.
   - Expected: any echoed tokens in assistant text are rehydrated in the rendered UI back to the original values for the current tab session.
7. Toggle extension OFF and send another prompt.
   - Expected: no masking occurs; masked count stays unchanged.

## Debug Logging

The extension now emits prefixed logs to help diagnose masking flow:

- Content script logs: `[AETHER][content] ...`
- Mistral page-bridge logs: `[AETHER][mistralBridge] ...`
- Background service worker logs: `[AETHER][background] ...`

Where to inspect:

1. **Page DevTools Console** on `https://chat.mistral.ai/chat`
   - Includes content + mistralBridge logs
2. **Extension service worker console**
   - Open `chrome://extensions` -> AETHER SHROUD -> **Service Worker** -> **Inspect**
   - Includes background logs

Quick checks for `chat.mistral.ai`:

- You should see `[AETHER][mistralBridge] installed` after page load.
- On send, you should see `[AETHER][mistralBridge] intercepted target fetch`.
- Then `[AETHER][content] mistral bridge request received` and `[AETHER][background] request received maskText`.
- If you see `request JSON shape unexpected; content array missing`, Mistral changed request structure and bridge matching needs an update.

## ORG Dictionary (User-editable Constant)

Edit `src/shared/orgDictionary.ts` and rebuild. Add/remove organization names to tune `ORG` detection.

## Unit Test Coverage (Core Functions)

Current unit tests validate:
- Entity detection for MVP types (`EMAIL`, `PHONE`, `AMT`, `ORG`, `PERSON`)
- Shorthand amount detection such as `$5.2M`
- Ordered masking/token replacement behavior
- Token rehydration with fallback passthrough for unknown/malformed tokens
- Session vault token reuse (stable mappings within a tab session)
- Per-tab state behavior (`enabled` toggle, masked count tracking, session reset)

## Limitations / MVP Risks

- Chat UI DOM selectors are fragile and may break when providers update composer/send button structure.
- Contenteditable mutation (`setComposerText`) is best-effort and may fail on some UI variants because chat UIs may use internal editor state managers.
- `PERSON` heuristic is intentionally simple and produces false positives/false negatives.
- ORG matching is dictionary-based only (no NLP), so coverage is limited to configured keywords.
- Rehydration scans text nodes and may miss values embedded in non-text render paths.
- Service worker memory is session-scoped and may reset if Chrome unloads the worker or the tab closes (vault is not persisted by design).

## Security / Privacy Notes

- No external API calls are used.
- Original sensitive values are only stored in background service worker memory maps, per tab session.
- No `chrome.storage` persistence is used in this MVP.
