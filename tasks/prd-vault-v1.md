# PRD: Aether Vault v1 - Core Redaction Loop

## Introduction

Aether Vault v1 is a local desktop application that proves the core redaction loop: users drag in text files, the app detects and redacts sensitive data (PII, financial data, secrets), stores files locally with a token-to-original mapping vault, and lets users browse and export masked versions.

This version validates the end-to-end flow — ingest, detect, mask, browse, export — with regex + NLP-based detection. No encryption, no auth, no PDF support. The goal is a working product that demonstrates the privacy layer concept on local files.

**Tech stack:** Tauri 2 (Svelte 5 frontend, Rust backend), SQLite via `rusqlite`, compromise.js for NLP detection.

## Goals

- Validate the full ingest -> detect -> mask -> browse -> export pipeline end-to-end
- Detect PII using regex patterns (emails, phones, amounts, API keys) and compromise.js NLP (person names, organizations)
- Store original and masked file content in a local SQLite database
- Maintain a vault of token `[[TYPE_N]]` to original value mappings per file
- Let users visually browse masked files with entity highlights
- Support export to clipboard, single file, and batch zip

## User Stories

### US-001: Initialize SQLite database on first launch
**Description:** As a user, I want the app to set up its local storage automatically so I can start using it immediately.

**Acceptance Criteria:**
- [ ] On first launch, Rust backend creates a SQLite database in the Tauri app data directory
- [ ] Schema includes `items` table (id, name, file_type, raw_content, masked_content, created_at)
- [ ] Schema includes `entities` table (id, item_id, entity_type, original_value, token, span_start, span_end)
- [ ] If the database already exists, the app opens it without recreating
- [ ] Typecheck passes (`pnpm check` and `cargo check`)

### US-002: Drop zone for file ingestion
**Description:** As a user, I want to drag and drop text files into the app so I can quickly add files to my vault.

**Acceptance Criteria:**
- [ ] Main screen displays a drop zone area with visual affordance (dashed border, icon, instructional text)
- [ ] Drop zone accepts `.txt`, `.md`, `.csv`, `.json` files
- [ ] Unsupported file types are rejected with a visible error message
- [ ] Multiple files can be dropped at once
- [ ] Drop zone shows a visual hover state when files are dragged over it
- [ ] Typecheck passes
- [ ] Verify in browser using dev tools

### US-003: Text paste ingestion
**Description:** As a user, I want to paste raw text into the app so I can redact content that isn't in a file.

**Acceptance Criteria:**
- [ ] A text input area (textarea or similar) is available alongside the drop zone
- [ ] User can paste text and submit it for processing
- [ ] Pasted text is treated as a `.txt` item in the vault with an auto-generated name (e.g., "Pasted text - 2025-01-15 14:30")
- [ ] Typecheck passes
- [ ] Verify in browser using dev tools

### US-004: Regex-based entity detection
**Description:** As a developer, I need regex detectors for structured PII so that emails, phone numbers, financial amounts, and API keys are caught reliably.

**Acceptance Criteria:**
- [ ] Detector identifies email addresses (standard RFC-ish patterns)
- [ ] Detector identifies US/international phone numbers
- [ ] Detector identifies financial amounts ($1,234.56 style patterns, with currency symbols)
- [ ] Detector identifies common API key / secret patterns (AWS keys, generic hex/base64 tokens)
- [ ] Each detected entity returns: type, matched value, start offset, end offset
- [ ] Unit tests cover each entity type with positive and negative cases
- [ ] Typecheck passes

### US-005: NLP-based entity detection (compromise.js)
**Description:** As a developer, I need NLP-based detection for person names and organizations so that unstructured PII is caught beyond what regex can find.

**Acceptance Criteria:**
- [ ] compromise.js is integrated and runs on ingested text
- [ ] Detects person names (first, last, full names)
- [ ] Detects organization names
- [ ] Results merged with regex detections, with deduplication for overlapping spans
- [ ] Unit tests cover name and org detection with sample texts
- [ ] Typecheck passes

### US-006: Token masking engine
**Description:** As a developer, I need a masking engine that replaces detected entities with tokens so that sensitive data is redacted consistently.

**Acceptance Criteria:**
- [ ] Each detected entity is replaced with a token in `[[TYPE_N]]` format (e.g., `[[EMAIL_1]]`, `[[PERSON_2]]`)
- [ ] Token counter increments per type within a single file (first email = `[[EMAIL_1]]`, second = `[[EMAIL_2]]`)
- [ ] Same entity appearing multiple times in one file maps to the same token
- [ ] Masking is idempotent: `mask(mask(text)) === mask(text)` (token patterns are not re-detected)
- [ ] The engine returns: masked text and a list of token-to-original mappings
- [ ] Unit tests cover multi-entity, duplicate entity, and idempotency cases
- [ ] Typecheck passes

### US-007: Store ingested files in SQLite
**Description:** As a user, I want my files stored locally so I can access them across app sessions.

**Acceptance Criteria:**
- [ ] On ingestion, the Rust backend stores the original content, masked content, file name, file type, and timestamp in the `items` table
- [ ] All detected entities and their token mappings are stored in the `entities` table, linked to the item by `item_id`
- [ ] Files persist across app restarts
- [ ] Typecheck passes

### US-008: File browser - list view
**Description:** As a user, I want to see all my vault items in a list so I can find and select files to review.

**Acceptance Criteria:**
- [ ] Left sidebar or main panel shows a list of all vault items
- [ ] Each item displays: file name, file type badge, entity count, and creation date
- [ ] List is sorted by most recently added
- [ ] Clicking an item selects it and shows its content in the main view
- [ ] Empty state shown when no files are in the vault
- [ ] Typecheck passes
- [ ] Verify in browser using dev tools

### US-009: File browser - masked/raw toggle view
**Description:** As a user, I want to toggle between masked and raw views of a file so I can verify what was redacted.

**Acceptance Criteria:**
- [ ] Main content area displays the selected file's content
- [ ] A toggle switch or button switches between "Masked" and "Original" views
- [ ] Masked view shows the token-redacted text (e.g., `[[EMAIL_1]]`)
- [ ] Original view shows the raw text with detected entities highlighted (color-coded by type)
- [ ] Default view is Masked
- [ ] Typecheck passes
- [ ] Verify in browser using dev tools

### US-010: Entity highlights and legend
**Description:** As a user, I want detected entities visually highlighted so I can see exactly what was redacted and why.

**Acceptance Criteria:**
- [ ] In the original view, each detected entity is highlighted with a background color by type (e.g., blue for EMAIL, green for PERSON, orange for ORG, red for AMT)
- [ ] A color legend is visible explaining entity type colors
- [ ] Hovering over a highlighted entity shows a tooltip with the token it maps to (e.g., "-> [[EMAIL_1]]")
- [ ] Typecheck passes
- [ ] Verify in browser using dev tools

### US-011: Entity list sidebar
**Description:** As a user, I want to see a summary of all detected entities for the selected file so I can review redactions at a glance.

**Acceptance Criteria:**
- [ ] When a file is selected, a sidebar or panel shows all entities detected in that file
- [ ] Entities are grouped by type (EMAIL, PERSON, ORG, AMT, PHONE, API_KEY)
- [ ] Each entity shows: original value, token, and occurrence count
- [ ] Typecheck passes
- [ ] Verify in browser using dev tools

### US-012: Export - copy masked text to clipboard
**Description:** As a user, I want to copy the masked version of a file to my clipboard so I can paste it into an LLM chat.

**Acceptance Criteria:**
- [ ] A "Copy" button is visible when viewing a file
- [ ] Clicking it copies the full masked text to the system clipboard
- [ ] A brief confirmation toast/indicator appears after copying
- [ ] Typecheck passes
- [ ] Verify in browser using dev tools

### US-013: Export - save masked file to disk
**Description:** As a user, I want to save a masked file to disk so I can use it outside the app.

**Acceptance Criteria:**
- [ ] An "Export" or "Save" button is visible when viewing a file
- [ ] Clicking it opens a native save dialog (via Tauri)
- [ ] File is saved with the same extension as the original (e.g., `.txt`, `.md`, `.csv`, `.json`)
- [ ] File name defaults to `[original_name]_masked.[ext]`
- [ ] Saved file contains the masked content only (no original values)
- [ ] Typecheck passes

### US-014: Export - batch zip archive
**Description:** As a user, I want to export all (or selected) vault items as a zip so I can share a batch of redacted files.

**Acceptance Criteria:**
- [ ] An "Export All" button is available in the file browser
- [ ] Clicking it opens a native save dialog for a `.zip` file
- [ ] The zip contains all vault items as masked files (one file per item)
- [ ] File names in the zip follow `[original_name]_masked.[ext]`
- [ ] The zip does NOT contain original values or vault mappings
- [ ] Typecheck passes

### US-015: Delete vault items
**Description:** As a user, I want to delete files from my vault so I can manage my stored data.

**Acceptance Criteria:**
- [ ] A delete action is available per vault item (button or context menu)
- [ ] Deleting shows a confirmation dialog before proceeding
- [ ] On confirmation, the item and its associated entities are removed from SQLite
- [ ] The file list updates immediately after deletion
- [ ] Typecheck passes
- [ ] Verify in browser using dev tools

## Functional Requirements

- FR-1: The app must create and manage a local SQLite database in the Tauri app data directory
- FR-2: The drop zone must accept `.txt`, `.md`, `.csv`, `.json` files and reject all other types
- FR-3: Text paste input must be available as an alternative ingestion method
- FR-4: Entity detection must run regex detectors for EMAIL, PHONE, AMT, and API_KEY patterns
- FR-5: Entity detection must run compromise.js NLP for PERSON and ORG names
- FR-6: Detection results from regex and NLP must be merged with overlapping span deduplication
- FR-7: The masking engine must replace entities with `[[TYPE_N]]` tokens, incrementing per type per file
- FR-8: Identical entity values within the same file must map to the same token
- FR-9: Original and masked content must be stored in SQLite along with entity metadata
- FR-10: The file browser must list all vault items sorted by creation date (newest first)
- FR-11: Users must be able to toggle between masked and original views for any file
- FR-12: Entity highlights must be color-coded by type in the original view
- FR-13: Clipboard export must copy masked text to the system clipboard
- FR-14: File export must save masked content via native save dialog, preserving the original file extension
- FR-15: Batch export must produce a `.zip` file containing all masked files without any original data
- FR-16: Delete must remove items and their entities from the database with confirmation
- FR-17: For `.csv` and `.json` files, masking must operate on values only, preserving structure (keys, headers, delimiters)

## Non-Goals (Out of Scope)

- **No encryption at rest** — deferred to a later version. Files are stored as plaintext in SQLite for v1.
- **No user authentication or passphrase** — the app opens without login.
- **No PDF support** — deferred to Phase 1b. Only text-based formats.
- **No `@aether-shroud/core` extraction** — detection and masking logic lives in `aether-vault/` for now.
- **No LLM-assisted detection (Ollama)** — regex + compromise.js only.
- **No structure-preserving substitution** — token redaction (`[[TYPE_N]]`) only for v1.
- **No rehydration** — this is a one-way redaction tool for v1. Unmasking happens visually in the browser, not programmatically on export.
- **No cloud sync, no network calls** — fully local, fully offline.
- **No multi-window support** — single window app.

## Design Considerations

- The app has three main regions: **file list** (left sidebar), **content viewer** (center), **entity panel** (right sidebar or collapsible)
- Drop zone should be prominent on empty state, then accessible via a button or drag-anywhere after first file
- Use Svelte 5 runes for reactive state management
- Color palette for entity types should be accessible (sufficient contrast, not relying on color alone)
- Toast notifications for clipboard copy confirmation and error states

## Technical Considerations

- **Frontend:** Svelte 5 with SvelteKit in static SPA mode (required by Tauri)
- **Backend:** Rust with Tauri 2 for filesystem access, SQLite, and IPC
- **Database:** SQLite via `rusqlite`, created in Tauri's app data directory
- **Detection:** compromise.js (~680KB) runs in the webview. Regex detectors also run in the webview. All detection is frontend-side.
- **IPC boundary:** Frontend sends raw text + detected entities to Rust backend for storage. Rust handles file I/O, database, and native dialogs. Frontend handles detection, masking, and rendering.
- **Zip creation:** Use a Rust crate (`zip`) for creating archives on the backend side
- **File reading:** Tauri's filesystem plugin reads dropped files. Content is passed to the frontend as strings.
- **No external network calls** — all processing is local. This is a security invariant.

## Success Metrics

- User can drop a text file and see redacted output in under 2 seconds
- All five entity types (EMAIL, PHONE, AMT, PERSON, ORG) plus API_KEY are detected in test samples
- Masked output contains zero original PII values
- Exported files contain only masked content, no vault data
- App works fully offline with no network access

## Open Questions

- Should the entity sidebar show entities across all files or only the selected file? (PRD assumes per-file for v1)
- Should we support re-running detection on an already-ingested file (e.g., after improving detectors)?
- What happens when a `.csv` or `.json` file has nested structures — how deep do we recurse for masking?
- Should the file list support multi-select for batch operations beyond export?
