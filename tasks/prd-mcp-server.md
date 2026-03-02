# PRD: MCP Server for Mirage Vault

## Introduction

Add MCP (Model Context Protocol) support to Mirage Vault so LLM services can fetch already-masked session content directly from the user's vault. Two delivery modes serve different platforms:

1. **Desktop Extension (.mcpb)** — A packaged MCP server that users install in Claude Desktop with a double-click. Runs independently, reads the vault database directly. Best for Claude Desktop users.
2. **Embedded SSE Server** — An HTTP+SSE MCP endpoint running inside the Tauri app. Only works when the app is open. Serves claude.ai, Le Chat (Mistral), and any MCP-compatible web service.

Both modes are **read-only and masked-only**. The LLM only ever sees tokens like `[[EMAIL:a1b2c3]]`, never original values.

## Goals

- Expose masked vault sessions to LLM services via MCP
- Support two transport modes: Desktop Extension (stdio, for Claude Desktop) and embedded SSE (for web services)
- Allow users to download the `.mcpb` extension directly from the vault app
- Ensure no raw PII is ever served through the MCP interface
- Give users explicit control over which sessions are shared via MCP
- Expose entity type metadata (e.g. "this token is an EMAIL") without revealing original values

## User Stories

### US-001: MCP Server Core Package

**Description:** As a developer, I need a shared TypeScript MCP server core that both the Desktop Extension and the embedded SSE server can use.

**Acceptance Criteria:**
- [ ] New directory `mirage-vault/mcp-server/` with its own `package.json`
- [ ] Dependencies: `@modelcontextprotocol/sdk`, `better-sqlite3` (or `sql.js`)
- [ ] `tsconfig.json` configured for Node.js target
- [ ] Core server logic (tools, resources, DB queries) is transport-agnostic
- [ ] Separate entry points for stdio (`index-stdio.ts`) and SSE (`index-sse.ts`)
- [ ] Typecheck passes

### US-002: Vault Database Connection

**Description:** As the MCP server, I need to connect to the Mirage Vault SQLite database and decrypt content so that I can serve masked session data.

**Acceptance Criteria:**
- [ ] Reads vault database path from environment variable `MIRAGE_VAULT_DB_PATH` (defaults to platform-specific Tauri app data directory)
- [ ] For Desktop Extension (stdio mode): accepts vault passphrase via `MIRAGE_VAULT_PASSPHRASE` env var
- [ ] For embedded SSE mode: receives passphrase from the Tauri app process (already unlocked in memory)
- [ ] Implements AES-256-GCM decryption matching the Rust `crypto.rs` implementation (SHA-256 key derivation, 12-byte nonce prefix, base64 encoding)
- [ ] Fails with a clear error if passphrase is missing or incorrect
- [ ] Opens database in read-only mode (`SQLITE_OPEN_READONLY`)
- [ ] Typecheck passes

### US-003: List Sessions Tool

**Description:** As a user chatting with an LLM, I want to ask "what sessions are in my vault?" so the LLM can discover available masked content.

**Acceptance Criteria:**
- [ ] MCP tool `list_sessions` registered with the server
- [ ] Returns: session id, name, status, item count, entry count, created_at, updated_at
- [ ] Only returns sessions where `mcp_shared = true` and status `active` by default
- [ ] Optional `include_archived` parameter to include archived sessions (still must be `mcp_shared = true`)
- [ ] Tool description clearly states that content is masked/redacted
- [ ] Typecheck passes

### US-004: Get Session Tool

**Description:** As a user, I want the LLM to fetch an entire session's masked content so it can analyze multiple related documents at once.

**Acceptance Criteria:**
- [ ] MCP tool `get_session` registered, takes `session_id` (required)
- [ ] Returns session metadata (name, status, dates)
- [ ] Returns all session entries in chronological order, each with:
  - entry_type (`input` or `output`)
  - masked content (decrypted from DB, but still tokenized — contains `[[TYPE:HASH]]` tokens, not original values)
  - source item name (if linked to a vault item)
  - created_at timestamp
- [ ] Returns list of linked vault items (name, file_type, entity_count)
- [ ] Returns entity type summary: count of each entity type (e.g. "3 EMAIL tokens, 2 PERSON tokens") — without original values
- [ ] Rejects requests for sessions where `mcp_shared = false`
- [ ] Returns error if session_id not found
- [ ] Typecheck passes

### US-005: Get Session Item Tool

**Description:** As a user, I want the LLM to fetch a specific masked document from a session for focused analysis.

**Acceptance Criteria:**
- [ ] MCP tool `get_session_item` registered, takes `session_id` and `item_id` (both required)
- [ ] Returns the item's masked_content (this field is stored unencrypted)
- [ ] Returns item metadata: name, file_type, created_at
- [ ] Returns entity list for that item: entity_type and token (not original_value)
- [ ] Validates item belongs to the specified session and session has `mcp_shared = true`
- [ ] Returns error if session or item not found
- [ ] Typecheck passes

### US-006: Search Sessions Tool

**Description:** As a user, I want to ask the LLM to find sessions by name so I don't need to remember IDs.

**Acceptance Criteria:**
- [ ] MCP tool `search_sessions` registered, takes `query` (required)
- [ ] Searches session names using SQL LIKE (`%query%`, case-insensitive)
- [ ] Only returns sessions where `mcp_shared = true`
- [ ] Returns same format as `list_sessions`
- [ ] Returns empty list (not error) for no matches
- [ ] Typecheck passes

### US-007: Session Resources

**Description:** As an LLM, I want to access session content via MCP resource URIs for richer context provision.

**Acceptance Criteria:**
- [ ] Resource template `vault://sessions/{session_id}` registered
- [ ] Returns the full masked session content (same data as `get_session` tool)
- [ ] Resource list (`vault://sessions`) returns all active MCP-shared sessions as resource entries
- [ ] MIME type set to `text/plain` for masked content
- [ ] Typecheck passes

### US-008: Entity Legend Tool

**Description:** As a user, I want the LLM to understand what types of data are redacted so it can reason about the tokens meaningfully.

**Acceptance Criteria:**
- [ ] MCP tool `get_entity_legend` registered, takes `session_id` (required)
- [ ] Returns a mapping of each token to its entity type (e.g. `[[EMAIL:a1b2c3]] → EMAIL`)
- [ ] Never includes original_value — only entity_type and token
- [ ] Grouped by entity_type for readability
- [ ] Rejects requests for sessions where `mcp_shared = false`
- [ ] Typecheck passes

### US-009: Get Masked Item (Standalone)

**Description:** As a user, I want the LLM to access a masked vault item even if it hasn't been added to a session yet.

**Acceptance Criteria:**
- [ ] MCP tool `get_masked_item` registered, takes `item_id` (required)
- [ ] Returns the item's masked_content (stored unencrypted)
- [ ] Returns item metadata: name, file_type, created_at
- [ ] Returns entity list for that item: entity_type and token (not original_value)
- [ ] Only returns items where the parent session (if any) has `mcp_shared = true`, OR items not in any session (standalone vault items)
- [ ] Returns error if item not found
- [ ] Typecheck passes

### US-010: MCP Share Toggle in Vault UI

**Description:** As a user, I want to control which sessions are visible to LLM services via MCP so I can share only what I choose.

**Acceptance Criteria:**
- [ ] New `mcp_shared` boolean column on `sessions` table (default `false`)
- [ ] Toggle switch in the nav bar / session header to enable/disable MCP sharing per session
- [ ] All MCP tools enforce the `mcp_shared` gate
- [ ] Visual indicator on session cards showing MCP sharing status
- [ ] New Tauri command: `toggle_session_mcp_shared(session_id, shared: bool)`
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-011: Desktop Extension Packaging (.mcpb)

**Description:** As a developer, I need to package the MCP server as a Claude Desktop Extension so users can install it with a double-click.

**Acceptance Criteria:**
- [ ] `manifest.json` with extension metadata (name, version, description, icon)
- [ ] Manifest declares user input for vault passphrase (prompted during install)
- [ ] Manifest declares optional user input for custom database path
- [ ] Build script: `npx @anthropic-ai/mcpb pack` produces a `.mcpb` file
- [ ] Extension bundles all dependencies (no external installs needed)
- [ ] User can install by double-clicking the `.mcpb` file in Claude Desktop
- [ ] Extension reads passphrase from its configured user inputs
- [ ] Typecheck passes

### US-012: Download .mcpb from Vault App

**Description:** As a user, I want to download the Claude Desktop Extension directly from my vault app so I don't have to find it elsewhere.

**Acceptance Criteria:**
- [ ] "Connect to Claude" button/section in the vault app settings or nav bar
- [ ] Clicking it saves the `.mcpb` file to the user's Downloads folder (or opens a save dialog)
- [ ] The `.mcpb` file is bundled with the Tauri app as a static asset at build time
- [ ] The download includes a brief instruction tooltip: "Double-click the downloaded file to install in Claude Desktop"
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-013: Embedded SSE Server in Tauri

**Description:** As a user, I want the vault app to run an MCP server while it's open so web-based LLM services (claude.ai, Le Chat) can connect to it.

**Acceptance Criteria:**
- [ ] When the vault app is unlocked, an HTTP+SSE MCP server starts on `http://127.0.0.1:3420/mcp`
- [ ] Server uses the same core MCP logic as the Desktop Extension
- [ ] Server receives the passphrase from the Tauri app's in-memory encryption state (no env var needed)
- [ ] Server binds to loopback only (`127.0.0.1`) — not accessible from the network
- [ ] Server stops when the vault app is closed or locked
- [ ] Status indicator in the vault app UI: "MCP Server: Running on port 3420" / "Stopped"
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-014: Setup Instructions

**Description:** As a user, I want clear instructions for connecting LLM services to my vault.

**Acceptance Criteria:**
- [ ] In-app help section or settings page explaining both connection modes
- [ ] Claude Desktop: "Download the extension below, double-click to install"
- [ ] claude.ai / Le Chat: "Add this URL as an MCP server: `http://127.0.0.1:3420/mcp`"
- [ ] README in `mirage-vault/mcp-server/` with developer setup instructions
- [ ] Documents all available MCP tools and their parameters

## Functional Requirements

- FR-1: The MCP server core must be a TypeScript package using `@modelcontextprotocol/sdk`, with transport-agnostic tool/resource logic
- FR-2: The stdio entry point must communicate via stdin/stdout (for Desktop Extension)
- FR-3: The SSE entry point must serve HTTP+SSE on `127.0.0.1:3420/mcp` (for embedded mode)
- FR-4: Both modes must connect to the Mirage Vault SQLite database in read-only mode
- FR-5: Both modes must implement AES-256-GCM decryption compatible with the Rust `crypto.rs` module
- FR-6: The server must NEVER expose `original_value` from the entities table or decrypted `raw_content` from the items table — only masked/tokenized content
- FR-7: The server must expose six tools: `list_sessions`, `get_session`, `get_session_item`, `search_sessions`, `get_entity_legend`, `get_masked_item`
- FR-8: The server must expose session resources via `vault://sessions/{session_id}` URI template
- FR-9: All tool responses must include a notice that content is redacted (e.g. `"note": "All sensitive data has been replaced with tokens. Tokens like [[EMAIL:abc123]] represent redacted values."`)
- FR-10: The server must handle concurrent reads safely (SQLite WAL mode, read-only connection)
- FR-11: The stdio server must log to stderr (not stdout, which is reserved for MCP protocol)
- FR-12: All session-related tools and resources must enforce the `mcp_shared = true` gate
- FR-13: The `get_masked_item` tool must serve standalone vault items (not in any session) and items belonging to MCP-shared sessions only
- FR-14: The embedded SSE server must bind to loopback only and stop when the app is locked/closed
- FR-15: The `.mcpb` extension must be bundled as a static asset in the Tauri app for in-app download

## Non-Goals

- No write operations — the MCP server cannot create, modify, or delete vault data
- No OAuth implementation in this version (deferred to remote/public access phase)
- No tunnel setup (ngrok, Cloudflare Tunnel) in this version
- No rehydration through MCP — the LLM never receives original values
- No browser extension integration via MCP
- No streaming of large documents — full content returned per request
- No pagination for large sessions

## Technical Considerations

### Dual Transport Architecture

```
mirage-vault/mcp-server/
├── src/
│   ├── core/
│   │   ├── server.ts         # MCP server definition, tool/resource registration
│   │   ├── tools.ts          # Tool implementations (transport-agnostic)
│   │   ├── resources.ts      # Resource implementations
│   │   ├── db.ts             # SQLite connection, query functions
│   │   ├── crypto.ts         # AES-256-GCM decryption (matching Rust impl)
│   │   └── types.ts          # Shared TypeScript types
│   ├── index-stdio.ts        # Entry point for Desktop Extension (stdio)
│   └── index-sse.ts          # Entry point for embedded Tauri mode (HTTP+SSE)
├── manifest.json              # Desktop Extension manifest
├── package.json
├── tsconfig.json
└── README.md
```

The core server logic is shared. Only the transport layer differs:
- `index-stdio.ts`: reads passphrase from env var, connects stdio transport
- `index-sse.ts`: receives passphrase from Tauri IPC, starts HTTP server on port 3420

### Crypto Compatibility

The TypeScript MCP server must replicate the Rust encryption format exactly:
- Key derivation: `SHA-256(passphrase)` → 32-byte key
- Algorithm: AES-256-GCM
- Format: `base64(nonce[12] || ciphertext || tag[16])`
- Node.js `crypto` module supports this natively

### Database Access

- The vault database lives at the Tauri app data directory (platform-dependent)
- macOS: `~/Library/Application Support/com.shroudai.vault/vault.db`
- Linux: `~/.local/share/com.shroudai.vault/vault.db`
- Both modes read the same SQLite file in read-only mode
- SQLite WAL mode allows concurrent readers (Tauri app + MCP server)

### Token Format

Tokens follow the format `[[ENTITY_TYPE:HASH]]` where:
- `ENTITY_TYPE`: one of `EMAIL`, `PHONE`, `AMT`, `ORG`, `PERSON`
- `HASH`: short hex hash of the original value

The MCP server exposes tokens as-is (no normalization). The entity legend maps tokens to their types for LLM context.

### What Gets Decrypted vs. Served

| Table.Column | Encrypted? | MCP serves? | Notes |
|---|---|---|---|
| items.raw_content | Yes | **No** | Original PII content — never exposed |
| items.masked_content | No | **Yes** | Already tokenized, safe to serve |
| entities.original_value | Yes | **No** | Raw PII — never exposed |
| entities.token | No | **Yes** | Token string only |
| entities.entity_type | No | **Yes** | Type metadata only |
| session_entries.raw_content | Yes | **Yes** (decrypted) | Contains tokenized text, not raw PII |
| session_entries.decoded_content | Yes | **No** | Rehydrated PII — never exposed |

### Desktop Extension Passphrase Handling

The `.mcpb` manifest declares a user input for the passphrase. Claude Desktop prompts the user during installation and stores it securely. The extension receives it as an environment variable at launch.

### Embedded SSE Passphrase Handling

The Tauri app spawns the SSE server as a sidecar process (or via Tauri's shell plugin) and passes the passphrase via a secure channel (stdin pipe or temp file with restricted permissions). The user never enters the passphrase twice — the app already has it.

### .mcpb Bundling

The `.mcpb` file is built during `pnpm build` in the mcp-server package. The Tauri build copies the resulting `.mcpb` into the app's static assets. At runtime, the "Connect to Claude" button writes this file to the user's Downloads folder via Tauri's file dialog.

## Success Metrics

- User can install the Desktop Extension by double-clicking a file downloaded from the vault app
- User can connect claude.ai / Le Chat via localhost URL while the vault app is open
- No raw PII appears in any MCP tool response (verify by auditing all code paths)
- MCP server starts in under 2 seconds (both modes)
- Database queries return in under 100ms for typical vault sizes (< 1000 items)

## Resolved Questions

1. **UI toggle for MCP access?** — Yes. "Share via MCP" toggle in the nav bar. Requires `mcp_shared` boolean column on sessions table.
2. **Pagination for large sessions?** — No. Full content returned per request.
3. **Passphrase handling?** — Desktop Extension: entered once during install, stored by Claude Desktop. Embedded SSE: inherited from the running Tauri app. No duplicate passphrase entry.
4. **`get_masked_item` outside sessions?** — Yes. Standalone tool for items not in any session. See US-009.
5. **Token format normalization?** — No. Serve as-is. Sessions use `[[TYPE:HASH]]`, extension uses `[[TYPE_N]]`.
6. **Architecture?** — Both modes. Desktop Extension for Claude Desktop (works without app running). Embedded SSE for web services (requires app running).
7. **Distribution?** — The `.mcpb` file is downloadable directly from the vault app.
