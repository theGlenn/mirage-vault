# Mirage Vault Implementation Plan

> Incremental implementation roadmap for the Mirage Vault desktop application (Tauri + SvelteKit).
> This document tracks progress through small, testable milestones.

## Overview

The Vault app is a local-first, privacy-focused desktop application that:
- Stores sensitive documents encrypted at rest (SQLite + AES-256-GCM)
- Applies reversible masking using `@mirage-shroud/core`
- Provides masked/unmasked views
- Exports redacted content
- Acts as a backend for the browser extension

---

## Milestone 1: Foundation & Database Layer

**Goal**: Functional SQLite database with encryption, accessible from the frontend.

### M1.1: Set up SQLite with Tauri (Rust side)
**Status**: ⬜ Not Started  
**Estimated**: 2-3 hours  
**Testable Output**: Run `cargo test` and see DB connection succeed

**Tasks**:
- [ ] Add `rusqlite` and `tauri-plugin-sql` dependencies to `src-tauri/Cargo.toml`
- [ ] Create `src-tauri/src/db/mod.rs` module
- [ ] Implement `DbConnection` struct with connection pooling
- [ ] Add `init_database()` command that runs on app startup
- [ ] Write test: `test_db_connection()`

**Verification**:
```bash
cd mirage-vault/src-tauri
cargo test db:: --nocapture
# Should see: "Database initialized successfully"
```

---

### M1.2: Implement database schema and migrations
**Status**: ⬜ Not Started  
**Estimated**: 2-3 hours  
**Testable Output**: Run migrations, verify schema exists

**Schema**:
```sql
-- vault_items: Main storage for documents
CREATE TABLE vault_items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    file_type TEXT NOT NULL, -- 'txt', 'pdf', 'md', etc.
    raw_encrypted BLOB NOT NULL, -- Original content (encrypted)
    masked_text TEXT NOT NULL,   -- Masked version (plaintext)
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- vault_entities: Detected entities per item
CREATE TABLE vault_entities (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    entity_type TEXT NOT NULL, -- 'EMAIL', 'PHONE', etc.
    original_encrypted BLOB NOT NULL, -- Original value (encrypted)
    substitution TEXT NOT NULL,       -- Masked replacement
    span_start INTEGER,
    span_end INTEGER,
    FOREIGN KEY (item_id) REFERENCES vault_items(id) ON DELETE CASCADE
);

-- vault_mappings: Token-to-original mappings for structure-preserving
CREATE TABLE vault_mappings (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    fake_value TEXT NOT NULL,
    original_encrypted BLOB NOT NULL
);
```

**Tasks**:
- [ ] Create `migrations/001_initial.sql`
- [ ] Implement migration runner in Rust
- [ ] Create `VaultItem`, `VaultEntity`, `VaultMapping` structs
- [ ] Add `#[tauri::command]` for CRUD operations
- [ ] Write tests for each table operation

**Verification**:
```bash
cargo test schema:: --nocapture
# Should see: "Migrations applied: 1", "Schema verified"
```

---

### M1.3: Create encryption layer for sensitive data
**Status**: ⬜ Not Started  
**Estimated**: 3-4 hours  
**Testable Output**: Encrypt/decrypt roundtrip test passes

**Implementation**:
- Use `ring` crate for AES-256-GCM
- Derive key from user passphrase using PBKDF2
- Store key in OS keychain (tauri-plugin-keychain)

**Tasks**:
- [ ] Add dependencies: `ring`, `pbkdf2`, `sha2`, `tauri-plugin-keychain`
- [ ] Create `src-tauri/src/crypto/mod.rs`
- [ ] Implement `EncryptionService` struct
- [ ] Add methods: `encrypt(plaintext) -> ciphertext`, `decrypt(ciphertext) -> plaintext`
- [ ] Implement key derivation from passphrase
- [ ] Add keychain storage for derived key
- [ ] Write property-based test: `decrypt(encrypt(x)) == x`

**Verification**:
```bash
cargo test crypto:: --nocapture
# Should see: "Encryption roundtrip: OK", "Key derivation: OK"
```

---

### M1.4: Build vault repository pattern (Rust)
**Status**: ⬜ Not Started  
**Estimated**: 4-5 hours  
**Testable Output**: Full CRUD operations on vault items

**Tasks**:
- [ ] Create `src-tauri/src/repository/mod.rs`
- [ ] Implement `VaultRepository` struct with methods:
  - `create_item(name, file_type, raw_content, masked_text) -> VaultItem`
  - `get_item(id) -> Option<VaultItem>`
  - `list_items() -> Vec<VaultItem>`
  - `delete_item(id) -> Result<()>`
  - `search_items(query) -> Vec<VaultItem>`
- [ ] Implement entity storage methods:
  - `store_entities(item_id, entities)`
  - `get_entities_for_item(item_id) -> Vec<VaultEntity>`
- [ ] Integrate encryption: encrypt `raw_content` and `original` fields
- [ ] Write integration tests

**Verification**:
```bash
cargo test repository:: --nocapture
# Should see: "Create item: OK", "Retrieve with decryption: OK", "Search: OK"
```

---

## Milestone 2: File Processing & Masking

**Goal**: Ingest files, detect entities, store masked versions.

### M2.1: Integrate @mirage-shroud/core into vault app
**Status**: ⬜ Not Started  
**Estimated**: 1-2 hours  
**Testable Output**: Can call `SessionCodec` from Svelte

**Tasks**:
- [ ] Add workspace dependency in vault's `package.json`:
  ```json
  "@mirage-shroud/core": "workspace:*"
  ```
- [ ] Run `pnpm install` to link
- [ ] Create test component that masks sample text
- [ ] Verify both TOKEN_REDACT and STRUCTURE_PRESERVING strategies work

**Verification**:
```bash
cd mirage-vault
pnpm dev
# In browser console, should be able to:
# const codec = new SessionCodec({ strategy: 'STRUCTURE_PRESERVING' });
# codec.maskText("Email john@example.com");
// -> { maskedText: "Email user1234@example.test", ... }
```

---

### M2.2: Create text file ingestion command
**Status**: ⬜ Not Started  
**Estimated**: 2-3 hours  
**Testable Output**: Drop a .txt file, see it in vault

**Tasks**:
- [ ] Add Tauri FS API permissions (`readFile`, `writeFile`)
- [ ] Create Rust command: `ingest_text_file(path) -> VaultItem`
- [ ] Read file content
- [ ] Call masking pipeline (JS side via `invoke` or port to Rust later)
- [ ] Store: encrypted original + masked text + entities
- [ ] Return vault item ID

**Verification**:
```bash
# Run app, use test button or CLI:
cargo test ingest:: --nocapture -- --ignored
# Should see: "Ingested: contract.txt (12 entities detected)"
```

---

### M2.3: Implement PDF text extraction
**Status**: ⬜ Not Started  
**Estimated**: 3-4 hours  
**Testable Output**: Extract text from PDF, mask it

**Decision**: Use `pdf-parse` (JS) for v1, migrate to Rust (`lopdf`) if performance issues.

**Tasks**:
- [ ] Add `pdf-parse` dependency to vault's package.json
- [ ] Create `src/lib/pdf-parser.ts`
- [ ] Implement `extractTextFromPdf(fileBuffer) -> string`
- [ ] Create Rust command: `ingest_pdf_file(path) -> VaultItem`
- [ ] Handle: read PDF → extract text → mask → store
- [ ] Add error handling for image-based PDFs (return helpful message)

**Verification**:
```bash
# Test with sample PDF
cargo test pdf:: --nocapture -- --ignored
# Should see: "Extracted 1500 chars from 2 pages, 8 entities detected"
```

---

### M2.4: Build masking pipeline (detect → mask → store)
**Status**: ⬜ Not Started  
**Estimated**: 3-4 hours  
**Testable Output**: End-to-end: file → masked vault entry

**Tasks**:
- [ ] Create `src/lib/masking-pipeline.ts`
- [ ] Implement async function:
  ```typescript
  async function processDocument(
    content: string,
    strategy: MaskingStrategy
  ): Promise<{
    maskedText: string;
    entities: DetectedEntity[];
    mappings: Map<string, string>;
  }>
  ```
- [ ] Wire up to repository layer via Tauri commands
- [ ] Create `ingest_text` and `ingest_file` Tauri commands
- [ ] Add progress callback for large files

**Verification**:
```bash
# End-to-end test
cargo test pipeline:: --nocapture
# Should see: "Pipeline completed: 3 files, 45 entities, 0 errors"
```

---

## Milestone 3: UI Components

**Goal**: Functional UI for file management and viewing.

### M3.1: Create file drop zone component
**Status**: ⬜ Not Started  
**Estimated**: 2-3 hours  
**Testable Output**: Drag files onto UI, they get processed

**Tasks**:
- [ ] Create `src/lib/components/DropZone.svelte`
- [ ] Implement HTML5 drag-and-drop API
- [ ] Show visual feedback on dragover (highlight border)
- [ ] Handle drop event: get file paths (via Tauri API)
- [ ] Show processing indicator
- [ ] Call `ingest_file` command for each dropped file
- [ ] Display success/error toast

**Verification**:
```bash
pnpm dev
# Drag a .txt file onto the drop zone
# Should see: "Processing..." → "Added: filename.txt"
```

---

### M3.2: Build file browser/list view
**Status**: ⬜ Not Started  
**Estimated**: 2-3 hours  
**Testable Output**: List of vault items with metadata

**Tasks**:
- [ ] Create `src/lib/components/FileList.svelte`
- [ ] Fetch items via `list_items()` Tauri command
- [ ] Display: name, type icon, entity count, created date
- [ ] Add sorting (date, name, entity count)
- [ ] Add delete button with confirmation
- [ ] Click to select/open item

**Verification**:
```bash
pnpm dev
# Should see list of ingested files
# Clicking opens detail view
```

---

### M3.3: Implement masked/unmasked toggle view
**Status**: ⬜ Not Started  
**Estimated**: 3-4 hours  
**Testable Output**: Toggle button switches between views

**Tasks**:
- [ ] Create `src/lib/components/DocumentViewer.svelte`
- [ ] Two view modes:
  - **Masked**: Show `masked_text` from database (plaintext, safe to display)
  - **Unmasked**: Decrypt and show original (requires user action)
- [ ] Add prominent toggle switch ( Masked | Original )
- [ ] For original view: decrypt on-demand via Tauri command
- [ ] Add warning banner in original view: "Sensitive content visible"
- [ ] Copy button for each view

**Verification**:
```bash
pnpm dev
# Open a document
# Toggle Masked → Original
# Should see decrypted content with warning banner
```

---

### M3.4: Add entity highlighting in raw view
**Status**: ⬜ Not Started  
**Estimated**: 3-4 hours  
**Testable Output**: Entities highlighted with color-coded badges

**Tasks**:
- [ ] Create `src/lib/components/HighlightedText.svelte`
- [ ] Accept: `text: string`, `entities: VaultEntity[]`
- [ ] Render text with `<span>` overlays for entities
- [ ] Color coding by type:
  - EMAIL: blue
  - PHONE: green
  - PERSON: purple
  - ORG: orange
  - AMT: yellow
- [ ] Show tooltip on hover: type + substitution used
- [ ] Use in DocumentViewer when showing original

**Verification**:
```bash
pnpm dev
# Open document in Original view
# Should see highlighted entities with hover tooltips
```

---

## Milestone 4: Advanced Features

**Goal**: Entity browser, export, search.

### M4.1: Create entity sidebar panel
**Status**: ⬜ Not Started  
**Estimated**: 3-4 hours  
**Testable Output**: Sidebar showing all entities across vault

**Tasks**:
- [ ] Create `src/lib/components/EntityPanel.svelte`
- [ ] Fetch all entities across all items
- [ ] Group by: Type, Item, or Alphabetical
- [ ] Show: count per type, substitutions used
- [ ] Click entity → jump to document + highlight
- [ ] Filter by type (checkboxes)

**Verification**:
```bash
pnpm dev
# Entity sidebar shows:
# - EMAIL (5): user1234@example.test, ...
# - PERSON (3): Alex Chen, ...
```

---

### M4.2: Implement copy to clipboard
**Status**: ⬜ Not Started  
**Estimated**: 1 hour  
**Testable Output**: Copy button works

**Tasks**:
- [ ] Add `copy_to_clipboard(text)` Tauri command
- [ ] Add copy button to DocumentViewer (both views)
- [ ] Show "Copied!" feedback

**Verification**:
```bash
pnpm dev
# Click copy, paste elsewhere → correct content
```

---

### M4.3: Build ZIP export functionality
**Status**: ⬜ Not Started  
**Estimated**: 3-4 hours  
**Testable Output**: Export ZIP with masked files only

**Tasks**:
- [ ] Add `jszip` dependency
- [ ] Create export dialog: select items, choose format
- [ ] Generate ZIP with:
  - Masked text files (original names)
  - `manifest.json` with entity summary
- [ ] Save to user-selected location (Tauri save dialog)
- [ ] No originals, no mappings included (security!)

**Verification**:
```bash
pnpm dev
# Select 3 files, click Export → ZIP
# Unzip: only masked versions, no originals
```

---

### M4.4: Add search and filter
**Status**: ⬜ Not Started  
**Estimated**: 2-3 hours  
**Testable Output**: Search filters file list

**Tasks**:
- [ ] Add search input to FileList
- [ ] Search: item name, masked content
- [ ] Filter by: file type, date range, entity count
- [ ] Debounce search input (300ms)
- [ ] Show "X results" indicator

**Verification**:
```bash
pnpm dev
# Search "contract" → shows matching files
# Filter by type "pdf" → only PDFs
```

---

## Milestone 5: Extension Integration

**Goal**: Vault acts as backend for browser extension.

### M5.1: Create WebSocket server in Rust
**Status**: ⬜ Not Started  
**Estimated**: 4-5 hours  
**Testable Output**: WebSocket server accepts connections

**Tasks**:
- [ ] Add `tokio-tungstenite` or `axum` with WS support
- [ ] Create `src-tauri/src/websocket/mod.rs`
- [ ] Implement `WsServer` that runs on localhost:PORT
- [ ] Configurable port (settings)
- [ ] CORS configuration for extension origin
- [ ] Start/stop server via Tauri commands
- [ ] Add connection logging

**Verification**:
```bash
# Start vault app, check WebSocket server:
websocat ws://localhost:8765
# Should connect successfully
```

---

### M5.2: Implement vault protocol handlers
**Status**: ⬜ Not Started  
**Estimated**: 4-5 hours  
**Testable Output**: Protocol messages work

**Protocol**:
```typescript
// Request
interface VaultRequest {
  id: string;
  method: 'mask' | 'unmask' | 'getStatus' | 'listDocuments';
  params: any;
}

// Response
interface VaultResponse {
  id: string;
  result?: any;
  error?: { code: number; message: string };
}
```

**Tasks**:
- [ ] Define protocol types in Rust
- [ ] Implement handlers:
  - `mask(text, strategy) -> maskedText`
  - `unmask(text) -> unmaskedText`
  - `getStatus() -> { version, enabled }`
  - `listDocuments() -> [{ id, name, entityCount }]`
- [ ] Add request validation
- [ ] Log all requests for audit

**Verification**:
```bash
websocat ws://localhost:8765
{"id":"1","method":"getStatus","params":{}}
# Should receive: {"id":"1","result":{"version":"0.1.0","enabled":true}}
```

---

### M5.3: Connect extension to vault via WebSocket
**Status**: ⬜ Not Started  
**Estimated**: 3-4 hours  
**Testable Output**: Extension uses vault for masking

**Tasks**:
- [ ] Update `extension/src/background/backends/vaultBackend.ts`
- [ ] Implement WebSocket transport
- [ ] Auto-detect vault availability on startup
- [ ] Fall back to LocalBackend if vault unavailable
- [ ] Add reconnection logic with exponential backoff
- [ ] Test with existing extension E2E tests

**Verification**:
```bash
# Start vault app
# Load extension in Chrome
# Extension popup shows: "Connected to Vault"
# Masking uses vault backend
```

---

### M5.4: Test end-to-end extension+vault flow
**Status**: ⬜ Not Started  
**Estimated**: 2-3 hours  
**Testable Output**: Full flow works

**Test Scenario**:
1. Start vault app
2. Load extension
3. Open ChatGPT
4. Type prompt with PII
5. Extension masks via vault
6. Send to LLM
7. Response rehydrated via vault
8. Toggle extension off → no masking

**Verification**:
```bash
# Manual test:
npm run test:e2e -- --grep "vault-integration"
```

---

## Testing Strategy

### Unit Tests (Rust)
```bash
cd src-tauri
cargo test
```

### Unit Tests (TypeScript)
```bash
cd mirage-vault
pnpm test
```

### Integration Tests
```bash
# Start vault in test mode
cargo test --features integration-tests
```

### Manual E2E Checklist
- [ ] Drag 5 files (mix of txt, pdf) into vault
- [ ] Verify all appear in file list
- [ ] Toggle masked/unmasked for each
- [ ] Export ZIP, verify contents
- [ ] Delete item, verify removed
- [ ] Search finds correct items
- [ ] Extension connects and uses vault

---

## Progress Tracker

| Milestone | Task | Status | Started | Completed | Notes |
|-----------|------|--------|---------|-----------|-------|
| M1.1 | SQLite setup | ⬜ | - | - | |
| M1.2 | Schema & migrations | ⬜ | - | - | |
| M1.3 | Encryption layer | ⬜ | - | - | |
| M1.4 | Repository pattern | ⬜ | - | - | |
| M2.1 | Core integration | ⬜ | - | - | |
| M2.2 | Text ingestion | ⬜ | - | - | |
| M2.3 | PDF extraction | ⬜ | - | - | |
| M2.4 | Masking pipeline | ⬜ | - | - | |
| M3.1 | Drop zone | ⬜ | - | - | |
| M3.2 | File browser | ⬜ | - | - | |
| M3.3 | Masked/unmasked toggle | ⬜ | - | - | |
| M3.4 | Entity highlighting | ⬜ | - | - | |
| M4.1 | Entity panel | ⬜ | - | - | |
| M4.2 | Copy to clipboard | ⬜ | - | - | |
| M4.3 | ZIP export | ⬜ | - | - | |
| M4.4 | Search/filter | ⬜ | - | - | |
| M5.1 | WebSocket server | ⬜ | - | - | |
| M5.2 | Protocol handlers | ⬜ | - | - | |
| M5.3 | Extension WS connection | ⬜ | - | - | |
| M5.4 | E2E testing | ⬜ | - | - | |

**Legend**:
- ⬜ Not Started
- 🔄 In Progress
- ✅ Completed
- ⏸️ Blocked

---

## Dependencies to Add

### Rust (Cargo.toml)
```toml
[dependencies]
# Database
rusqlite = { version = "0.32", features = ["bundled", "chrono"] }
tauri-plugin-sql = { version = "2", features = ["sqlite"] }

# Crypto
ring = "0.17"
pbkdf2 = "0.12"
sha2 = "0.10"
tauri-plugin-keychain = "2"

# WebSocket
tokio-tungstenite = "0.24"
tokio = { version = "1", features = ["full"] }
axum = { version = "0.7", features = ["ws"] }

# Utils
uuid = { version = "1", features = ["v4"] }
chrono = { version = "0.4", features = ["serde"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "1"
```

### TypeScript (package.json)
```json
{
  "dependencies": {
    "@mirage-shroud/core": "workspace:*",
    "pdf-parse": "^1.1.1",
    "jszip": "^3.10.1"
  },
  "devDependencies": {
    "@types/pdf-parse": "^1.1.4"
  }
}
```

---

## Notes

### Security Considerations
1. **Never log decrypted content**
2. **Never expose mappings via API**
3. **Clear sensitive data from memory after use**
4. **Use constant-time comparison for keys**
5. **Validate all file paths (prevent path traversal)**

### Performance Targets
- File ingestion: < 1s for files < 1MB
- Masking: < 100ms per 1000 words
- Vault search: < 100ms for 1000 items
- WebSocket latency: < 10ms local

### Future Enhancements (Post-MVP)
- [ ] DOCX support (mammoth)
- [ ] OCR for scanned PDFs (Tesseract)
- [ ] LLM-assisted detection (Ollama)
- [ ] MCP server implementation
- [ ] Native messaging (alternative to WS)
- [ ] Multi-vault support (work/personal)
- [ ] Sync between devices (encrypted)
