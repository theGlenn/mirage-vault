import Database from "better-sqlite3";
import { homedir } from "node:os";
import { join } from "node:path";
import { decryptSafe } from "./crypto.js";
import type {
  SessionSummary,
  SessionEntry,
  SessionItem,
  SessionDetail,
  SessionEntity,
  ItemDetail,
  EntityLegend,
} from "./types.js";

function defaultDbPath(): string {
  const home = homedir();
  switch (process.platform) {
    case "darwin":
      return join(home, "Library/Application Support/com.shroudai.vault/vault.db");
    case "linux":
      return join(home, ".local/share/com.shroudai.vault/vault.db");
    case "win32":
      return join(home, "AppData/Roaming/com.shroudai.vault/vault.db");
    default:
      return join(home, ".mirage-vault/vault.db");
  }
}

export class VaultDB {
  private db: Database.Database;
  private key: Buffer;

  constructor(key: Buffer, dbPath?: string) {
    const resolvedPath = dbPath || defaultDbPath();
    this.db = new Database(resolvedPath, { readonly: true });
    this.db.pragma("foreign_keys = ON");
    this.key = key;
  }

  close(): void {
    this.db.close();
  }

  listSessions(mcpSharedOnly: boolean, includeArchived: boolean): SessionSummary[] {
    const conditions: string[] = [];
    if (mcpSharedOnly) conditions.push("s.mcp_shared = 1");
    if (!includeArchived) conditions.push("s.status != 'archived'");

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const stmt = this.db.prepare(`
      SELECT s.id, s.name, s.status,
             (SELECT COUNT(*) FROM session_items si WHERE si.session_id = s.id) AS item_count,
             (SELECT COUNT(*) FROM session_entries se WHERE se.session_id = s.id) AS entry_count,
             s.created_at, s.updated_at, s.mcp_shared
      FROM sessions s
      ${where}
      ORDER BY s.updated_at DESC
    `);

    const rows = stmt.all() as Array<{
      id: number;
      name: string;
      status: string;
      item_count: number;
      entry_count: number;
      created_at: string;
      updated_at: string;
      mcp_shared: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      item_count: row.item_count,
      entry_count: row.entry_count,
      mcp_shared: row.mcp_shared !== 0,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  searchSessions(query: string): SessionSummary[] {
    const stmt = this.db.prepare(`
      SELECT s.id, s.name, s.status,
             (SELECT COUNT(*) FROM session_items si WHERE si.session_id = s.id) AS item_count,
             (SELECT COUNT(*) FROM session_entries se WHERE se.session_id = s.id) AS entry_count,
             s.created_at, s.updated_at, s.mcp_shared
      FROM sessions s
      WHERE s.mcp_shared = 1 AND s.name LIKE ?
      ORDER BY s.updated_at DESC
    `);

    const rows = stmt.all(`%${query}%`) as Array<{
      id: number;
      name: string;
      status: string;
      item_count: number;
      entry_count: number;
      created_at: string;
      updated_at: string;
      mcp_shared: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      item_count: row.item_count,
      entry_count: row.entry_count,
      mcp_shared: row.mcp_shared !== 0,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  getSessionMcpStatus(sessionId: number): { id: number; mcp_shared: boolean } | null {
    const stmt = this.db.prepare("SELECT id, mcp_shared FROM sessions WHERE id = ?");
    const row = stmt.get(sessionId) as { id: number; mcp_shared: number } | undefined;
    if (!row) return null;
    return { id: row.id, mcp_shared: row.mcp_shared !== 0 };
  }

  getSession(sessionId: number): SessionDetail | null {
    const sessionStmt = this.db.prepare(
      "SELECT id, name, status, created_at, updated_at, mcp_shared FROM sessions WHERE id = ?"
    );
    const session = sessionStmt.get(sessionId) as {
      id: number;
      name: string;
      status: string;
      created_at: string;
      updated_at: string;
      mcp_shared: number;
    } | undefined;

    if (!session) return null;

    // Load entries — raw_content is encrypted, decrypt with fallback
    const entryStmt = this.db.prepare(`
      SELECT id, session_id, source_item_id, entry_type, raw_content, created_at
      FROM session_entries
      WHERE session_id = ?
      ORDER BY created_at ASC
    `);
    const entryRows = entryStmt.all(sessionId) as Array<{
      id: number;
      session_id: number;
      source_item_id: number | null;
      entry_type: string;
      raw_content: string;
      created_at: string;
    }>;

    const entries: SessionEntry[] = entryRows.map((row) => ({
      id: row.id,
      session_id: row.session_id,
      item_id: row.source_item_id,
      entry_type: row.entry_type,
      raw_content: decryptSafe(this.key, row.raw_content),
      created_at: row.created_at,
    }));

    // Load items linked to session
    const itemStmt = this.db.prepare(`
      SELECT i.id, i.name, i.masked_content, i.file_type
      FROM session_items si
      JOIN items i ON i.id = si.item_id
      WHERE si.session_id = ?
      ORDER BY si.added_at ASC
    `);
    const itemRows = itemStmt.all(sessionId) as Array<{
      id: number;
      name: string;
      masked_content: string;
      file_type: string;
    }>;

    const items: SessionItem[] = itemRows.map((row) => ({
      id: row.id,
      name: row.name,
      masked_content: row.masked_content,
      source_type: row.file_type,
    }));

    // Load entities (token + entity_type only, no original_value)
    const entityStmt = this.db.prepare(`
      SELECT DISTINCT e.entity_type, e.token
      FROM entities e
      JOIN session_items si ON si.item_id = e.item_id
      WHERE si.session_id = ?
      ORDER BY e.id ASC
    `);
    const entityRows = entityStmt.all(sessionId) as Array<{
      entity_type: string;
      token: string;
    }>;

    const entities: SessionEntity[] = entityRows.map((row) => ({
      token: row.token,
      entity_type: row.entity_type,
    }));

    return {
      id: session.id,
      name: session.name,
      status: session.status,
      mcp_shared: session.mcp_shared !== 0,
      created_at: session.created_at,
      updated_at: session.updated_at,
      entries,
      items,
      entities,
    };
  }

  getSessionItem(sessionId: number, itemId: number): ItemDetail | null {
    // Verify item belongs to this session
    const linkStmt = this.db.prepare(
      "SELECT 1 FROM session_items WHERE session_id = ? AND item_id = ?"
    );
    const linked = linkStmt.get(sessionId, itemId);
    if (!linked) return null;

    const itemStmt = this.db.prepare(
      "SELECT id, name, masked_content, file_type FROM items WHERE id = ?"
    );
    const item = itemStmt.get(itemId) as {
      id: number;
      name: string;
      masked_content: string;
      file_type: string;
    } | undefined;

    if (!item) return null;

    const entityStmt = this.db.prepare(
      "SELECT entity_type, token FROM entities WHERE item_id = ? ORDER BY id ASC"
    );
    const entityRows = entityStmt.all(itemId) as Array<{
      entity_type: string;
      token: string;
    }>;

    return {
      id: item.id,
      name: item.name,
      masked_content: item.masked_content,
      source_type: item.file_type,
      entities: entityRows.map((row) => ({
        token: row.token,
        entity_type: row.entity_type,
      })),
    };
  }

  getEntityLegend(sessionId: number): EntityLegend {
    const stmt = this.db.prepare(`
      SELECT DISTINCT e.entity_type, e.token
      FROM entities e
      JOIN session_items si ON si.item_id = e.item_id
      WHERE si.session_id = ?
      ORDER BY e.entity_type ASC, e.id ASC
    `);
    const rows = stmt.all(sessionId) as Array<{
      entity_type: string;
      token: string;
    }>;

    const legend: EntityLegend = {};
    for (const row of rows) {
      if (!legend[row.entity_type]) {
        legend[row.entity_type] = [];
      }
      legend[row.entity_type].push(row.token);
    }
    return legend;
  }

  getMaskedItem(itemId: number): ItemDetail | null {
    // Check that item is either in an MCP-shared session or not in any session
    const accessStmt = this.db.prepare(`
      SELECT i.id, i.name, i.masked_content, i.file_type
      FROM items i
      WHERE i.id = ?
        AND (
          EXISTS (
            SELECT 1 FROM session_items si
            JOIN sessions s ON s.id = si.session_id
            WHERE si.item_id = i.id AND s.mcp_shared = 1
          )
          OR NOT EXISTS (
            SELECT 1 FROM session_items si WHERE si.item_id = i.id
          )
        )
    `);
    const item = accessStmt.get(itemId) as {
      id: number;
      name: string;
      masked_content: string;
      file_type: string;
    } | undefined;

    if (!item) return null;

    const entityStmt = this.db.prepare(
      "SELECT entity_type, token FROM entities WHERE item_id = ? ORDER BY id ASC"
    );
    const entityRows = entityStmt.all(itemId) as Array<{
      entity_type: string;
      token: string;
    }>;

    return {
      id: item.id,
      name: item.name,
      masked_content: item.masked_content,
      source_type: item.file_type,
      entities: entityRows.map((row) => ({
        token: row.token,
        entity_type: row.entity_type,
      })),
    };
  }
}
