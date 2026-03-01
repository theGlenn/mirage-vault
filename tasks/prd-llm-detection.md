# PRD: LLM-Assisted Detection (xybrid + Gemma)

## Introduction

Add local LLM-assisted entity detection to Aether Vault using xybrid (embedded inference SDK) and the Gemma 3 1B model. The LLM acts as a refinement layer on top of the existing regex + compromise.js detectors: after the fast detectors run, the text is sent to a local Gemma model that identifies additional PII entities that regex and NLP patterns missed. The results are merged and fed into the existing masking pipeline.

This uses xybrid-core for on-device inference with no external service dependencies. If the model is not downloaded, the app falls back silently to regex + NLP detection only.

## Goals

- Improve entity detection accuracy by catching PII that regex patterns and compromise.js miss
- Run inference entirely on-device via xybrid (no network calls, no cloud LLM)
- Integrate transparently into the existing ingestion pipeline (file drop + text paste)
- Gracefully degrade when the model is not available (app works exactly as before)
- Provide model download and status visibility in the UI

## User Stories

### US-001: Add xybrid crate dependencies and feature flags
**Description:** As a developer, I need xybrid-core and xybrid-sdk added to Cargo.toml so the Rust backend can perform local LLM inference.

**Acceptance Criteria:**
- [ ] Add `xybrid-core` dependency with local path `../../../xybrid/repos/xybrid/crates/xybrid-core`, `default-features = false`
- [ ] Add `xybrid-sdk` dependency with local path `../../../xybrid/repos/xybrid/crates/xybrid-sdk`, `default-features = false`
- [ ] Add `tokio` dependency with `features = ["full"]` for async runtime support
- [ ] Add platform feature flags matching xybrid-studio's pattern: `platform-macos` enables `xybrid-core/ort-download`, `xybrid-core/ort-coreml`, `xybrid-core/candle-metal`, `xybrid-core/llm-llamacpp`
- [ ] Set `default = ["platform-macos"]` in features
- [ ] `cargo check` passes

### US-002: Create LLM state management and model loading
**Description:** As a developer, I need shared LLM state and a model loader so the app can manage the xybrid executor lifecycle.

**Acceptance Criteria:**
- [ ] Create an `llm.rs` module with `LlmState` struct containing: `executor: Option<TemplateExecutor>`, `metadata: Option<ModelMetadata>`, `model_dir: Option<String>`
- [ ] Create `SharedLlmState` type alias as `Arc<Mutex<LlmState>>`
- [ ] Implement `load_llm_model()` function that searches for `gemma-3-1b` in xybrid's cache directory (`~/.xybrid/cache/extracted/gemma-3-1b/`), reads `model_metadata.json`, and creates a `TemplateExecutor::with_base_path()`
- [ ] Register `SharedLlmState` in Tauri's managed state during app setup (`.manage()`)
- [ ] Attempt model loading on startup — if the model is not found, leave executor as `None` (no error)
- [ ] Create `check_llm_status` Tauri command that returns `{ available: bool, model_id: Option<String> }`
- [ ] Register the command in `generate_handler!`
- [ ] `cargo check` passes

### US-003: Implement model download via xybrid-sdk
**Description:** As a user, I want to download the Gemma model from within the app so I can enable LLM-assisted detection.

**Acceptance Criteria:**
- [ ] Create `download_llm_model` async Tauri command that downloads `gemma-3-1b` using `xybrid_sdk::RegistryClient`
- [ ] Emit `llm-download-progress` events during download with `{ progress: f64 }` payload (0.0 to 1.0)
- [ ] After successful download, automatically load the model into `LlmState`
- [ ] Return `Ok(())` on success, `Err(String)` on failure
- [ ] Register the command in `generate_handler!`
- [ ] `cargo check` passes

### US-004: Create refine_entities Tauri command
**Description:** As a developer, I need a Tauri command that sends text to the local LLM and returns additional detected entities so the frontend can merge them with regex/NLP results.

**Acceptance Criteria:**
- [ ] Create `DetectionInput` serde struct with `entity_type: String`, `value: String`, `start: i64`, `end: i64`
- [ ] Create `refine_entities` async Tauri command accepting `text: String` and `existing: Vec<DetectionInput>`
- [ ] If LLM is not loaded (`executor` is `None`), return `existing` unchanged immediately
- [ ] Build a NER prompt: provide the text, ask the model to extract all PII (types: EMAIL, PERSON, ORG, AMT, PHONE, API_KEY), return as JSON array of `{"type", "value", "start", "end"}` objects
- [ ] Call `executor.execute(&metadata, &input_envelope, None)` — non-streaming, one-shot
- [ ] Run inference on a blocking thread via `tokio::task::spawn_blocking` (or `tauri::async_runtime::spawn_blocking`) since inference is CPU-bound
- [ ] Parse the LLM text response: extract JSON array from the output, deserialize into detections
- [ ] Merge LLM detections with existing detections: add new entities that don't overlap with existing ones (based on start/end spans)
- [ ] If LLM response parsing fails, log a warning and return `existing` unchanged (graceful degradation)
- [ ] Return the merged list of `DetectionInput` objects
- [ ] Register the command in `generate_handler!`
- [ ] `cargo check` passes

### US-005: Wire LLM refinement into frontend ingestion pipelines
**Description:** As a user, I want my files and pasted text to benefit from LLM-assisted detection when the model is available.

**Acceptance Criteria:**
- [ ] In `ingestFilePath()`: after `detect(text)`, call `invoke('refine_entities', { text, existing: detections })` to get refined detections, then pass refined detections to `mask()`
- [ ] In `ingestPdfFilePath()`: same pattern — call `refine_entities` between `detect()` and `mask()`
- [ ] In `handlePasteSubmit()`: same pattern — call `refine_entities` between `detect()` and `mask()`
- [ ] The `refine_entities` call maps frontend `Detection[]` to the Tauri command's `DetectionInput[]` format (type → entity_type, value → value, start → start, end → end) and maps the result back
- [ ] If `refine_entities` throws an error, catch it and fall back to using original detections (don't block ingestion)
- [ ] Processing spinner/indicator remains visible during the LLM step
- [ ] `pnpm check` passes

### US-006: Add LLM status indicator and model download UI
**Description:** As a user, I want to see whether LLM detection is available and download the model if needed.

**Acceptance Criteria:**
- [ ] On app mount, call `check_llm_status` to determine if the model is loaded
- [ ] Display LLM status in the left sidebar header area (below "Files" heading): a small text indicator showing "LLM: active" (green) or "LLM: not available" (muted)
- [ ] When LLM is not available, show a "Download Model" button next to the status indicator
- [ ] Clicking "Download Model" calls `invoke('download_llm_model')` and shows a progress bar or spinner
- [ ] Listen for `llm-download-progress` events to update the progress indicator
- [ ] After successful download, update the status to "LLM: active" and hide the download button
- [ ] On download error, show an error toast with the message
- [ ] Style the status indicator for both light and dark mode
- [ ] `pnpm check` passes
- [ ] Verify in browser using dev tools

## Functional Requirements

- FR-1: The Rust backend must use xybrid-core to run Gemma 3 1B inference locally on the user's machine
- FR-2: The LLM refinement step must run between the regex/NLP detection pass and the masking step
- FR-3: LLM-detected entities must be merged with regex/NLP entities, deduplicating overlapping spans
- FR-4: If the LLM model is not downloaded, the app must work exactly as before (regex + NLP only)
- FR-5: If inference fails or response parsing fails, the app must fall back to regex/NLP results without error
- FR-6: The model must be downloadable from within the app via xybrid-sdk's RegistryClient
- FR-7: The UI must show the current LLM availability status
- FR-8: LLM inference must run synchronously during ingestion (blocking until complete) with a visible processing indicator

## Non-Goals (Out of Scope)

- **No chat interface** — the LLM is used exclusively for entity detection, not conversational AI
- **No streaming** — one-shot inference is sufficient for NER
- **No multi-model support** — only gemma-3-1b for v1
- **No user-configurable prompts** — the NER prompt is hardcoded
- **No per-entity LLM attribution** — the UI does not distinguish which entities came from regex/NLP vs LLM
- **No conversation context** — each inference call is independent (no multi-turn)
- **No TTS or ASR** — only text generation capabilities are used from xybrid

## Design Considerations

- The LLM status indicator should be subtle — a small pill or text label in the sidebar header, not a prominent banner
- The model download progress should be a simple progress bar or spinner in the sidebar, not a modal
- No changes to the entity sidebar, content viewer, or export features — LLM just produces more entities that flow through the existing pipeline

## Technical Considerations

- **xybrid crate paths:** `xybrid-core` and `xybrid-sdk` are referenced via local path dependencies (`../../../xybrid/repos/xybrid/crates/`). Not published to crates.io.
- **Platform features:** macOS requires `ort-download`, `ort-coreml`, `candle-metal`, `llm-llamacpp` features on xybrid-core. These enable ONNX Runtime with CoreML, Metal GPU acceleration, and llama.cpp for GGUF models.
- **Model size:** Gemma 3 1B is ~1-2GB on disk (quantized). Download time depends on network speed.
- **Inference latency:** On Apple Silicon, Gemma 3 1B with Metal should complete NER in 1-3 seconds for typical document text. The synchronous flow means ingestion blocks during this time.
- **CPU-bound inference:** Use `tokio::task::spawn_blocking()` to avoid blocking the Tauri async runtime during inference.
- **NER prompt strategy:** Send the full text and ask for all PII entities. Keep the prompt simple for a 1B model — avoid complex multi-step instructions. Request JSON output format.
- **Entity merging:** When merging LLM detections with regex/NLP detections, an LLM detection is "new" if its `[start, end)` span does not overlap with any existing detection. Overlapping LLM detections are discarded (regex/NLP results take precedence since they have verified positions).
- **Detection type:** Frontend `Detection` is `{ type: EntityType, value: string, start: number, end: number }`. The Tauri command uses a mirrored `DetectionInput` struct with the same fields.
- **xybrid API pattern:** `TemplateExecutor::with_base_path(dir)` → `executor.execute(&metadata, &envelope, None)` → `Envelope { kind: EnvelopeKind::Text(...), metadata: HashMap }`. Output is also an `Envelope` — extract text from `EnvelopeKind::Text(response)`.
- **Model directory:** xybrid stores models in `~/.xybrid/cache/extracted/{model_id}/` with a `model_metadata.json` file. Use `xybrid_sdk::RegistryClient::default_client().extraction_dir(model_id)` to find the path.

## Success Metrics

- Gemma 3 1B detects additional entities that regex + NLP missed (e.g., names in unusual formats, company names without "Inc"/"Corp", amounts in words)
- Inference completes in under 5 seconds for documents up to 10KB
- App remains fully functional when model is not downloaded
- Model download completes successfully from within the app

## Open Questions

- What is the optimal NER prompt for Gemma 3 1B? May need iterative refinement based on real-world results.
- Should we limit the text length sent to the LLM? Long documents may exceed context window or produce slow inference.
- How reliable is Gemma 3 1B's JSON output? May need fallback parsing strategies (regex extraction of entity patterns from free-text responses).
- Should inference run on every ingestion or should there be an option to re-run it on existing items?
