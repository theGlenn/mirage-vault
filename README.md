# Mirage Shroud

Privacy layer for LLM interactions. Reversible redaction of sensitive data before it reaches cloud AI providers.

## The problem

Every prompt sent to a cloud LLM is a potential data leak. Users routinely paste names, emails, financial figures, proprietary code, and credentials into ChatGPT, Claude, Mistral, and coding assistants. Mirage Shroud intercepts this data, replaces sensitive entities with tokens or synthetic substitutes, and restores original values in the response - so the LLM never sees real PII.

## How it works

```
User types:    "Email Jane Doe at jane@acme.com about the $50,000 contract"
LLM receives:  "Email [[PERSON_1]] at [[EMAIL_1]] about the [[AMT_1]] contract"
LLM responds:  "Here's a draft to [[PERSON_1]] at [[EMAIL_1]] regarding [[AMT_1]]..."
User sees:     "Here's a draft to Jane Doe at jane@acme.com regarding $50,000..."
```

All detection and mapping happens locally. No data leaves the user's machine unmasked.

## Repository structure

```
mirage-shroud-mvp/
├── extension/       Chrome Extension (MV3, TypeScript)
├── mirage-vault/    Desktop Vault App (Tauri, SvelteKit, Rust)
├── design/          UI designs (.pen files) and inspiration
├── ROADMAP.md       Product plan
├── RESEARCH.md      Technical research notes
└── BRAINSTORM.md    Working brainstorm document
```

### extension/

Manifest V3 Chrome extension that intercepts ChatGPT and Mistral Le Chat interfaces. Performs entity detection using regex and [compromise.js](https://github.com/spencermountain/compromise) NLP. Session-only in-memory vault, no persistence.

**Supported entities**: EMAIL, PHONE, AMT (monetary amounts), ORG, PERSON.

```bash
cd extension
pnpm install
pnpm build          # build to dist/
pnpm dev            # watch mode
pnpm test           # run tests
```

Load the extension from `extension/dist/` via `chrome://extensions` (Developer mode, Load unpacked).

See [extension/README.md](extension/README.md) for detailed usage, demo walkthrough, and debug logging.

### mirage-vault/

Tauri v2 desktop application for file-level redaction. Drop files and text into a persistent encrypted vault, browse masked/unmasked versions, export redacted copies. Uses SvelteKit for the frontend and Rust for filesystem, SQLite, and encryption.

```bash
cd mirage-vault
pnpm install
pnpm tauri dev      # launch dev window
```

Currently in early development. See [ROADMAP.md](ROADMAP.md) Phase 1 for the full plan.

### design/

UI design files for the Vault app. Contains `.pen` files (accessed via Pencil MCP tools) and inspiration screenshots.

## Entity detection

| Type | Detection method | Example |
|------|-----------------|---------|
| EMAIL | Regex | `jane@acme.com` -> `[[EMAIL_1]]` |
| PHONE | Regex | `+1 (415) 555-1212` -> `[[PHONE_1]]` |
| AMT | Regex (supports $, EUR, GBP, shorthand) | `$50,000`, `$5.2M` -> `[[AMT_1]]` |
| ORG | compromise.js NLP + dictionary | `OpenAI` -> `[[ORG_1]]` |
| PERSON | compromise.js NLP (2+ word names) | `Jane Doe` -> `[[PERSON_1]]` |

All detection runs locally. No external APIs.

## Research directions

We're exploring techniques beyond simple pattern matching:

- **Structure-preserving substitution**: Replace entities with type-consistent fakes (`"Jane Doe"` -> `"Maya Chen"`) so LLMs can reason on semantically valid input. See [RESEARCH.md](RESEARCH.md) section 2.
- **LLM-assisted detection**: Use local models (via Ollama) to catch PII that regex and rule-based NLP miss.
- **Tiered redaction policies**: Full redact, generalize, structure-preserve, noise injection - different strategies for different sensitivity levels.
- **MCP server**: Expose the vault to LLM clients (Claude Desktop, Cursor) so they pull pre-masked content directly.

See [RESEARCH.md](RESEARCH.md) for deep-dives and [ROADMAP.md](ROADMAP.md) for the implementation plan.

## Security

- No external API calls for detection.
- Original values exist only in local memory (extension) or encrypted local storage (vault app).
- Vault mappings never leave the user's machine.
- No telemetry, no analytics, no cloud sync.

## License

MIT
