# AGENT.md

Guidelines for AI agents (Claude Code, Cursor, Copilot, etc.) operating in this repository.

## Before you start

1. Read the root `CLAUDE.md` for project context.
2. Read the `CLAUDE.md` in the specific package you're working in (`extension/CLAUDE.md`, `design/CLAUDE.md`).
3. If the task involves product direction, read `ROADMAP.md`. If it involves technical research, read `RESEARCH.md`.

## Rules

### Security invariants (never violate)

- Raw sensitive data must never leave the user's machine. If you're writing code that sends data over the network, the data must be masked first.
- Vault mappings (token-to-original) must never be transmitted to external services.
- Encryption at rest must use established primitives (AES-256-GCM or better). No custom cryptography.
- The extension must store nothing to disk. Session-only, in-memory vault only.

### Code conventions

- TypeScript strict mode. No `any` unless absolutely unavoidable and commented.
- No new runtime dependencies in `extension/` without discussion. Bundle size is critical (~680KB from compromise.js alone).
- Use Node.js built-in `node:test` and `node:assert/strict` for tests. No Jest, no Mocha.
- No external API calls for entity detection. All NLP/regex processing runs locally.
- Keep `src/shared/` (future `@aether-shroud/core`) free of platform-specific imports (no `chrome.*`, no `window.*`, no Node.js-only APIs).

### Architecture awareness

- The `extension/src/shared/` directory is the embryo of `@aether-shroud/core`. Code here must work in both browser and Node.js contexts.
- The extension uses a message-passing architecture: content script <-> background service worker <-> popup. Changes to message types in `src/shared/types.ts` affect all three.
- The Vault app (aether-vault/) uses Tauri v2: Svelte 5 frontend in a webview, Rust backend for filesystem/crypto/SQLite. Masking logic should run in the frontend (TypeScript), not in Rust.

### What NOT to do

- Don't add `chrome.storage` usage to the extension. Vault is session-only by design.
- Don't add network calls to the shared/core detection logic.
- Don't modify `.pen` files with text tools. Use Pencil MCP tools only.
- Don't introduce new test frameworks.
- Don't add documentation files beyond what's requested. No auto-generated JSDoc dumps.

### Working with the extension

```bash
cd extension
pnpm install
pnpm build          # one-shot build to dist/
pnpm dev            # watch mode
pnpm test           # compile + run tests
pnpm run demo       # interactive demo of masking pipeline
pnpm run typecheck  # tsc --noEmit
```

The extension targets Chrome 114+. Build output goes to `extension/dist/`. Load unpacked from that directory in `chrome://extensions`.

### Working with the Vault app

```bash
cd aether-vault
pnpm install
pnpm tauri dev      # launch Tauri dev window (Vite HMR + Rust rebuild)
pnpm check          # svelte-check + TypeScript
```

Rust backend is in `aether-vault/src-tauri/`. Frontend is standard SvelteKit with static adapter.

### Working with design files

Design assets live in `design/`. The `vault.pen` file contains UI designs for the Vault app. Access it only through Pencil MCP tools (`batch_get`, `batch_design`, `get_screenshot`, etc.). Never `cat` or `grep` a `.pen` file.

## Task patterns

### Adding a new entity type
1. Add the type to `EntityType` union in `extension/src/shared/types.ts`.
2. Add a detector function in `extension/src/shared/tokenizer.ts`.
3. Wire it into `detectEntities()` in the same file.
4. Add test cases in `extension/tests/tokenizer.test.ts`.
5. Run `pnpm test` from `extension/`.

### Modifying the masking pipeline
1. Read `extension/src/shared/tokenizer.ts` (detection + masking logic).
2. Read `extension/src/background/vault.ts` (vault operations, `maskText`, `rehydrate`).
3. Make changes. Ensure `unmask(mask(x)) === x` roundtrip holds.
4. Run tests. Run the demo (`pnpm run demo`) to visually verify.

### Adding a Tauri command
1. Define the command in `aether-vault/src-tauri/src/lib.rs` or a new module.
2. Register it in the Tauri builder's `invoke_handler`.
3. Call it from the Svelte frontend via `@tauri-apps/api/core`.
