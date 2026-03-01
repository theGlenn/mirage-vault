# CLAUDE.md - extension/

Context for working in the Chrome extension package.

## What this is

A Manifest V3 Chrome extension that performs reversible anonymization on LLM chat UIs. Supports ChatGPT (`chatgpt.com`, `chat.openai.com`) and Mistral Le Chat (`chat.mistral.ai`).

## Architecture

```
content script (DOM)  <──messages──>  background service worker (vault)
                                            ^
popup (toggle/stats)  <──messages──────────/
```

- **Content script** (`src/content/content.ts`): Injected into target pages. Intercepts user submissions, shows entity preview cue, rehydrates tokens in LLM responses via `MutationObserver`.
- **Background** (`src/background/background.ts`): Message router. Manages per-tab session state and vault.
- **Vault** (`src/background/vault.ts`): Token-to-original mapping. Handles `maskText` and `rehydrate` operations.
- **Shared** (`src/shared/`): Entity detection and masking logic. Platform-independent - this will become `@mirage-shroud/core`.
- **Popup** (`src/popup/`): Toggle ON/OFF, displays masked entity count.
- **Mistral Bridge** (`src/content/mistralBridge.ts`): Runs in `MAIN` world to intercept `window.fetch` for Mistral's API calls. Communicates with content script via `window.postMessage`.

## Key files

| File | Purpose |
|------|---------|
| `src/shared/tokenizer.ts` | Core: entity detection (regex + compromise.js), masking, token replacement |
| `src/shared/types.ts` | All TypeScript interfaces and message types |
| `src/shared/orgDictionary.ts` | Editable list of known organization names |
| `src/background/vault.ts` | Vault operations: stable token assignment, rehydration |
| `src/background/state.ts` | Per-tab session state (`enabled`, `maskedCount`, `vault`) |
| `src/content/content.ts` | DOM interception, preview cue, response scanning |
| `src/content/detector.ts` | Finds composer textarea and send button in ChatGPT/Mistral DOM |
| `src/manifest.json` | MV3 manifest: permissions, content script targets, service worker |

## Commands

```bash
pnpm install        # install deps
pnpm build          # build to dist/
pnpm dev            # watch mode (esbuild)
pnpm test           # compile tests + run with node:test
pnpm run demo       # CLI demo of full masking pipeline
pnpm run typecheck  # tsc --noEmit
```

## Build

- Bundler: **esbuild** via `scripts/build.mjs`.
- Entry points: `background.ts`, `content.ts`, `mistralBridge.ts`, `popup.ts`.
- Output: `dist/` (IIFE bundles targeting Chrome 114+).
- Source maps enabled.

## Testing

- Uses Node.js built-in `node:test` + `node:assert/strict`.
- Tests compile to `.test-dist/` via a separate `tsconfig.test.json` (CommonJS output).
- Test files: `tests/tokenizer.test.ts`, `tests/state-vault.test.ts`.

## Entity detection

| Type | Method | File |
|------|--------|------|
| EMAIL | Regex | `tokenizer.ts` |
| PHONE | Regex | `tokenizer.ts` |
| AMT | Regex (supports $, EUR, GBP, shorthand like `$5.2M`) | `tokenizer.ts` |
| ORG | compromise.js `.organizations()` + dictionary lookup | `tokenizer.ts`, `orgDictionary.ts` |
| PERSON | compromise.js `.people()`, filtered to 2+ word names | `tokenizer.ts` |

Overlap resolution: EMAIL > PHONE > AMT > ORG > PERSON priority. Longer spans win at equal priority.

## Constraints

- **Bundle size**: compromise.js adds ~680KB per entry point. Don't add heavy dependencies without good reason.
- **No persistence**: No `chrome.storage`, no IndexedDB. Vault is in-memory, per-tab, session-only.
- **No network calls**: All detection is local. Never send text to an external API.
- **DOM fragility**: Chat UI selectors break when providers update their UIs. `detector.ts` is the first place to look when things stop working.
- **MV3 service worker lifecycle**: Chrome may unload the background worker at any time. Vault data is lost when this happens. This is by design.
