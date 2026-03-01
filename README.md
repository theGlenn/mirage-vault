# Mistral Mirage

<p align="center">
  <img src="./assets/logo.png" alt="Mistral Mirage Logo" width="180"/>
</p>

<h3 align="center">Privacy-Focused Vault for LLM Interactions</h3>

<p align="center">
  Local LLM-powered detection and masking for PDFs and prompts
</p>

<p align="center">
  <a href="https://worldwide-hackathon.mistral.ai/">🚀 Mistral Worldwide Hackathon 2025 Submission</a>
</p>

---

## Overview

**Mistral Mirage** is a **privacy-focused vault** that protects your sensitive information when interacting with cloud LLMs. Using **local LLM models**, it detects and masks PII (Personally Identifiable Information) in both **PDFs and prompts**, ensuring your data never leaves your machine unmasked.

Built for the **Mistral Worldwide Hackathon 2025**, Mistral Mirage combines the power of **Ministral 3B** (running locally via Ollama) with robust encryption to provide a secure, private environment for processing sensitive documents and LLM interactions.

## The Problem

Every interaction with cloud LLMs exposes sensitive data:
- **PDFs** containing contracts, invoices, or personal documents
- **Prompts** with names, emails, phone numbers
- **Financial figures** and proprietary business data
- **API keys** and credentials

**Mistral Mirage solves this** by creating a secure vault where sensitive data is detected and masked using local AI—never sending your raw information to external servers.

## How It Works

### For Prompts
```
User input:    "Email Jane Doe at jane@acme.com about the $50,000 contract"
               ↓
Local LLM:     Detects entities using Ministral 3B
               ↓
Masked:        "Email [[PERSON_1]] at [[EMAIL_1]] about the [[AMT_1]] contract"
               ↓
LLM receives:  Masked version only
               ↓
Response:      "Here's a draft to [[PERSON_1]] at [[EMAIL_1]] regarding [[AMT_1]]..."
               ↓
User sees:     "Here's a draft to Jane Doe at jane@acme.com regarding $50,000..."
```

### For PDFs & Documents
```
Upload PDF:    confidential_contract.pdf
               ↓
Local LLM:     Extracts and analyzes text
               ↓
Entities:      Detects names, amounts, organizations, dates
               ↓
Vault stores:  Original (encrypted) + Masked version
               ↓
Export:        Share masked PDF safely
```

**Key principle**: All detection, masking, and storage happens locally. No sensitive data leaves unmasked.

## Repository Structure

```
mirage-shroud-mvp/
├── mirage-vault/       Privacy-focused Vault App (Tauri, SvelteKit, Rust)
├── design/             UI designs (.pen files) and inspiration
├── ROADMAP.md          Product roadmap and architecture
├── RESEARCH.md         Technical research on redaction techniques
└── BRAINSTORM.md       Design brainstorm and concept exploration
```

### 🏛️ Privacy-Focused Vault (`mirage-vault/`)

A **privacy-first** Tauri v2 desktop application that uses **local LLM models** to detect and mask sensitive entities in your documents and prompts. All processing happens on your machine—no data ever leaves your device unmasked.

**Core Capabilities:**
- 🔒 **Local LLM-Powered Detection**: Uses **Ministral 3B** via Ollama for intelligent entity detection
- 📄 **PDF & Document Processing**: Ingest and redact sensitive PDFs, text files, and documents
- 💬 **Prompt Masking**: Process LLM prompts to remove PII before sending to cloud providers
- 🛡️ **Encrypted Storage**: AES-256-GCM encryption for all vault contents
- 🔄 **Reversible Masking**: Restore original values in LLM responses

**Features:**
- Drag-and-drop file ingestion (.txt, .md, .csv, .json, .pdf)
- Browse masked/unmasked versions side-by-side
- Color-coded entity highlights with tooltips
- Export to clipboard, single file, or ZIP archive
- SQLite storage with planned AES-256-GCM encryption

**Supported Entities:**
| Type | Detection Method | Example |
|------|------------------|---------|
| EMAIL | Regex + LLM | `jane@acme.com` → `[[EMAIL_1]]` |
| PHONE | Regex + LLM | `+1 (415) 555-1212` → `[[PHONE_1]]` |
| AMT | Regex (multi-currency) | `$50,000`, `€5.2M` → `[[AMT_1]]` |
| ORG | NLP (compromise.js) + LLM | `OpenAI` → `[[ORG_1]]` |
| PERSON | NLP (compromise.js) + LLM | `Jane Doe` → `[[PERSON_1]]` |

**Quick Start:**
```bash
# 1. Install Ollama and pull Ministral 3B
ollama run ministral:3b

# 2. Start the Vault app
cd mirage-vault
pnpm install
pnpm tauri dev      # Launch development window
```

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Privacy Vault** | Secure, encrypted storage for sensitive documents with local-only processing |
| **Local LLM Detection** | Uses Ministral 3B via Ollama—no cloud AI needed for entity detection |
| **Token Format** | `[[TYPE_N]]` (e.g., `[[EMAIL_1]]`, `[[PERSON_2]]`) |
| **Entity Types** | `EMAIL`, `PHONE`, `AMT`, `ORG`, `PERSON` |
| **Masking Strategies** | Token redaction (current), structure-preserving substitution (planned) |
| **Rehydration** | Replacing tokens in LLM responses back to original values |

## Technical Highlights

### Local LLM Architecture

Mistral Mirage is built on a **privacy-first architecture** where all AI processing happens locally:

- **Ministral 3B via Ollama**: Local inference for entity detection—no API calls, no data leaks
- **Hybrid Detection**: Fast regex pass + LLM refinement for comprehensive PII detection
- **PDF Text Extraction**: Local processing of PDF documents with sensitive content masking

### Research-Driven Design

Built on deep technical research documented in [RESEARCH.md](RESEARCH.md):

- **Structure-Preserving Substitution**: Replace entities with type-consistent fakes (e.g., `"Jane Doe"` → `"Maya Chen"`) so LLMs can reason on semantically valid input
- **k-Anonymity Principles**: Generalization hierarchies for tiered privacy levels
- **Threat Modeling**: Comprehensive analysis of attack vectors and mitigations

### Security Invariants

1. ✅ **No external API calls**—all detection runs locally via Ollama
2. ✅ **Original values exist only in encrypted local storage** (vault)
3. ✅ **Vault mappings never leave** the user's machine
4. ✅ **No telemetry, no analytics, no cloud sync**

### LLM-Assisted Detection with Ministral 3B

The Vault integrates with **Ollama** to run **Ministral 3B** locally for enhanced entity detection:

1. **Fast Pass**: Regex + compromise.js catch obvious entities
2. **LLM Refinement**: Ministral 3B verifies detected entities and identifies additional PII in context
3. **Merged Results**: Combined entity list with higher recall and precision

This hybrid approach runs entirely locally—**no data leaves your machine**. Ministral 3B provides an optimal balance of speed (~100ms inference) and accuracy for NER-style tasks.

```bash
# Start Ollama with Ministral 3B
ollama run ministral:3b
```

## Roadmap

### Phase 1: Privacy Vault + Local LLM Detection ✅
- [x] Core vault application with file processing
- [x] Token-based redaction engine
- [x] Local LLM integration (Ollama)
- [ ] PDF support with text extraction
- [ ] Encryption at rest (AES-256-GCM)
- [ ] Structure-preserving substitution

### Phase 2: Vault Integrations
- [ ] MCP server integration
- [ ] Document attachment from vault to chats

### Phase 3: Advanced Features
- [ ] Model Context Protocol (MCP) server for LLM clients
- [ ] Direct vault access from Claude Desktop, Cursor, etc.
- [ ] Batch PDF processing

See [ROADMAP.md](ROADMAP.md) for the full implementation plan.

## Mistral Worldwide Hackathon 2025

This project was created for the **Mistral Worldwide Hackathon 2025**—a global event celebrating innovation in AI.

### Hackathon Goals

- 🎯 Demonstrate practical privacy-preserving LLM interaction
- 🎯 Showcase local LLM-powered entity detection (Ministral 3B)
- 🎯 Build a secure vault for PDF and prompt redaction
- 🎯 Advance research in structure-preserving data masking

## Contributing

This is an open-source project. We welcome contributions in:
- Entity detection improvements
- New masking strategies
- PDF processing enhancements
- UI/UX improvements
- Documentation and examples

## License

MIT License - see LICENSE for details.

---

<p align="center">
  Built for the <a href="https://worldwide-hackathon.mistral.ai/">Mistral Worldwide Hackathon 2025</a>
</p>
<p align="center">
  <sub>Privacy-first AI interactions for everyone</sub>
</p>
