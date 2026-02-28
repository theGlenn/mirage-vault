# CLAUDE.md

Project-level context for AI coding agents working on the Aether Shroud monorepo.

## What this project is

Aether Shroud is a privacy layer for LLM interactions. It performs reversible redaction of sensitive data (PII, secrets, financial data) before it reaches cloud LLM providers, and rehydrates tokens in the response so the user sees original values.

Two products share a common core:
- **extension/** - Chrome Extension (MV3) that intercepts chat UIs (ChatGPT, Mistral)
- **aether-vault/** - Tauri desktop app (Svelte 5 + Rust) for file-level redaction, persistent vault, and local LLM-assisted detection

## Repo structure

```
aether-shroud-mvp/
├── extension/          Chrome extension (TypeScript, esbuild, compromise.js)
├── aether-vault/       Tauri desktop app (SvelteKit, Rust backend)
├── design/             Design files (.pen) and inspiration screenshots
├── ROADMAP.md          Product plan (phases 1-3)
├── RESEARCH.md         Technical research on redaction techniques
├── BRAINSTORM.md       Working brainstorm between contributors
└── justfile            Task runner (empty, being set up)
```

No formal monorepo tooling yet (no pnpm workspaces, no turborepo). Each package has its own `package.json` and is built independently. A shared `@aether-shroud/core` package is planned but not yet extracted.

## Key concepts

- **Vault**: Bidirectional map of `token <-> original value`. Session-scoped in the extension (in-memory `Map`), persistent in the desktop app (SQLite, planned).
- **Token format**: `[[TYPE_N]]` (e.g., `[[EMAIL_1]]`, `[[PERSON_2]]`).
- **Entity types**: `EMAIL`, `PHONE`, `AMT`, `ORG`, `PERSON`.
- **Masking strategies**: Token redaction (current), structure-preserving substitution (planned).
- **Rehydration**: Replacing tokens in LLM responses back to original values.

## Working in this repo

- **Extension commands** run from `extension/`:
  - `pnpm install` / `pnpm build` / `pnpm dev` / `pnpm test`
- **Vault app commands** run from `aether-vault/`:
  - `pnpm install` / `pnpm tauri dev` / `pnpm check`
- There is no root package.json. Run commands inside the respective package directory.

## Code style

- TypeScript strict mode everywhere.
- No external API calls for detection - all processing is local.
- No `chrome.storage` persistence in the extension (session-only by design).
- Prefer Node.js built-in test runner (`node:test`) over Jest/Mocha.
- esbuild for bundling the extension, Vite for the Vault app.

## Design files

The `design/` directory contains `.pen` files. These are encrypted and must be accessed via Pencil MCP tools only, not via `Read` or `Grep`.

## Important constraints

- Extension service worker bundle size matters. compromise.js is ~680KB - be mindful of adding dependencies.
- The extension runs in Chrome's MV3 sandbox. No filesystem, no persistent background, no native modules.
- Raw sensitive data must never leave the user's machine unmasked. This is a security invariant across the entire project.
