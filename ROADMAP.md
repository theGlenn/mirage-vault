# Aether Shroud - Product Roadmap

> Implementation plan grounded in the research and brainstorming docs.
> Two products, one core: a **desktop Vault app** and a **browser extension**, sharing `@aether-shroud/core`.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    @aether-shroud/core                      │
│                  (pure TS, zero platform deps)              │
│                                                             │
│  Detectors        Strategies        Vault Interface         │
│  ├── regex        ├── token         ├── in-memory (ext)     │
│  ├── nlp          ├── structure-    ├── SQLite (desktop)    │
│  └── llm-assist       preserving   └── encrypted-at-rest   │
│                   ├── generalize                            │
│                   └── noise                                 │
│                                                             │
│  codec.ts  ──  mask(text, policy) / unmask(text, vault)     │
│  policy.ts ──  rules engine (entity type -> strategy)       │
└──────────────┬────────────────────────┬─────────────────────┘
               │                        │
    ┌──────────┴──────────┐  ┌──────────┴──────────────┐
    │  Chrome Extension   │  │  Vault Desktop App      │
    │  (thin DOM adapter) │  │  (Tauri)                │
    │                     │  │                          │
    │  - Chat UI intercept│  │  - File drop & process  │
    │  - Preview cue      │  │  - Persistent vault     │
    │  - Rehydration      │  │  - Local LLM inference  │
    │  - Popup toggle     │  │  - Export (zip, copy)   │
    └─────────────────────┘  │  - MCP server           │
                             └──────────────────────────┘
```

---

## Phase 1: Vault App + Masking Techniques

The desktop Vault app is the centerpiece. It removes all browser extension constraints (bundle size, cold starts, no filesystem, no persistence) and becomes the place where heavier computation lives.

### 1a. Vault App (Tauri)

**What it is**: A local desktop application where users drop sensitive files and text, browse masked/unmasked versions side by side, and export redacted copies.

#### Core Features

**Drop zone & ingestion**
- Drag-and-drop files into the vault. Supported formats to start: `.txt`, `.md`, `.csv`, `.json`.
- Paste raw text via a text input area.
- Each ingested item gets an entry in the vault: original (encrypted at rest) + masked version + metadata (detected entities, masking strategy used, timestamp).

**File browser**
- List all vault items with search and filter.
- Toggle between **masked view** and **raw/unmasked view** per file.
- Entity highlights: in the raw view, detected entities are visually highlighted with color-coded badges by type (PERSON, ORG, EMAIL, etc.).
- Entity list panel: sidebar showing all detected entities across the vault, with counts and masking status.

**Export**
- Copy masked text to clipboard (single file).
- Export as `.zip` archive (batch): masked files only, no originals, no vault mappings.
- Export format matches input format (masked `.pdf` out if `.pdf` in - stretch goal, start with text-based exports).

**Vault storage**
- SQLite database via Tauri's filesystem access.
- Schema: `items(id, name, type, raw_encrypted, masked, created_at)`, `entities(id, item_id, type, original, substitution, span_start, span_end)`, `mappings(vault_session_id, token, original)`.
- Encryption at rest: application-level encryption. Raw originals encrypted per-field using AES-256-GCM via Rust `ring` crate before writing to SQLite. Metadata columns (name, type, timestamps) remain in plaintext for queryability. Key derived from user passphrase via Argon2.
- Vault is local-only. Never synced, never uploaded.

**Tauri specifics**
- Rust backend for filesystem, SQLite, and encryption. TypeScript frontend (framework TBD - Solid, Svelte, or React based on team preference).
- `@aether-shroud/core` runs in the frontend webview for masking logic. Rust side handles storage and crypto only.
- Tauri v2 for multi-window support if needed later.

#### Technical Decisions

| Decision | Resolved | Notes |
|----------|----------|-------|
| Frontend framework | **Svelte 5** | Already scaffolded in `aether-vault/` |
| Storage engine | **SQLite** (`rusqlite`) | Relational queries for cross-file entity search, mature ecosystem |
| PDF parsing | **Deferred to Phase 1b** | Rust-side (`lopdf`) when implemented. Phase 1 ships with text formats only. |
| Encryption at rest | **App-level AES-256-GCM** via Rust `ring` | Per-field encryption of sensitive columns. Key from user passphrase via Argon2. |

### 1b. Masking Techniques

This is where the research meets implementation. Phase 1 focuses on getting two masking strategies working end-to-end.

#### Strategy 1: Token Redaction (current, ported to core)

What exists today in the Chrome extension, extracted into `@aether-shroud/core`:
- Regex detectors: EMAIL, PHONE, AMT.
- NLP detectors: PERSON, ORG (compromise.js).
- Output: `[[TYPE_N]]` tokens.
- Vault mapping: `token <-> original`.

This becomes the baseline. Works for all text. Fast. No external dependencies beyond compromise.js.

#### Strategy 2: Structure-Preserving Substitution (new)

The key research contribution. Replace entities with type-consistent fakes.

Implementation plan:

**Synthetic name generator**
- Maintain curated lists of first names (diverse, multi-cultural, ~500 entries) and last names (~500 entries).
- Generate fake names by combining entries, filtered against a blocklist of public figures.
- Preserve name structure: if input is `"Dr. John Smith III"`, output is `"Dr. [First] [Last] III"`.
- Deterministic within a session: same input always maps to same fake (via vault lookup).

**Synthetic email generator**
- Domain mapping: all emails at `@acme.com` map to emails at a single fake domain `@[synth].org`.
- Local part derived from the fake person name if one was already generated for the person.

**Amount scaling**
- Random factor `k` drawn from `[0.75, 1.25]`, stored in vault.
- Same `k` for all amounts in a session to preserve relative comparisons.
- Currency symbol preserved.

**Date shifting**
- Random offset `d` in `[-90, +90]` days, stored in vault.
- Same `d` for all dates in a session.

**Pluggable strategy interface**
```typescript
interface MaskingStrategy {
  name: string;
  supports(entityType: EntityType): boolean;
  substitute(entity: DetectedEntity, vault: VaultInterface): string;
  reverse(substitution: string, vault: VaultInterface): string;
}
```

#### LLM-Assisted Detection (Hybrid NLP x LLM)

For the Vault app (not the extension), we can use a local LLM to improve entity detection.

**How it works**:
- Regex + compromise.js run first (fast pass, catches obvious entities).
- Detected entities and surrounding context are sent to a local LLM with a structured prompt: *"Given this text, verify these detected entities and identify any additional PII I may have missed."*
- The LLM returns corrections and additions. These are merged into the entity list.
- This is a **refinement loop**, not a replacement. The fast detectors do 80% of the work; the LLM catches edge cases.

**Local LLM runtime options**:

| Runtime | Pros | Cons |
|---------|------|------|
| **Ollama** | Easy setup, wide model support, already popular with devs | Separate install, runs as a service |
| **xybrid.ai** | Embedded inference, no separate service | Newer, less proven |
| **llama.cpp via Tauri sidecar** | Full control, no external dependency | Significant engineering to bundle and manage |
| **ONNX Runtime** | Small models, fast, embeddable | Limited to models exported to ONNX |

**Recommended starting point**: Ollama. It's the path of least resistance. Users who have Ollama installed get enhanced detection. Users who don't still get regex + compromise.js. The Vault app detects whether Ollama is running and enables/disables LLM-assisted detection accordingly.

**Model choice for detection**: A small model is sufficient (Phi-3 Mini, Qwen2-0.5B, or similar). We're asking for NER-style structured output, not general reasoning. Quantized 4-bit models run in <1s on modern hardware.

#### Document Processing

**Phase 1 formats** (`.txt`, `.md`, `.csv`, `.json`):
- Direct text processing. Straightforward.
- For `.csv` and `.json`: parse structure, mask values only (preserve keys/headers).

**Phase 1b milestone: PDF support** (post core vault loop):
- Deferred from Phase 1 to reduce scope. Implement once the core ingest → detect → mask → browse → export loop is validated with text-based formats.
- Recommended approach: Rust-side extraction via `lopdf` / `pdf-extract` in the Tauri backend, sending extracted text to the frontend for masking.
- Extract text layer from native PDFs. Image-based PDFs (scanned documents) require OCR and are out of scope.
- Export: start with `.txt` export of masked content. Masked PDF output is a stretch goal.

**Future formats** (post Phase 1b):
- `.docx`: Extract text via `mammoth` or similar, mask, reconstruct.
- Images with text: OCR via Tesseract (Rust or WASM), mask detected text regions.
- Code files: Developer-focused detection (API keys, secrets, internal URLs).

---

## Phase 2: Connect Vault and Extension

The extension currently operates standalone with a session-only in-memory vault. Phase 2 connects it to the desktop Vault app, making the extension a thin client for a persistent, LLM-enhanced masking backend.

### Communication Channel

**Extension <-> Vault App communication options**:

| Method | How it works | Pros | Cons |
|--------|-------------|------|------|
| **Native Messaging** | Chrome's `chrome.runtime.connectNative()` talks to a native host binary bundled with the Vault app | Official Chrome API, secure, no network exposure | Requires native host manifest registration, platform-specific setup |
| **Local WebSocket** | Vault app runs a WS server on `localhost:PORT`, extension connects | Simple, bidirectional, works cross-browser | Port conflicts, must handle reconnection, security (any local app can connect) |
| **Local HTTP** | Vault app runs an HTTP server on `localhost:PORT` | Simplest to implement | No push from server to extension, polling needed |

**Recommended**: Native Messaging for production (secure, no port exposure). Local WebSocket for development and prototyping (easier to debug). Support both, let user configure.

### What the Connection Enables

**Extension uses Vault's masking engine**:
- Instead of running compromise.js in the service worker (~680KB, cold start penalty), the extension sends text to the Vault app for masking.
- The Vault app runs the full detection pipeline (regex + NLP + local LLM if available).
- Extension becomes truly thin: just DOM interception, message passing, and rehydration.

**Extension uses Vault's persistent vault**:
- Tokens are consistent across sessions and tabs because the vault is centralized.
- User can review all masked entities from all chat sessions in the Vault app's entity browser.

**Extension can reference vault documents**:
- User drops a sensitive document into the Vault. When chatting with an LLM, the extension can insert the *masked version* of that document into the prompt.
- Workflow: user clicks "attach vault file" in extension popup -> picks file from vault -> masked content is pasted into composer.

**Fallback mode**:
- If the Vault app is not running, the extension falls back to standalone mode (current behavior: in-memory vault, compromise.js detectors).
- The extension should auto-detect Vault availability and switch modes transparently.

### Extension Refactoring

To support both standalone and connected modes:

```typescript
interface MaskingBackend {
  mask(text: string, policy: Policy): Promise<MaskResult>;
  unmask(text: string): Promise<string>;
  isAvailable(): Promise<boolean>;
}

class LocalBackend implements MaskingBackend { /* current in-memory approach */ }
class VaultBackend implements MaskingBackend { /* delegates to Vault app */ }
```

The extension tries `VaultBackend` first, falls back to `LocalBackend`.

---

## Phase 3: Beyond - MCP Server and Remote Access

### The Vision

LLM clients (Claude Desktop, ChatGPT, Mistral Le Chat, Cursor, etc.) increasingly support **MCP (Model Context Protocol)** for connecting to external tools and data sources. If the Vault app exposes an MCP server, these clients can access vault documents directly - with masking applied transparently.

This means: instead of the user manually copying masked text, the LLM client *pulls* from the vault and receives pre-masked content. The user's sensitive files never leave their machine in raw form.

### MCP Server in the Vault App

**Resources the MCP server exposes**:
- `vault://documents` - List all vault items (names, types, timestamps).
- `vault://documents/{id}/masked` - Retrieve masked version of a document.
- `vault://entities` - List all detected entities across the vault.

**Tools the MCP server exposes**:
- `mask_text(text)` - Accept raw text, return masked version. The LLM client can call this before sending user input to the cloud.
- `unmask_text(text)` - Accept text containing tokens/substitutions, return original. For local post-processing.
- `mask_file(path)` - Accept a file path, ingest into vault, return masked content.

**What the MCP server does NOT expose**:
- Raw/unmasked document content. Ever. The MCP server only serves masked data.
- Vault mappings. The token-to-original map never leaves the Vault app.

### The Tunneling Problem

MCP works over local connections (stdio, local HTTP). For cloud-hosted LLM clients that can't reach `localhost`, we need a way to tunnel.

**Options**:

| Approach | How | Pros | Cons |
|----------|-----|------|------|
| **Cloudflare Tunnel / ngrok** | Expose local MCP server via a public URL | No infra to manage, works immediately | Third-party dependency, latency, requires auth layer |
| **Tailscale / WireGuard** | VPN mesh, Vault app is a node | Encrypted, no public exposure | Requires Tailscale account, setup for non-technical users |
| **Custom relay server** | Thin relay we host, Vault app connects outbound (WebSocket), cloud LLM client connects to relay | Full control, outbound-only from user machine | We must operate infra, trust model for relay |
| **No tunnel - local only** | Only support MCP clients that run locally (Claude Desktop, Cursor, local scripts) | Zero attack surface, simplest | Excludes web-based LLM clients |

**Recommended starting point**: Local-only MCP. Support Claude Desktop and Cursor first - they run on the user's machine and can connect to the Vault's MCP server via stdio or local HTTP. This covers the most valuable use cases without any tunneling complexity.

**Later**: Add optional Cloudflare Tunnel integration for users who want remote access. This should be opt-in, clearly explained, and require authentication (API key or OAuth). The Vault app generates a unique access token, the tunnel is authenticated, and the MCP server validates every request.

### User Experience for MCP

The goal is zero-friction:

1. User installs Vault app. MCP server starts automatically on a local port.
2. In Claude Desktop settings, user adds the Vault MCP server (or the Vault app auto-registers via Claude's MCP config file).
3. User asks Claude: *"Summarize the contract I uploaded."* Claude calls `vault://documents/contract.pdf/masked`, receives the masked version, summarizes it.
4. User sees the summary in Claude with tokens. The Vault app (or extension) rehydrates tokens in the UI.

Step 4 is the tricky part for cloud-based clients. Rehydration options:
- **Clipboard rehydration**: User copies Claude's response, pastes into Vault app, gets unmasked version.
- **Extension rehydration**: If using Claude in a browser, the Chrome extension detects tokens in the response and rehydrates them (current behavior, already works).
- **Vault app companion view**: Vault app shows a live feed of the conversation with tokens automatically rehydrated.

---

## Cross-Cutting Concerns

### Core Library Extraction

**Deferred.** Build detection and masking logic directly in `aether-vault/` first. Extract `@aether-shroud/core` once the Vault app works end-to-end and interfaces have stabilized. Target: after Phase 1, before Phase 2 (when the extension needs to share code).

Planned package structure when extracted:

```
packages/
  core/
    src/
      detectors/
        regex.ts        (EMAIL, PHONE, AMT, API_KEY, etc.)
        nlp.ts          (PERSON, ORG via compromise.js)
        llm.ts          (LLM-assisted detection - optional)
        index.ts        (detector registry, pluggable interface)
      strategies/
        token.ts        (current [[TYPE_N]] approach)
        substitution.ts (structure-preserving fakes)
        generalize.ts   (category-level replacement)
        index.ts        (strategy registry)
      vault/
        interface.ts    (VaultInterface: get, set, has, export)
        memory.ts       (Map-based, for extension)
        sqlite.ts       (SQLite-based, for Vault app)
      codec.ts          (mask / unmask entry points)
      policy.ts         (rules: entity type -> strategy mapping)
      types.ts          (shared types)
    tests/
    package.json
  extension/
    (current src/ minus shared/, imports from @aether-shroud/core)
  vault-app/
    (Tauri project, imports from @aether-shroud/core)
```

Workspace managed via npm/pnpm workspaces or Turborepo.

### Testing Strategy

- **Core**: Unit tests for every detector, strategy, and vault implementation. Property-based tests for roundtrip (`unmask(mask(x)) === x`). Benchmark suite for masking throughput.
- **Extension**: Integration tests against recorded DOM snapshots (current approach, extended).
- **Vault app**: E2E tests via Tauri's test framework (WebDriver-based). File processing tests with fixture documents.

### Security Invariants

These must hold across all phases:

1. Raw sensitive data never leaves the user's machine unmasked.
2. Vault mappings (token -> original) are never transmitted to any external service.
3. The MCP server never exposes unmasked content, even to authenticated clients.
4. Encryption at rest uses established primitives (AES-256-GCM or better). No custom crypto.
5. The extension in standalone mode stores nothing to disk (current behavior, preserved).
