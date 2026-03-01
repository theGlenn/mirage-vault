# PRD: Sessions — Cross-File Redaction Workspace

## Introduction

Today, Mirage Vault treats each file as an isolated unit. Users who redact a document, paste it into an LLM, and receive a response have no structured way to decode that response back to original values — or to link multiple files that belong to the same conversation. This forces a mental model of "one file = one interaction" when real LLM workflows span multiple inputs and outputs.

Sessions introduce a higher-level grouping that ties together **inputs** (files, pasted text) and **outputs** (LLM responses needing decoding) into a single workspace. Within a session, entities share a unified token namespace so that `[[PERSON_1]]` means the same person across every file. This lays the foundation for three future capabilities:

1. **Decoding** — paste an LLM response and decode tokens back to original values using the session's vault
2. **Back-and-forth workflow** — track the masked-input → decoded-output cycle across multiple turns
3. **MCP access scoping** — future remote/local MCP tools can be scoped to a session's entity set

**Tech stack impact:** New SQLite tables + migrations (Rust), new Svelte components (frontend), new Tauri commands (IPC). No new external dependencies.

## Goals

- Let users group related files and LLM responses into persistent, archivable sessions
- Unify the token namespace across all files within a session so cross-file entity references are consistent
- Enable decoding of LLM responses by pasting masked output and replacing tokens with original values from the session vault
- Store decoded outputs as first-class session entries for history and auditability
- Provide a chronological feed UI that shows the input/output flow of a session
- Prepare the data model for future MCP access scoping by linking items to sessions

## User Stories

### US-001: Create sessions table and migrations
**Description:** As a developer, I need a `sessions` table in SQLite so that sessions persist across app restarts.

**Acceptance Criteria:**
- [ ] New `sessions` table with columns: `id` (PK), `name` (TEXT), `status` (TEXT: `active` | `archived`), `created_at` (TEXT), `updated_at` (TEXT)
- [ ] New `session_items` join table with columns: `id` (PK), `session_id` (FK → sessions), `item_id` (FK → items), `added_at` (TEXT), with `UNIQUE(session_id, item_id)`
- [ ] New `session_entries` table with columns: `id` (PK), `session_id` (FK → sessions), `entry_type` (TEXT: `input` | `output`), `source_item_id` (INTEGER, nullable FK → items), `raw_content` (TEXT, encrypted), `decoded_content` (TEXT, nullable, encrypted), `created_at` (TEXT)
- [ ] Add nullable `session_id` column to `items` table (FK → sessions) for future MCP scoping
- [ ] Migrations are idempotent (use `ALTER TABLE ADD COLUMN` with error catch pattern from existing `db.rs`)
- [ ] Foreign keys cascade on delete (deleting a session deletes its entries and join records, but not the items themselves)
- [ ] `cargo check` passes

### US-002: Tauri commands for session CRUD
**Description:** As a developer, I need IPC commands to create, list, update, archive, and delete sessions from the frontend.

**Acceptance Criteria:**
- [ ] `create_session(name: String)` → returns `session_id`
- [ ] `list_sessions()` → returns `Vec<SessionSummary>` with id, name, status, item_count, entry_count, created_at, updated_at; ordered by updated_at DESC
- [ ] `get_session(session_id: i64)` → returns full `SessionDetail` including entries and linked items
- [ ] `update_session(session_id: i64, name: String)` → renames session
- [ ] `archive_session(session_id: i64)` → sets status to `archived`
- [ ] `delete_session(session_id: i64)` → removes session, entries, and join records (items remain in vault)
- [ ] All encrypted fields (raw_content, decoded_content) use existing `crypto.rs` encrypt/decrypt
- [ ] `cargo check` passes

### US-003: Tauri commands for session item management
**Description:** As a developer, I need commands to add and remove files from a session, and to query a session's unified entity set.

**Acceptance Criteria:**
- [ ] `add_item_to_session(session_id: i64, item_id: i64)` → creates join record, updates session `updated_at`
- [ ] `remove_item_from_session(session_id: i64, item_id: i64)` → deletes join record
- [ ] `get_session_entities(session_id: i64)` → returns all entities across all items in the session, deduplicated by `(entity_type, original_value)`, returning one canonical token per unique entity
- [ ] When adding a new item to a session, tokens for entities that already exist in the session's namespace reuse the existing token (shared namespace)
- [ ] `cargo check` passes

### US-004: Tauri commands for session entries (decode flow)
**Description:** As a developer, I need commands to add output entries (pasted LLM responses) to a session and decode them.

**Acceptance Criteria:**
- [ ] `add_session_entry(session_id: i64, entry_type: String, raw_content: String, source_item_id: Option<i64>)` → stores entry with encrypted raw_content, returns `entry_id`
- [ ] `decode_session_entry(session_id: i64, entry_id: i64)` → reads all entities across the session's items, replaces `[[TYPE:HASH]]` and `[[TYPE_N]]` tokens in the entry's raw_content with original values, stores result in `decoded_content`, returns decoded text
- [ ] Decoding handles both hash-style tokens (`[[EMAIL:a3f2c1b9]]`) and counter-style tokens (`[[EMAIL_1]]`) by matching against the session's entity set
- [ ] If a token has no match in the session vault, it is left as-is in the output (no error, partial decode is valid)
- [ ] `cargo check` passes

### US-005: Sessions sidebar navigation
**Description:** As a user, I want a "Sessions" tab in the sidebar so I can switch between the file browser and session views.

**Acceptance Criteria:**
- [ ] Sidebar gains a third navigation item: "SESSIONS" (between BROWSE and SETTINGS, or after BROWSE)
- [ ] Clicking SESSIONS shows the session list view in the main content area
- [ ] Active view state tracks `'browse' | 'sessions' | 'settings'`
- [ ] Existing BROWSE and SETTINGS views continue to work unchanged
- [ ] Pixel icon used for the sessions tab is consistent with existing sidebar icon style
- [ ] `pnpm check` passes
- [ ] Verify in browser using dev tools

### US-006: Session list view
**Description:** As a user, I want to see all my sessions so I can open, archive, or create new ones.

**Acceptance Criteria:**
- [ ] Main content area shows a list of sessions when SESSIONS tab is active
- [ ] Each session card displays: name, status badge (active/archived), item count, entry count, last updated time
- [ ] "New Session" button at the top creates a session with a default name (e.g., "Session — Mar 1, 2026")
- [ ] Sessions are sorted by last updated (newest first)
- [ ] Active sessions appear before archived sessions
- [ ] Archive action available per session (icon button or context menu)
- [ ] Delete action available per session with confirmation dialog (reuse `ConfirmDialog.svelte`)
- [ ] Empty state shown when no sessions exist, with prompt to create one
- [ ] `pnpm check` passes
- [ ] Verify in browser using dev tools

### US-007: Session detail — feed view
**Description:** As a user, I want to see a chronological feed of inputs and outputs within a session so I can track the conversation flow.

**Acceptance Criteria:**
- [ ] Clicking a session from the list opens the session detail view
- [ ] The detail view shows a chronological feed of entries (inputs and outputs), newest at the bottom
- [ ] Input entries show: file name or "Pasted text", entity count, timestamp, a truncated preview of masked content
- [ ] Output entries show: "LLM Response" label, timestamp, a truncated preview of the raw (still-encoded) or decoded content
- [ ] Each entry is clickable — clicking opens a detail popup/panel (see US-009)
- [ ] Visual distinction between inputs (left-aligned or distinct color/icon) and outputs (right-aligned or distinct color/icon)
- [ ] Session name is editable inline at the top of the detail view
- [ ] Back button returns to session list
- [ ] `pnpm check` passes
- [ ] Verify in browser using dev tools

### US-008: Add files to a session
**Description:** As a user, I want to add files to a session by dragging them in or selecting from my vault.

**Acceptance Criteria:**
- [ ] The session detail view has a drop zone area for dragging new files (triggers the existing upload pipeline, then links the resulting item to the session)
- [ ] An "Add from Vault" button opens a picker showing existing vault items not yet in this session
- [ ] Adding a file creates an `input` entry in the session feed with the item linked
- [ ] Users can remove a file from the session (unlinking only — the item stays in the vault)
- [ ] When a new file is added, its entities are reconciled with the session's shared namespace (same original value + type = same token)
- [ ] `pnpm check` passes
- [ ] Verify in browser using dev tools

### US-009: Entry detail popup
**Description:** As a user, I want to click on a feed entry to see its full content in a popup, with masked/original toggle for inputs and raw/decoded toggle for outputs.

**Acceptance Criteria:**
- [ ] Clicking a feed entry opens a popup/overlay panel showing full content
- [ ] For input entries: shows the file content with masked/original toggle (reuse `FileViewer.svelte` patterns)
- [ ] For output entries: shows raw content (with tokens) and decoded content (with original values) via a toggle
- [ ] Output entries that haven't been decoded yet show a "Decode" button that triggers decoding
- [ ] Popup shows the entity list for the current entry (reuse entity panel patterns)
- [ ] Popup is dismissible (click outside, Escape key, or close button)
- [ ] Multiple popups can stack (clicking an entity or cross-reference could open another)
- [ ] `pnpm check` passes
- [ ] Verify in browser using dev tools

### US-010: Paste LLM output into session
**Description:** As a user, I want to paste an LLM's response into the session so I can decode tokens back to original values.

**Acceptance Criteria:**
- [ ] A text input area at the bottom of the session feed view (similar to a chat input)
- [ ] User can paste or type LLM response text containing tokens like `[[EMAIL_1]]` or `[[PERSON:a3f2c1b9]]`
- [ ] Submitting creates an `output` entry in the session
- [ ] After creation, automatic decoding runs: tokens are replaced with original values from the session's entity set
- [ ] The decoded result is stored and displayed in the feed
- [ ] Tokens that don't match any session entity are preserved as-is (the decode is best-effort)
- [ ] The input area supports multi-line text (textarea, not single-line input)
- [ ] `pnpm check` passes
- [ ] Verify in browser using dev tools

### US-011: Drag-and-drop for the session view
**Description:** As a user, I want to drag and drop files anywhere into the session view to add them.

**Acceptance Criteria:**
- [ ] The entire session detail view acts as a drop zone
- [ ] Dragging files over the view shows a visual overlay indicator
- [ ] Dropped files go through the existing upload pipeline and are linked to the current session
- [ ] Supported file types match the existing vault constraints (`.txt`, `.md`, `.csv`, `.json`, `.pdf`)
- [ ] Unsupported file types are rejected with an error message
- [ ] Multiple files can be dropped at once
- [ ] `pnpm check` passes
- [ ] Verify in browser using dev tools

### US-012: Shared token namespace reconciliation
**Description:** As a developer, I need the masking engine to reconcile tokens across files within a session so the same entity always gets the same token.

**Acceptance Criteria:**
- [ ] When a file is added to a session, its entities are compared against all existing entities in the session
- [ ] If an entity with the same `(entity_type, original_value)` pair already exists in the session, the new file's token for that entity is rewritten to match the existing session token
- [ ] The item's `masked_content` and `entities` records are updated to reflect the reconciled tokens
- [ ] New entities (not yet in the session) get fresh tokens that don't conflict with existing session tokens
- [ ] Reconciliation is idempotent — adding the same file twice doesn't duplicate or change tokens
- [ ] Unit tests cover: same entity across two files, novel entity in second file, re-adding same file

## Functional Requirements

- FR-1: The system must store sessions in a `sessions` table with id, name, status (active/archived), created_at, updated_at
- FR-2: The system must link items to sessions via a `session_items` join table (many-to-many)
- FR-3: The system must store session entries (inputs/outputs) in a `session_entries` table with entry_type, raw_content (encrypted), and decoded_content (encrypted, nullable)
- FR-4: The system must add a nullable `session_id` column to the `items` table for future MCP scoping
- FR-5: When a user creates a new session, the system must generate a default name based on the current date
- FR-6: The session list must show active sessions before archived sessions, sorted by updated_at DESC within each group
- FR-7: The session detail view must display a chronological feed of input and output entries
- FR-8: When the user pastes an LLM response into the session, the system must create an output entry and automatically decode all recognized tokens using the session's entity set
- FR-9: Decoding must support both `[[TYPE_N]]` counter-style tokens and `[[TYPE:HASH]]` hash-style tokens
- FR-10: Tokens that don't match any entity in the session must be preserved verbatim in the decoded output
- FR-11: All files within a session must share a unified token namespace — the same `(entity_type, original_value)` pair always maps to the same token
- FR-12: When a file is added to a session, its tokens must be reconciled with the session's existing namespace
- FR-13: The session detail view must support drag-and-drop file ingestion
- FR-14: Users must be able to add existing vault items to a session without re-uploading
- FR-15: Users must be able to remove items from a session without deleting them from the vault
- FR-16: Deleting a session must cascade-delete entries and join records but must NOT delete the vault items themselves
- FR-17: The sidebar must include a SESSIONS navigation item alongside the existing BROWSE and SETTINGS items
- FR-18: All sensitive content in session entries (raw_content, decoded_content) must be encrypted at rest using the existing AES-256-GCM encryption in `crypto.rs`

## Non-Goals (Out of Scope)

- **No MCP server implementation** — this PRD only adds the `session_id` FK to enable future scoping. No MCP tool interface, no remote access.
- **No automatic LLM integration** — users manually paste LLM responses. The app does not send requests to or receive responses from any LLM API as part of the session flow.
- **No real-time collaboration** — sessions are single-user, local-only.
- **No session import/export** — no JSON/ZIP export of sessions. File-level export remains per-item.
- **No session templates or duplication** — each session is created fresh.
- **No image or binary file support in session entries** — text-only for inputs and outputs. Image support is a future enhancement.
- **No undo/redo for token reconciliation** — once tokens are reconciled to the session namespace, there is no rollback. The original per-file tokens are overwritten.
- **No search across sessions** — search remains per-file within the existing file browser. Cross-session search is a future feature.
- **No notification system** — no alerts for incomplete decoding or unmatched tokens beyond inline display.

## Design Considerations

- **Feed layout:** The session detail view uses a vertical feed similar to a chat interface. Inputs appear with a file/document icon and slight left alignment. Outputs appear with a decode/chat icon and slight right alignment. Both use timestamps.
- **Entry popups:** Clicking a feed entry opens a popup panel (similar to `FileViewer.svelte` but in a modal/overlay). Popups can stack for cross-referencing.
- **Text input:** The paste area at the bottom of the session view resembles a chat input — multi-line textarea with a submit button. It is always visible when the session is active.
- **Drop zone:** The entire session detail area responds to drag events. A translucent overlay with an icon and "Drop files to add to session" text appears during drag-over.
- **Session cards:** Follow the existing `FileCard.svelte` visual pattern — dark background, border, rounded corners, status badge, counts.
- **Sidebar icon:** Use a pixel-art icon from the existing Pixelarticons set that suggests grouping/conversation (e.g., `chat`, `folder`, or `layers`).
- **Color coding:** Input entries use the existing accent orange. Output entries use a complementary color (e.g., a muted blue or green) to create visual contrast in the feed.
- **Archived sessions:** Appear dimmed/muted in the session list. The archive action uses a toggle — archived sessions can be reactivated.

## Technical Considerations

- **Database migrations:** Follow the existing idempotent pattern in `db.rs` — use `ALTER TABLE ADD COLUMN` wrapped in error catches. New tables use `CREATE TABLE IF NOT EXISTS`.
- **Encryption:** Session entry content (`raw_content`, `decoded_content`) must pass through `crypto::encrypt` / `crypto::decrypt` just like item content. The encryption key is the same app-wide passphrase.
- **Token reconciliation:** When adding a file to a session, the backend should:
  1. Load all entities across items already in the session
  2. Build a map of `(entity_type, original_value) → session_token`
  3. For each entity in the new file, check if it exists in the map. If yes, rewrite its token. If no, assign a new token that doesn't conflict.
  4. Update the item's `masked_content` and `entities` records in a transaction.
- **Decoding algorithm:** The decode function should:
  1. Load all entities for all items in the session
  2. Build a `token → original_value` map (both `[[TYPE_N]]` and `[[TYPE:HASH]]` formats)
  3. Use regex to find all token patterns in the raw content and replace matches
- **Session scoping for MCP (future):** The `session_id` column on `items` enables a future MCP server to query "give me all entities for session X" without needing the join table. The join table (`session_items`) is the authoritative link — `items.session_id` is a denormalized convenience field for the future.
- **No new npm dependencies required.** All UI components build on existing Svelte 5 patterns. The decode logic is string manipulation using the existing entity data.
- **Performance:** Token reconciliation runs per-file-add, not continuously. For a session with 50 files and 500 entities, the reconciliation map build is O(n) and should complete in under 100ms.

## Success Metrics

- User can create a session, add 3 files, paste an LLM response, and see decoded output — all within a single cohesive flow
- Cross-file entity tokens are consistent: same person name in file A and file B maps to the same `[[PERSON_N]]` token
- Decoding replaces all matching tokens in an LLM response (100% recall for tokens that exist in the session vault)
- Session state persists across app restarts
- Archived sessions are accessible but don't clutter the active session list
- No regression to existing file browser, upload pipeline, or masking functionality

## Open Questions

- Should archived sessions be filterable/hideable in the list, or always shown in a separate section?
- When a file is removed from a session, should the token reconciliation be reversed (revert to per-file tokens), or should the session tokens persist on the item?
- Should there be a limit on the number of active sessions? (Probably not for v1, but worth considering for UX.)
- How should the session handle token format mismatches — e.g., if the user's LLM strips the brackets or modifies the token slightly? Fuzzy matching is complex and may be deferred.
- Should the paste input support rich text (for preserving formatting from LLM UIs), or plain text only?
