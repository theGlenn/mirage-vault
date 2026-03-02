import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { VaultDB } from "./db.js";
import type { SessionEntity } from "./types.js";

const REDACTION_NOTICE =
  "All sensitive data has been replaced with tokens. Tokens like [[EMAIL:abc123]] represent redacted values.";

function buildEntitySummary(entities: SessionEntity[]): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const e of entities) {
    summary[e.entity_type] = (summary[e.entity_type] ?? 0) + 1;
  }
  return summary;
}

export function registerTools(server: McpServer, db: VaultDB): void {
  server.tool(
    "list_sessions",
    "List vault sessions shared via MCP. All content is masked — sensitive data has been replaced with tokens.",
    { include_archived: z.boolean().optional().describe("Include archived sessions (default: false)") },
    async ({ include_archived }) => {
      const sessions = db.listSessions(true, include_archived ?? false);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ sessions, notice: REDACTION_NOTICE }),
          },
        ],
      };
    }
  );

  server.tool(
    "search_sessions",
    "Search MCP-shared vault sessions by name. All content is masked — sensitive data has been replaced with tokens.",
    { query: z.string().describe("Search query to match against session names") },
    async ({ query }) => {
      const sessions = db.searchSessions(query);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ sessions, notice: REDACTION_NOTICE }),
          },
        ],
      };
    }
  );

  server.tool(
    "get_session",
    "Get full details of a vault session including masked entries, items, and entity type summary. All content is masked — sensitive data has been replaced with tokens.",
    { session_id: z.number().describe("The session ID to retrieve") },
    async ({ session_id }) => {
      const session = db.getSession(session_id);

      if (!session) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: `Session ${session_id} not found.` }),
            },
          ],
          isError: true,
        };
      }

      if (!session.mcp_shared) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `Session ${session_id} is not shared via MCP. The session owner must enable MCP sharing first.`,
              }),
            },
          ],
          isError: true,
        };
      }

      const entity_summary = buildEntitySummary(session.entities);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              session: {
                id: session.id,
                name: session.name,
                status: session.status,
                created_at: session.created_at,
                updated_at: session.updated_at,
                entries: session.entries,
                items: session.items,
                entity_summary,
              },
              notice: REDACTION_NOTICE,
            }),
          },
        ],
      };
    }
  );

  server.tool(
    "get_session_item",
    "Get a specific item from a vault session including its masked content and entity list. All content is masked — sensitive data has been replaced with tokens.",
    {
      session_id: z.number().describe("The session ID the item belongs to"),
      item_id: z.number().describe("The item ID to retrieve"),
    },
    async ({ session_id, item_id }) => {
      // Check that the session exists and is MCP-shared
      const session = db.getSessionMcpStatus(session_id);

      if (!session) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: `Session ${session_id} not found.` }),
            },
          ],
          isError: true,
        };
      }

      if (!session.mcp_shared) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `Session ${session_id} is not shared via MCP. The session owner must enable MCP sharing first.`,
              }),
            },
          ],
          isError: true,
        };
      }

      const item = db.getSessionItem(session_id, item_id);

      if (!item) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `Item ${item_id} not found in session ${session_id}.`,
              }),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              item,
              notice: REDACTION_NOTICE,
            }),
          },
        ],
      };
    }
  );

  server.tool(
    "get_entity_legend",
    "Get the token-to-entity-type mapping for a vault session, grouped by entity type. Never includes original values — only shows token placeholders and their types.",
    { session_id: z.number().describe("The session ID to get the entity legend for") },
    async ({ session_id }) => {
      const session = db.getSessionMcpStatus(session_id);

      if (!session) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: `Session ${session_id} not found.` }),
            },
          ],
          isError: true,
        };
      }

      if (!session.mcp_shared) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `Session ${session_id} is not shared via MCP. The session owner must enable MCP sharing first.`,
              }),
            },
          ],
          isError: true,
        };
      }

      const legend = db.getEntityLegend(session_id);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              legend,
              notice: REDACTION_NOTICE,
            }),
          },
        ],
      };
    }
  );

  server.tool(
    "get_masked_item",
    "Get a standalone vault item by ID, including its masked content and entity list. Only serves items that are in MCP-shared sessions or not linked to any session. All content is masked — sensitive data has been replaced with tokens.",
    { item_id: z.number().describe("The item ID to retrieve") },
    async ({ item_id }) => {
      const item = db.getMaskedItem(item_id);

      if (!item) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `Item ${item_id} not found or not accessible via MCP.`,
              }),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              item,
              notice: REDACTION_NOTICE,
            }),
          },
        ],
      };
    }
  );
}
