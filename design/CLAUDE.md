# CLAUDE.md - design/

Context for working with design assets.

## What's here

- `vault.pen` - UI designs for the Mirage Vault desktop app.
- `inspo/` - Inspiration screenshots for reference.

## Working with .pen files

`.pen` files are encrypted design files. **Never** read them with `Read`, `Grep`, `cat`, or any text tool. Use Pencil MCP tools exclusively:

- `get_editor_state()` - Check what's currently open and selected.
- `open_document(filePath)` - Open a `.pen` file for editing.
- `batch_get(patterns, nodeIds)` - Search and read nodes.
- `batch_design(operations)` - Insert, update, delete, copy, move, replace nodes.
- `get_screenshot(nodeId)` - Visual preview of a specific node.
- `snapshot_layout(parentId)` - Check layout structure and detect issues.
- `get_guidelines(topic)` - Retrieve design rules for a topic (e.g., `"design-system"`, `"web-app"`).
- `get_style_guide_tags()` / `get_style_guide(tags)` - Get visual style inspiration.

## Design context

The Vault app (`mirage-vault/`) is built with Tauri + SvelteKit. Designs in `vault.pen` inform the frontend implementation. Key screens to expect:

- Drop zone / file ingestion view
- Vault file browser (masked vs raw toggle)
- Entity highlights and entity list sidebar
- Export flow

## Inspiration screenshots

The `inspo/` directory contains reference screenshots. Read them with the `Read` tool (they are standard image files, not `.pen`).
