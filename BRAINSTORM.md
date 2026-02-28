# Aether Shroud - Brainstorming Document

> Async working document between contributors.
> Add your thoughts, questions, and counter-proposals inline or at the bottom.

---

## 1. The Problem

We want to benefit from the power of LLMs while protecting sensitive data.

Every interaction with a cloud LLM (ChatGPT, Claude, Mistral, coding assistants, agentic workflows) is a potential data leak. Users routinely paste proprietary code, client names, financial figures, medical details, and credentials into prompts. Even when providers promise not to train on inputs, the data still transits their infrastructure.

The problem has layers:

- **Pattern-level PII** (emails, phones, amounts) is straightforward to detect but only covers the surface.
- **Semantic PII** is harder: `"my neighbor at the blue house on Elm Street"` contains identifying info through *context*, not pattern. So does `"the CEO I met at last Tuesday's board meeting"`.
- **Structural reasoning must survive redaction.** If we destroy the semantic shape of the input, the LLM's output becomes useless. The real challenge is: **redact the identity while preserving the reasoning scaffold.**
- **Agentic workflows amplify the risk.** Multi-step chains pass data between LLM calls, tools, and APIs. Each hop is a leak surface. Redaction must compose across steps without losing coherence.

### Where we are today

The MVP is a Chrome extension (MV3, TypeScript) that does reversible token-based redaction on ChatGPT and Mistral chat UIs. It uses regex for emails/phones/amounts and compromise.js NLP for persons/orgs. Tokens like `[[PERSON_1]]` replace real values, an in-memory vault maps them back, and LLM responses are rehydrated in the DOM. No persistence, no external calls.

It works. But it's shallow: pattern matching catches the obvious stuff and misses everything else, and `[[TOKEN]]` placeholders strip semantic shape from the input.

---

## 2. Potential Solutions and Research Paths

### 2.1 Structure-Preserving Substitution ("Semantic Homomorphism")

This is the most promising direction. The core insight borrowed from homomorphic encryption: **operate on transformed data while preserving algebraic structure.**

True FHE on LLM inference is computationally infeasible today. But we can apply the *principle* at the semantic level:

- Replace `"John Smith"` not with `[[PERSON_1]]` but with `"Marcus Chen"` - a synthetic, structurally equivalent name.
- Replace `jane@acme.com` with `alex@widgets.org` - a fake but valid email.
- Replace `$52,000` with `$41,000` using a stored scaling factor, so arithmetic comparisons still hold.
- Shift dates by a consistent offset so temporal reasoning is preserved.

The key property: `unmask(LLM(mask(x))) ≈ LLM(x)`. The LLM reasons correctly on the masked input, and we reverse the substitution on the output.

**Open questions:**
- How do we generate type-consistent fakes that don't collide with real entities the LLM knows about? (e.g., replacing `"Goldman Sachs"` with `"Meridian Capital"` - is that a real firm?)
- How do we handle relational consistency? If `John` is `CEO` of `Acme`, the fake must preserve that `Marcus` is `CEO` of `Widgets` across the entire conversation.
- Can we define and measure a *semantic fidelity score* - how much does output quality degrade under substitution vs token redaction?

### 2.2 Semantic-Context-Aware Detection

Moving beyond pattern matching to catch PII that lives in context, not tokens:

- **Dependency-graph analysis**: Parse sentence structure. If a noun is governed by a possessive (`"my doctor"`) or relational term (`"colleague"`, `"sister"`), flag the subtree as potentially identifying.
- **Co-reference resolution**: Track that `"he"` in sentence 3 refers to `"Dr. Smith"` in sentence 1. If Dr. Smith is redacted, pronouns that resolve to him must also be handled.
- **Cross-sentence inference blocking**: Even individually safe sentences can be identifying in combination. `"She works in building 4"` + `"She joined in March 2019"` might uniquely identify someone. This is hard but worth exploring.

**Open questions:**
- How much of this can be done with compromise.js or lightweight NLP vs requiring transformer-based models?
- Is there a useful middle ground between "catch everything" (impossible) and "catch patterns" (current)?

### 2.3 Tiered Redaction Policies

Not all data needs the same treatment. A policy engine that supports:

| Tier | Strategy | Example |
|------|----------|---------|
| **Full redact** | `[[TOKEN]]` replacement | Current behavior |
| **Generalize** | Replace with category | `"123 Main St"` -> `"[Address in New York]"` |
| **Structure-preserve** | Fake substitution | `"John Smith"` -> `"Marcus Chen"` |
| **Noise inject** | Calibrated perturbation | `$52,341` -> `$52,341 + epsilon` |
| **Pass-through** | User allows explicitly | Entity marked safe |

Users (or admins in enterprise) define policies per entity type, per sensitivity context.

### 2.4 Differential Privacy for Numeric Data

Instead of redacting numeric values entirely, inject calibrated noise:
- Financial amounts get noise proportional to magnitude.
- The LLM's statistical analysis remains valid; the exact values are hidden.
- The original value is recoverable because we store the noise seed.

This is a well-studied field with formal guarantees. Worth exploring whether the privacy-utility tradeoff is acceptable for typical LLM use cases.

### 2.5 Developer-Focused Entity Types

Low-hanging fruit with high demand:
- **API keys and secrets** (regex patterns for AWS, Stripe, GitHub tokens, etc.)
- **Connection strings** (database URLs, Redis URIs)
- **Internal hostnames and IPs** (RFC 1918 ranges, internal DNS patterns)
- **Code identifiers** (class names, function names from proprietary codebases)

Developers copy-paste code with secrets into LLMs constantly. This is a fast path to real users.

---

## 3. Architecture: Single Core, Multiple Surfaces

The extension is a constrained environment (bundle size, cold starts, no filesystem, no background persistence). A companion app removes these constraints. Both should share a single core.

```
@aether-shroud/core (pure TS, zero platform deps)
├── detectors/        (regex, NLP, semantic - pluggable)
├── strategies/       (token, structure-preserving, generalize, noise)
├── policy/           (rules engine for tiered redaction)
├── vault/            (interface: Map for extension, SQLite for app)
└── codec.ts          (mask / unmask entry points)
    │
    ├── Chrome Extension (thin adapter: DOM interception, message passing)
    └── Companion App (Electron/Tauri: persistent vault, API proxy, file processing)
```

### What the companion app unlocks

- **API proxy mode**: Local proxy at `localhost:PORT` that transparently masks OpenAI/Anthropic/etc. API calls. Works with *any* tool (Cursor, Continue, custom scripts) - not just chat UIs. This is a significant expansion of surface area.
- **Local model inference**: Run small classifier models for better entity detection without sending data anywhere.
- **Persistent encrypted vault**: Survives across sessions, enables audit trails.
- **File/document processing**: Redact PDFs, DOCX, clipboard contents before pasting.
- **Batch operations**: Process document sets for compliance workflows.

### Bundle size concern

compromise.js is ~680KB bundled - painful for a service worker cold start. Options:
- Tree-shake to only the people/org plugins.
- Evaluate `wink-nlp` (~150KB) as a lighter alternative.
- Lazy-load NLP after first user interaction (regex handles immediate needs).

---

## 4. Domain Applications

Where this becomes a product:

- **Legal**: Law firms analyzing contracts with LLMs. Client names, case numbers, financial terms must not leave the firm. Structure-preserving redaction lets the LLM reason about contract clauses while protecting client identity.
- **Healthcare**: HIPAA-compliant LLM usage. Patient names, MRNs, diagnoses redacted. Medical reasoning must be preserved.
- **Financial services**: Analysts querying LLMs about portfolio strategies without leaking client positions or trade data.
- **HR/Recruiting**: Resume screening and job matching without exposing candidate PII to third-party LLMs.
- **Developer tools**: Redacting secrets and proprietary code from coding assistant prompts. Highest immediate demand, fastest path to users.

---

## 5. Next Steps

Concrete actions, no particular order - pick what unblocks the most thinking:

1. **Extract `@aether-shroud/core`** from `src/shared/` into a standalone workspace package with its own test suite. Zero platform dependencies. This unblocks parallel work on extension vs companion app.

2. **Prototype structure-preserving substitution** as a second masking strategy. Start with person names (use a synthetic name generator), validate that ChatGPT responses unmask correctly. Measure output quality vs `[[TOKEN]]` approach.

3. **Add developer entity types** (API keys, connection strings, IPs). Regex-based, low effort, immediate value. Good forcing function for making detectors pluggable.

4. **Prototype the API proxy** as a standalone Node/Bun HTTP server wrapping the OpenAI API. Validates the companion app thesis with minimal UI work. If this works, it proves the core is portable.

5. **Research semantic detection** feasibility. Spike on dependency-graph analysis with compromise.js to see how much contextual PII we can catch with the tools we already have.

6. **Benchmark and document** the privacy-utility tradeoff. Build a small test suite of prompts, measure LLM output quality under different redaction strategies. This becomes the basis for any formal claims.

---

## Open Discussion

> Add thoughts, counter-proposals, and questions below.
