# Mirage Vault MCP Server

An [MCP](https://modelcontextprotocol.io) server that exposes your Mirage Vault sessions to LLM services like Claude Desktop, claude.ai, and Le Chat. All content served is **masked** — sensitive data is replaced with tokens like `[[EMAIL:abc123]]` before it ever reaches the LLM.

## Quick Start

```bash
cd mirage-vault/mcp-server
pnpm install
pnpm build
```

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `MIRAGE_VAULT_PASSPHRASE` | Yes | Passphrase used to encrypt your vault |
| `MIRAGE_VAULT_DB_PATH` | No | Path to vault SQLite database. Defaults to platform-appropriate Tauri app data dir |

Default database paths:
- macOS: `~/Library/Application Support/com.shroudai.vault/vault.db`
- Linux: `~/.local/share/com.shroudai.vault/vault.db`

## Transports

### Stdio (Claude Desktop)

```bash
MIRAGE_VAULT_PASSPHRASE=yourpass node dist/index-stdio.js
```

### SSE (Web services)

```bash
MIRAGE_VAULT_PASSPHRASE=yourpass node dist/index-sse.js
```

Starts an HTTP server on `http://127.0.0.1:3420/mcp` (loopback only).

## Connecting to Claude Desktop

### Option A: Desktop Extension (.mcpb)

1. Build the extension: `pnpm run package`
2. Double-click the generated `dist/mirage-vault.mcpb` file
3. Claude Desktop will prompt for your vault passphrase

### Option B: Manual configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mirage-vault": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index-stdio.js"],
      "env": {
        "MIRAGE_VAULT_PASSPHRASE": "your-vault-passphrase"
      }
    }
  }
}
```

## Connecting Web Services (claude.ai, Le Chat)

Start the SSE server (or let the Vault app start it automatically), then add this URL as an MCP server:

```
http://127.0.0.1:3420/mcp
```

## MCP Tools

### `list_sessions`

List all vault sessions shared via MCP.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `include_archived` | boolean | No | Include archived sessions (default: false) |

**Example response:**
```json
{
  "sessions": [
    { "id": 1, "name": "Tax prep chat", "status": "active", "item_count": 3, "entry_count": 12 }
  ],
  "notice": "All sensitive data has been replaced with tokens..."
}
```

### `search_sessions`

Search MCP-shared sessions by name.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | Yes | Search query to match against session names |

### `get_session`

Get full session details including masked entries, items, and entity type summary.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `session_id` | number | Yes | The session ID to retrieve |

**Example response:**
```json
{
  "session": {
    "id": 1,
    "name": "Tax prep chat",
    "status": "active",
    "entries": [
      { "entry_type": "input", "raw_content": "Please review [[PERSON:a1b2]] tax return for [[AMT:c3d4]]", "created_at": "..." }
    ],
    "items": [
      { "id": 5, "name": "w2-form.pdf", "masked_content": "W-2 Wage Statement\nEmployee: [[PERSON:a1b2]]..." }
    ],
    "entity_summary": { "PERSON": 2, "EMAIL": 1, "AMT": 3 }
  },
  "notice": "All sensitive data has been replaced with tokens..."
}
```

### `get_session_item`

Get a specific item from a session with masked content and entity list.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `session_id` | number | Yes | The session ID the item belongs to |
| `item_id` | number | Yes | The item ID to retrieve |

### `get_entity_legend`

Get the token-to-entity-type mapping for a session, grouped by type. Never includes original values.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `session_id` | number | Yes | The session ID to get the legend for |

**Example response:**
```json
{
  "legend": {
    "EMAIL": ["[[EMAIL:a1b2c3]]", "[[EMAIL:d4e5f6]]"],
    "PERSON": ["[[PERSON:g7h8i9]]"]
  },
  "notice": "All sensitive data has been replaced with tokens..."
}
```

### `get_masked_item`

Get a standalone vault item by ID. Only serves items in MCP-shared sessions or items not linked to any session.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `item_id` | number | Yes | The item ID to retrieve |

## MCP Resources

| URI | Description |
|---|---|
| `vault://sessions` | List all active MCP-shared sessions |
| `vault://sessions/{session_id}` | Read full masked content of a session (text/plain) |

## Security

- **Read-only**: The MCP server opens the database in read-only mode. It cannot modify your vault.
- **Masked-only**: Original sensitive values (PII, financial data, secrets) are never exposed. Only entity types and token placeholders are served.
- **MCP-shared gate**: Only sessions explicitly marked as "Share via MCP" by the user are accessible. All other sessions are invisible to the LLM.
- **Loopback binding**: The SSE server binds to `127.0.0.1` only — not accessible from other machines on the network.
- **No original values**: The `original_value` field in the database is encrypted and is never read or transmitted by the MCP server. Only `entity_type` and `token` are served.
