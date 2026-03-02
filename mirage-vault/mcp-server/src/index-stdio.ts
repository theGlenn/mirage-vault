import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./core/server.js";
import { VaultDB } from "./core/db.js";
import { deriveKey } from "./core/crypto.js";

try {
  const passphrase = process.env.MIRAGE_VAULT_PASSPHRASE;
  const dbPath = process.env.MIRAGE_VAULT_DB_PATH || undefined;

  let db: VaultDB | undefined;
  if (passphrase) {
    const key = deriveKey(passphrase);
    db = new VaultDB(key, dbPath);
    console.error("Vault database connected");
  } else {
    console.error("Warning: MIRAGE_VAULT_PASSPHRASE not set — tools will not be available");
  }

  const server = createServer(db);
  const transport = new StdioServerTransport();

  await server.connect(transport);
  console.error("Mirage Vault MCP server running on stdio");
} catch (err) {
  console.error("MCP server fatal error:", err instanceof Error ? err.stack : err);
  process.exit(1);
}
