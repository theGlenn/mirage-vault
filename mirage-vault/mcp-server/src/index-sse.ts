import { createServer as createHttpServer } from "node:http";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createServer } from "./core/server.js";
import { VaultDB } from "./core/db.js";
import { deriveKey } from "./core/crypto.js";

const PORT = 3420;
const HOST = "127.0.0.1";

const passphrase = process.env.MIRAGE_VAULT_PASSPHRASE;
const dbPath = process.env.MIRAGE_VAULT_DB_PATH || undefined;

let db: VaultDB | undefined;
if (passphrase) {
  const key = deriveKey(passphrase);
  db = new VaultDB(key, dbPath);
  console.error("Vault database connected");
} else {
  console.error(
    "Warning: MIRAGE_VAULT_PASSPHRASE not set — tools will not be available"
  );
}

const transports: Record<string, SSEServerTransport> = {};

const httpServer = createHttpServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);

  if (url.pathname === "/mcp" && req.method === "GET") {
    // Establish SSE stream — transport tells client to POST to /messages
    const transport = new SSEServerTransport("/messages", res);
    transports[transport.sessionId] = transport;

    res.on("close", () => {
      delete transports[transport.sessionId];
    });

    const server = createServer(db);
    await server.connect(transport);
  } else if (url.pathname === "/messages" && req.method === "POST") {
    const sessionId = url.searchParams.get("sessionId");
    const transport = sessionId ? transports[sessionId] : undefined;

    if (transport) {
      await transport.handlePostMessage(req, res);
    } else {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("No transport found for sessionId");
    }
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
});

httpServer.listen(PORT, HOST, () => {
  console.error(`MCP SSE server listening on http://${HOST}:${PORT}/mcp`);
});

async function shutdown() {
  console.error("Shutting down MCP SSE server...");
  for (const sessionId in transports) {
    try {
      await transports[sessionId].close();
      delete transports[sessionId];
    } catch (error) {
      console.error(
        `Error closing transport for session ${sessionId}:`,
        error
      );
    }
  }
  httpServer.close();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
