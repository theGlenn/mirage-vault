import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { VaultDB } from "./db.js";
import { registerTools } from "./tools.js";
import { registerResources } from "./resources.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(__dirname, "../../package.json"), "utf-8")
    );
    return pkg.version ?? "0.1.0";
  } catch {
    return "0.1.0";
  }
}

export function createServer(db?: VaultDB): McpServer {
  const server = new McpServer({
    name: "mirage-vault",
    version: getVersion(),
  });

  if (db) {
    registerTools(server, db);
    registerResources(server, db);
  }

  return server;
}
