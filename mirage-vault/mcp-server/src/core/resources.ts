import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { VaultDB } from "./db.js";

const REDACTION_NOTICE =
  "All sensitive data has been replaced with tokens. Tokens like [[EMAIL:abc123]] represent redacted values.";

export function registerResources(server: McpServer, db: VaultDB): void {
  // Resource template: vault://sessions/{session_id}
  // Provides access to individual session content
  server.resource(
    "vault-session",
    new ResourceTemplate("vault://sessions/{session_id}", {
      list: async () => {
        const sessions = db.listSessions(true, false);
        return {
          resources: sessions.map((s) => ({
            uri: `vault://sessions/${s.id}`,
            name: s.name,
            description: `Session "${s.name}" — ${s.item_count} items, ${s.entry_count} entries (${s.status})`,
            mimeType: "text/plain",
          })),
        };
      },
    }),
    { description: "Masked vault session content. All sensitive data is replaced with tokens.", mimeType: "text/plain" },
    async (uri, variables) => {
      const sessionId = Number(variables.session_id);

      if (isNaN(sessionId)) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: "Error: Invalid session ID.",
            },
          ],
        };
      }

      const session = db.getSession(sessionId);

      if (!session) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: `Error: Session ${sessionId} not found.`,
            },
          ],
        };
      }

      if (!session.mcp_shared) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: `Error: Session ${sessionId} is not shared via MCP.`,
            },
          ],
        };
      }

      const text = formatSessionContent(session);

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text,
          },
        ],
      };
    }
  );
}

function formatSessionContent(session: {
  id: number;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
  entries: Array<{ entry_type: string; raw_content: string; created_at: string }>;
  items: Array<{ id: number; name: string; masked_content: string }>;
  entities: Array<{ token: string; entity_type: string }>;
}): string {
  const lines: string[] = [];

  lines.push(`Session: ${session.name}`);
  lines.push(`Status: ${session.status}`);
  lines.push(`Created: ${session.created_at}`);
  lines.push(`Updated: ${session.updated_at}`);
  lines.push("");
  lines.push(REDACTION_NOTICE);
  lines.push("");

  if (session.entries.length > 0) {
    lines.push("--- Entries ---");
    for (const entry of session.entries) {
      lines.push(`[${entry.entry_type}] ${entry.raw_content}`);
    }
    lines.push("");
  }

  if (session.items.length > 0) {
    lines.push("--- Items ---");
    for (const item of session.items) {
      lines.push(`[${item.name}]`);
      lines.push(item.masked_content);
      lines.push("");
    }
  }

  if (session.entities.length > 0) {
    lines.push("--- Entity Legend ---");
    const grouped: Record<string, string[]> = {};
    for (const e of session.entities) {
      if (!grouped[e.entity_type]) grouped[e.entity_type] = [];
      grouped[e.entity_type].push(e.token);
    }
    for (const [type, tokens] of Object.entries(grouped)) {
      lines.push(`${type}: ${tokens.join(", ")}`);
    }
  }

  return lines.join("\n");
}
