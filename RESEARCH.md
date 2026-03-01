# Mirage Shroud - Research Notes

Technical deep-dives on concepts and techniques relevant to privacy-preserving LLM interactions. This is a reference document, not a roadmap. Each section is self-contained.

---

## Table of Contents

1. [Homomorphic Encryption and Why It Doesn't Directly Apply](#1-homomorphic-encryption-and-why-it-doesnt-directly-apply)
2. [Structure-Preserving Substitution (Our Adaptation)](#2-structure-preserving-substitution-our-adaptation)
3. [Differential Privacy for LLM Inputs](#3-differential-privacy-for-llm-inputs)
4. [NLP-Based Entity Detection: Depth and Limits](#4-nlp-based-entity-detection-depth-and-limits)
5. [Co-Reference Resolution and Pronoun Tracking](#5-co-reference-resolution-and-pronoun-tracking)
6. [Contextual / Inference-Based PII](#6-contextual--inference-based-pii)
7. [k-Anonymity and Generalization Hierarchies](#7-k-anonymity-and-generalization-hierarchies)
8. [Threat Modeling for LLM Data Flows](#8-threat-modeling-for-llm-data-flows)
9. [Token Algebra and Composability Across Agentic Steps](#9-token-algebra-and-composability-across-agentic-steps)
10. [Lightweight NLP in Constrained Environments](#10-lightweight-nlp-in-constrained-environments)

---

## 1. Homomorphic Encryption and Why It Doesn't Directly Apply

### What it is

Homomorphic Encryption (HE) allows computation on ciphertext such that the result, when decrypted, matches the result of the same computation on plaintext.

Formally: for an encryption function `E` and operation `f`,
```
D(f(E(x))) = f(x)
```

**Fully Homomorphic Encryption (FHE)** supports arbitrary computations (addition and multiplication, which are Turing-complete). Partially Homomorphic schemes support only one operation type (e.g., Paillier supports addition, RSA supports multiplication).

### Key schemes

| Scheme | Year | Type | Operations |
|--------|------|------|------------|
| RSA | 1977 | Partial | Multiplication |
| Paillier | 1999 | Partial | Addition |
| Gentry | 2009 | Fully | Arbitrary (theoretical breakthrough) |
| BGV | 2012 | Leveled FHE | Bounded-depth circuits |
| CKKS | 2017 | Approximate FHE | Floating-point arithmetic |
| TFHE | 2016 | Fully | Boolean circuits, fast bootstrapping |

### Why it doesn't work for LLM inference

An LLM forward pass involves billions of floating-point multiplications, softmax operations (which require exponentiation and division), non-linear activations, and attention mechanisms with dynamic data-dependent indexing. The computational overhead of FHE on these operations is estimated at **10^6 to 10^9x** slowdown. A 1-second inference would take days to years.

Specific blockers:
- **Non-polynomial activations**: GELU, SiLU, and softmax are not natively expressible in HE circuits. They require polynomial approximation, which introduces error that compounds across layers.
- **Bootstrapping cost**: FHE schemes accumulate noise with each operation. Bootstrapping (noise reduction) is the most expensive operation - and a 7B parameter model requires it millions of times.
- **Memory**: Ciphertexts are orders of magnitude larger than plaintexts. A model's KV cache alone would require terabytes of encrypted storage.

### What IS relevant from HE

The *principle* - not the mechanism. The property we want:

```
unmask(LLM(mask(x))) ≈ LLM(x)
```

We don't need cryptographic security against ciphertext analysis. Our attacker model is simpler: an honest-but-curious LLM provider who sees the masked input. We need the LLM to produce *useful* outputs on masked inputs, and those outputs to be reversible. This is a **semantic** homomorphism, not a cryptographic one.

---

## 2. Structure-Preserving Substitution (Our Adaptation)

### Core idea

Replace sensitive entities with *fake but type-consistent* alternatives that preserve the semantic structure the LLM needs for reasoning.

### Formal properties we want

Define:
- `M(x)`: masking function that transforms input `x`
- `U(y)`: unmasking function that reverses substitutions in output `y`
- `L(x)`: LLM inference on input `x`

**Semantic fidelity**: `U(L(M(x)))` should be semantically equivalent to `L(x)` for the user's intent.

**Reversibility**: `U(M(x)) = x` (the masking is perfectly invertible at the token level).

**Opacity**: `M(x)` should not allow the LLM provider to recover `x` or any sensitive component of `x` without the vault.

### Type-specific substitution strategies

#### Persons
- Source: curated list of diverse synthetic names, generated to avoid collision with public figures.
- Preserve: name length (first-only vs first+last vs first+middle+last), cultural markers if relevant to the prompt's context, gender if inferable and relevant.
- Vault: bidirectional map `{real_name <-> fake_name}`.
- Risk: the LLM might have training data about the fake name if it corresponds to a real person. Mitigation: use procedurally generated names from uncommon combinations.

#### Organizations
- Source: synthetic company names from a generator (industry + suffix: "Meridian Dynamics", "Crestline Analytics").
- Preserve: type indicator (bank, tech company, law firm) via suffix convention.
- Risk: higher than persons because orgs have public financial data, regulatory filings, etc. A fake org name might map to a real one.

#### Emails
- Transform: `user@domain.tld` -> `synth_user@synth_domain.tld`. Preserve structural validity.
- Preserve: same-domain grouping (two emails at `@acme.com` should both map to `@widgets.org`).

#### Financial amounts
- Transform: multiply by a random factor `k` where `0.7 < k < 1.3`, stored in vault.
- Preserve: order of magnitude, relative comparisons between amounts in the same prompt, currency symbol.
- Risk: if the user asks "is $52,000 a reasonable salary for X?", the scaled value changes the semantics. May need context-aware scaling.

#### Dates
- Transform: shift by a consistent offset `d` (e.g., +47 days) across all dates in a session.
- Preserve: day-of-week relationships, relative ordering, duration calculations.
- Risk: shifted dates might land on known events ("what happened on [shifted date]?").

#### Addresses
- Transform: replace with synthetic address in the same metro area or generic region.
- Preserve: geographic granularity (city-level if relevant to the prompt).

### Open research questions

1. **Collision detection**: How do we verify a fake entity doesn't correspond to something real in the LLM's training data? We can't query the LLM to check (that leaks information). Possible approach: maintain a blocklist of high-profile real entities per type.

2. **Relational consistency**: If prompt says "John Smith is CEO of Acme Corp", and we substitute to "Marcus Chen is CEO of Widgets Inc", the LLM must never see a crossed mapping ("Marcus Chen, CEO of Acme Corp"). This requires the vault to track entity *relationships*, not just individual mappings.

3. **Quantifying semantic fidelity**: We need a benchmark. Proposal:
   - Curate a test set of 100+ prompts spanning different tasks (summarization, analysis, code review, advice).
   - Run each prompt through the LLM: (a) raw, (b) token-redacted, (c) structure-preserving substituted.
   - Compare outputs using automated metrics (BLEU/ROUGE after unmasking) and human evaluation.
   - This gives us a publishable result.

---

## 3. Differential Privacy for LLM Inputs

### Background

Differential privacy (DP) provides a mathematical guarantee: the output of a computation does not significantly depend on any single individual's data.

Formally, a mechanism `M` satisfies `(ε, δ)`-differential privacy if for all datasets `D1`, `D2` differing in one record, and all outputs `S`:

```
P[M(D1) ∈ S] ≤ e^ε · P[M(D2) ∈ S] + δ
```

`ε` (epsilon) controls the privacy-utility tradeoff. Smaller `ε` = stronger privacy, more noise.

### Application to LLM inputs

Standard DP assumes a *dataset* of multiple records. Our setting is different: a single user's prompt. We're not protecting against statistical inference over a population - we're protecting specific values from being seen by the provider.

The useful adaptation: **local differential privacy (LDP)** applied at the entity level.

#### Numeric values
- Add noise from a Laplace distribution: `x' = x + Lap(Δf/ε)` where `Δf` is the sensitivity (max change from one input).
- For financial amounts, sensitivity = the amount itself. At `ε = 1`, noise std dev equals the value. This destroys utility.
- More practical: use a weaker guarantee. Multiply by a uniform random factor in `[0.8, 1.2]`. Not formally DP, but provides practical obscuration while preserving order-of-magnitude reasoning.

#### Categorical values (names, orgs)
- Randomized response: with probability `p`, report the true value; with probability `1-p`, report a random value from the same category.
- In our context: this is essentially structure-preserving substitution with a probabilistic twist. Not obviously useful over deterministic substitution.

### Verdict

Formal DP is hard to apply meaningfully to single-prompt LLM interactions. The noise required for strong guarantees destroys the utility. However, the *intuition* of calibrated perturbation is useful for numeric data, and DP's formal framework could help us make provable claims about our lighter-weight schemes.

---

## 4. NLP-Based Entity Detection: Depth and Limits

### Current stack: compromise.js

compromise.js is a rule-based NLP library (~680KB bundled). It uses lexicon lookups, suffix rules, and hand-written grammars. No neural models.

**Strengths**: fast, deterministic, zero network calls, small enough for a browser extension.

**Weaknesses**: low recall on unfamiliar names, no contextual understanding. `"Jordan"` is classified based on lexicon, not context. `"Apple"` is not disambiguated between company and fruit.

### What compromise.js gives us that we may not be fully using

- **Part-of-speech tagging**: `.tag()` returns POS tags. We could use these to identify noun phrases in possessive constructions (`"my doctor"`, `"our client"`).
- **Sentence parsing**: `.sentences()` with clause extraction. Useful for co-reference scope.
- **Named entity normalization**: `.normalize()` can map variations (`"Dr. John Smith"`, `"J. Smith"`, `"John"`) to a canonical form. We're not doing this - means we might create separate tokens for the same person.

### Beyond pattern matching: what we'd need for deeper detection

| Capability | What it catches | Minimum technology |
|------------|----------------|-------------------|
| Regex + dictionary | Emails, phones, amounts, known orgs | Current implementation |
| Rule-based NLP | Person names, org names (common patterns) | compromise.js (current) |
| POS-based contextual | Possessive PII ("my address", "our revenue") | compromise.js POS tagger (available, unused) |
| Named Entity Recognition (NER) | Entities in novel contexts | Transformer model (e.g., spaCy with `en_core_web_trf`, ~400MB) |
| Co-reference resolution | Pronoun-to-entity linking | Neural coref model (e.g., AllenNLP, ~1GB) |
| Semantic role labeling | Who did what to whom | Neural SRL model |
| Cross-sentence inference | Quasi-identifiers in combination | Research-grade, no off-the-shelf solution |

The gap between rule-based and neural is large. A companion app could run small models; the extension cannot. This is a key motivator for the two-surface architecture.

---

## 5. Co-Reference Resolution and Pronoun Tracking

### The problem

```
"Dr. Sarah Chen diagnosed the patient with Type 2 diabetes.
She recommended metformin and scheduled a follow-up for March 15."
```

If we redact `"Dr. Sarah Chen"` to `"Dr. Maya Patel"`, we must also handle `"She"` in sentence 2. But `"She"` isn't an entity - it's a pronoun resolved by co-reference.

### Approaches

**Rule-based (feasible in extension)**:
- Track the most recent named entity of each gender.
- Resolve `he/she/they` to the nearest antecedent.
- Limitations: fails on ambiguous cases (`"Alice told Bob that she..."` - who is "she"?).

**Neural (requires companion app)**:
- Models like `neuralcoref` (spaCy plugin), AllenNLP coreference, or Stanford CoreNLP.
- Accuracy: ~75-85% F1 on OntoNotes benchmark.
- Size: 200MB-1GB depending on model.

**Hybrid for our use case**:
- In the extension: simple heuristic (track last-mentioned entity per gender).
- In the companion app: run a proper coref model.
- The core `mask()` interface stays the same. The detector is pluggable.

### What we actually need to do with resolved pronouns

We don't need to *redact* pronouns. We need to ensure that if the LLM's response says `"She should increase the dosage"`, and `"She"` refers to the redacted patient, the rehydration step correctly handles it.

Under structure-preserving substitution, this is a non-issue: `"She"` still refers to `"Maya Patel"` (the fake), and the output makes sense after unmasking. Under token redaction, `"She"` is ambiguous - does it refer to `[[PERSON_1]]` or `[[PERSON_2]]`? This is another argument for structure-preserving substitution over token redaction.

---

## 6. Contextual / Inference-Based PII

### Quasi-identifiers

A quasi-identifier is a piece of data that isn't PII on its own but becomes identifying in combination. Classic example from Sweeney (2000): 87% of the US population can be uniquely identified by {ZIP code, date of birth, gender}.

In LLM prompts, quasi-identifiers appear as:
- `"She's a 34-year-old cardiologist in Portland"` (age + specialty + city)
- `"The VP of Engineering who joined from Google last March"` (role + previous employer + date)
- `"Building 4, 3rd floor, desk by the window"` (physical location details)

### Detection difficulty

No pattern or NER model catches these. They require:
1. Understanding that the combination of attributes is identifying.
2. Knowledge of the population base rate (how many 34-year-old cardiologists are in Portland?).

This is fundamentally different from entity detection. It's closer to **privacy risk scoring** than redaction.

### Possible approaches

**Attribute counting heuristic**: If a sentence contains 3+ personally-descriptive attributes (age, profession, location, date, physical description), flag it for user review. Not automatic redaction - just a warning.

**Embedding-based anomaly detection**: Embed the sentence, compare to a corpus of "safe" sentences. Outliers (sentences with unusual specificity) get flagged. Requires a local embedding model.

**User-defined sensitivity rules**: Let users define custom rules: "anything mentioning building numbers, floor numbers, or desk locations is sensitive." More practical than trying to solve the general problem.

### Honest assessment

Full contextual PII detection is an open research problem. We should not overcommit here. The pragmatic path: provide hooks for custom rules and good defaults for the most common quasi-identifier patterns (age + location, role + employer, etc.).

---

## 7. k-Anonymity and Generalization Hierarchies

### Background

k-Anonymity (Sweeney, 2002): A dataset satisfies k-anonymity if every record is indistinguishable from at least `k-1` other records on quasi-identifier attributes.

Achieved through **generalization** (replace specific values with broader categories) and **suppression** (remove values entirely).

### Application to LLM redaction

Generalization as a redaction strategy:

```
"Goldman Sachs" -> "[Major Investment Bank]"
"123 Main St, Apt 4B, Brooklyn" -> "[Address in Brooklyn, NY]"
"Dr. Sarah Chen, Chief of Cardiology" -> "[Senior Cardiologist]"
```

This isn't k-anonymity in the formal sense (there's no dataset), but the principle is the same: replace specific identifiers with category-level descriptions that cover many possible individuals.

### Generalization hierarchies

For each entity type, define a tree of increasing generality:

```
Person:
  "Dr. Sarah Chen" -> "Dr. Chen" -> "a cardiologist" -> "a doctor" -> "a professional"

Location:
  "123 Main St, Apt 4B" -> "Main Street" -> "Downtown Brooklyn" -> "Brooklyn" -> "New York City"

Organization:
  "Goldman Sachs" -> "a major investment bank" -> "a financial institution" -> "a company"

Amount:
  "$52,341.67" -> "$52,000" -> "approximately $50,000" -> "a five-figure sum"
```

The user (or policy) chooses the generalization level. Deeper = more privacy, less utility.

### Advantages over token redaction

- The LLM retains *some* semantic information: it knows we're talking about a bank, a doctor, a city.
- Output quality degrades gracefully rather than catastrophically.
- Useful as a middle tier between full redaction and structure-preserving substitution.

---

## 8. Threat Modeling for LLM Data Flows

### Actors

| Actor | Capability | Goal |
|-------|-----------|------|
| **LLM provider** | Sees all API inputs/outputs. May log, may train on data, may be subpoenaed. | Assumed honest-but-curious: follows protocol but retains and may analyze data. |
| **Network observer** | Sees encrypted traffic (TLS). Cannot read contents. | Metadata analysis (timing, size). Not our primary concern if TLS is intact. |
| **Other users (shared accounts)** | May see conversation history in provider UI. | Unintentional exposure. Mitigated by session-scoped vault. |
| **Agentic tools** | Receive data from LLM outputs, may forward to third-party APIs. | Data leakage through tool chains. |
| **The user themselves** | May accidentally include sensitive data they didn't intend to share. | Self-protection. This is our primary use case. |

### What we protect against

1. **Direct exposure**: Sensitive values appear in plaintext in API requests to the LLM provider. Mitigated by all redaction strategies.
2. **Inference from context**: The LLM provider can infer redacted values from surrounding context. Example: `"The CEO of [[ORG_1]] testified before Congress in 2023 about AI safety"` - very few orgs match this description. Mitigated by structure-preserving substitution (fake org name doesn't leave contextual clues) and generalization (category is broad enough).
3. **Cross-session correlation**: Across multiple conversations, the same user discusses the same entities. If tokens are consistent across sessions, the provider can build a profile. Mitigated by session-scoped vault (current design).
4. **Output-side leakage**: The LLM's response contains information that, combined with the masked input, reveals the original values. Rare but possible in reasoning chains.

### What we explicitly do NOT protect against

- **Compromised client**: If the user's machine is compromised, the vault is in memory and accessible. We are not a security product against malware.
- **LLM behavioral analysis**: The LLM could theoretically be prompted to try to de-anonymize inputs. We assume the LLM follows its system prompt and doesn't actively attack privacy. This assumption is debatable for open-ended agentic workflows.
- **Side channels**: Timing, token count, response length may leak information about redacted content.

---

## 9. Token Algebra and Composability Across Agentic Steps

### The problem

In agentic workflows, data flows through multiple LLM calls and tool invocations:

```
User prompt -> LLM call 1 -> Tool A -> LLM call 2 -> Tool B -> Final response
```

Each step is a potential leak surface. Redaction must compose: if we mask the user prompt, the mask must propagate correctly through every step, and the final output must be unmaskable.

### Composability requirements

**Forward propagation**: If `LLM call 1` receives masked input and produces output containing tokens, `Tool A` must pass those tokens through unchanged (or the framework must intercept and handle them).

**Vault consistency**: All steps in a chain must share the same vault. If `LLM call 1` creates `[[PERSON_1]] = "John Smith"` and `LLM call 2` encounters `[[PERSON_1]]` in its context, it must resolve to the same person.

**Nested masking**: What if `Tool A` generates new sensitive data not present in the original prompt? For example, a database lookup returns additional PII. This new data needs masking with fresh tokens, added to the same vault.

**Idempotency**: Masking an already-masked text must be a no-op. `mask(mask(x)) = mask(x)`. Our current token format `[[TYPE_N]]` is helpful here - the regex for entity detection shouldn't match token patterns.

### Formal sketch

Define a masking chain for `n` steps:

```
M_1: mask user input
L_1: LLM inference on masked input
T_1: tool execution on L_1 output
M_2: mask any new PII in T_1 output (additive to vault)
L_2: LLM inference on M_2 output
...
U: unmask final output using accumulated vault
```

The vault `V` grows monotonically: `V_0 ⊂ V_1 ⊂ ... ⊂ V_n`.

Each `M_i` must:
1. Detect new entities not already in `V_{i-1}`.
2. Re-use existing tokens for known entities.
3. Create new tokens only for genuinely new entities.

This is achievable with our current architecture if the vault is shared across the chain. The current per-tab implementation scopes to a single conversation, which maps well to a single agentic run.

### API proxy as the composability layer

An API proxy is the natural place to implement this. All LLM calls route through the proxy, which maintains the vault for the duration of the workflow. Tools that make their own API calls would also need to route through the proxy, or the framework must inject the vault.

---

## 10. Lightweight NLP in Constrained Environments

### The constraint

Chrome extension service workers have:
- No filesystem access.
- Startup latency matters (cold starts on every wake).
- Memory limits (Chrome may kill workers exceeding ~128MB).
- No GPU, no WASM SIMD in all contexts.

Our current compromise.js bundle is ~680KB. It loads in ~50-100ms on modern hardware. This is acceptable but leaves little room for growth.

### Alternatives to compromise.js

| Library | Bundle size | Approach | NER quality | Notes |
|---------|------------|----------|-------------|-------|
| compromise.js | ~680KB | Rule-based, lexicon | Moderate | Current choice |
| wink-nlp | ~150KB (+ model) | Statistical, custom models | Moderate | Lighter, but model loading adds latency |
| natural | ~200KB (selective) | Rule-based, classical NLP | Low-moderate | Node.js focused, may need polyfills |
| Custom regex + dictionary | ~10KB | Pattern matching | Low | Current fallback path |

### WASM-based approaches

For the companion app (not the extension), we could use:
- **Rust tokenizers** compiled to WASM (~500KB): Very fast tokenization, useful if we build custom models.
- **ONNX Runtime Web** (~2MB): Run small transformer models in the browser via WASM. Could enable:
  - A tiny NER model (~5-10MB) for better entity detection.
  - A small sentence classifier (~20MB) for sensitivity scoring.
  - Latency: ~100-500ms per inference on CPU. Acceptable for non-real-time redaction.

### Progressive enhancement strategy

```
Tier 1 (instant, <10KB):  Regex detectors for EMAIL, PHONE, AMT, API keys
Tier 2 (fast, ~150KB):    Lightweight NLP for PERSON, ORG (wink-nlp or slim compromise)
Tier 3 (companion only):  Small transformer models for NER, coref, sensitivity scoring
```

The core `Detector` interface is the same across tiers. Each tier registers its detectors. The extension loads tiers 1-2. The companion app loads all three. Detection quality improves transparently when more tiers are available.

---

## References and Further Reading

- Gentry, C. (2009). *A Fully Homomorphic Encryption Scheme.* Stanford PhD thesis.
- Sweeney, L. (2002). *k-Anonymity: A Model for Protecting Privacy.* International Journal of Uncertainty, Fuzziness and Knowledge-Based Systems.
- Dwork, C. (2006). *Differential Privacy.* ICALP.
- Lee, K. et al. (2017). *End-to-end Neural Coreference Resolution.* EMNLP.
- CKKS: Cheon, J.H. et al. (2017). *Homomorphic Encryption for Arithmetic of Approximate Numbers.* ASIACRYPT.
- Microsoft SEAL library documentation (practical FHE implementation).
- NIST Privacy Framework and PII categorization guidelines.
