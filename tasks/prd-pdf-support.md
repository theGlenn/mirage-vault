# PRD: PDF Support (Phase 1b)

## Introduction

Extend Aether Vault to accept `.pdf` files alongside the existing text-based formats (`.txt`, `.md`, `.csv`, `.json`). The Rust backend extracts text from PDF files using `lopdf`, sends it to the frontend for detection and masking through the existing pipeline, and stores results in SQLite like any other vault item. Users can browse, toggle masked/raw views, and export masked content as `.txt` or as an experimental masked PDF.

This builds on the fully functional Phase 1a vault app — drop zone, detection, masking, file browser, entity highlights, and export all exist and work. This feature extends them to handle PDFs.

## Goals

- Accept `.pdf` files via the existing drop zone
- Extract text from native (text-layer) PDFs using `lopdf` in the Rust backend
- Route extracted text through the existing detection and masking pipeline
- Display PDF content in the file browser with masked/raw toggle and entity highlights
- Preserve page structure with page break markers in extracted text
- Gracefully handle PDFs with partial or no extractable text
- Export masked content as `.txt`, with experimental masked PDF output via `lopdf::replace_text()`

## User Stories

### US-001: Add lopdf dependency and PDF text extraction command
**Description:** As a developer, I need a Rust-side Tauri command that accepts a PDF file path or bytes and returns extracted text so the frontend can process it.

**Acceptance Criteria:**
- [ ] Add `lopdf` crate to `Cargo.toml`
- [ ] Create an `extract_pdf_text` Tauri command that accepts PDF file content as bytes (Vec<u8>)
- [ ] The command uses `lopdf::Document::load_from()` to parse the PDF
- [ ] Text is extracted page by page using `document.extract_text(&[page_number])`
- [ ] Pages are concatenated with `--- Page N ---` markers between them
- [ ] Returns a struct with: extracted text (String), page count (u32), and a warning flag (bool) if any pages yielded no text
- [ ] If the entire PDF yields zero text, return an error with message "No extractable text found. This may be a scanned document."
- [ ] If some pages have text and others don't, return the partial text with the warning flag set to true
- [ ] Command is registered in the Tauri builder
- [ ] `cargo check` passes

### US-002: Update drop zone to accept PDF files
**Description:** As a user, I want to drop PDF files into the vault so I can redact them alongside my text files.

**Acceptance Criteria:**
- [ ] Drop zone accepts `.pdf` files in addition to `.txt`, `.md`, `.csv`, `.json`
- [ ] Drop zone instructional text is updated to include `.pdf` in the list of supported formats
- [ ] When a `.pdf` file is dropped, the raw bytes are read via the FileReader API as an ArrayBuffer
- [ ] The bytes are passed to the `extract_pdf_text` Tauri command
- [ ] The returned extracted text is fed into the existing detection and masking pipeline
- [ ] The item is saved to SQLite with `file_type` set to `"pdf"`, `raw_content` set to the extracted text, and `masked_content` set to the masked text
- [ ] `pnpm check` passes
- [ ] Verify in browser using dev tools

### US-003: Handle PDF extraction warnings and errors in the UI
**Description:** As a user, I want clear feedback when a PDF can't be fully processed so I know whether to trust the results.

**Acceptance Criteria:**
- [ ] If `extract_pdf_text` returns a warning (partial extraction), show a persistent warning banner on the ingested item: "Some pages in this PDF could not be extracted. Results may be incomplete."
- [ ] The warning is stored in the `items` table (add a `warning` TEXT column, nullable) and displayed when the item is selected
- [ ] If `extract_pdf_text` returns an error (zero text), show an error toast: "Could not extract text from [filename]. This may be a scanned document."
- [ ] The file is NOT saved to the vault on total failure
- [ ] `pnpm check` passes
- [ ] Verify in browser using dev tools

### US-004: Display PDF content with page markers in the content viewer
**Description:** As a user, I want to see PDF content in the content viewer with clear page boundaries so I can understand the document structure.

**Acceptance Criteria:**
- [ ] When a PDF item is selected, both masked and original views display the extracted text with `--- Page N ---` markers
- [ ] Page markers are visually styled differently from content text (e.g., centered, muted color, horizontal rule)
- [ ] Page markers are NOT treated as entity-detectable content (masking skips them)
- [ ] Entity highlights work correctly on the extracted text between page markers
- [ ] PDF items show a `.pdf` badge in the file list (distinct from `.txt`)
- [ ] `pnpm check` passes
- [ ] Verify in browser using dev tools

### US-005: Export masked PDF content as .txt
**Description:** As a user, I want to export the masked version of a PDF as a text file so I can use it externally.

**Acceptance Criteria:**
- [ ] When exporting a PDF item via the "Export" button, the save dialog defaults to `[original_name]_masked.txt`
- [ ] The exported file contains the masked text including page markers
- [ ] Clipboard copy works the same as other file types (copies masked text)
- [ ] Batch zip export includes PDF items as `[name]_masked.txt` files
- [ ] `pnpm check` passes

### US-006: Experimental masked PDF export
**Description:** As a user, I want the option to export a masked PDF that preserves the original document layout so I can share redacted documents in their original format.

**Acceptance Criteria:**
- [ ] Add an `export_masked_pdf` Tauri command that accepts: original PDF bytes, a list of entity mappings (original_value -> token), and an output file path
- [ ] The command uses `lopdf` to load the original PDF and `replace_text()` to substitute original entity values with their tokens
- [ ] Opens a native save dialog with default filename `[original_name]_masked.pdf`
- [ ] When exporting a PDF item, a secondary export option is available: "Export as masked PDF (experimental)"
- [ ] If `replace_text()` fails or produces unexpected results, fall back to `.txt` export with a warning toast
- [ ] The exported PDF contains ONLY masked values — no original PII
- [ ] `cargo check` passes
- [ ] `pnpm check` passes

### US-007: Store original PDF bytes for masked PDF export
**Description:** As a developer, I need the original PDF binary stored so that the experimental masked PDF export can operate on the original document structure.

**Acceptance Criteria:**
- [ ] Add a `raw_pdf_bytes` BLOB column to the `items` table (nullable, only populated for PDF items)
- [ ] When a PDF is ingested, store the original file bytes in `raw_pdf_bytes`
- [ ] The `get_item` command includes `raw_pdf_bytes` in its response when the item is a PDF (as base64-encoded string or binary)
- [ ] The `delete_item` command clears `raw_pdf_bytes` along with other item data
- [ ] Non-PDF items have NULL for `raw_pdf_bytes`
- [ ] `cargo check` passes

## Functional Requirements

- FR-1: The Rust backend must extract text from PDF files using `lopdf`, page by page
- FR-2: Extracted text must include `--- Page N ---` markers between pages
- FR-3: If a PDF has zero extractable text, reject the file with a user-visible error
- FR-4: If a PDF has partial text (some empty pages), accept it with a persistent warning
- FR-5: The drop zone must accept `.pdf` files and route them through Rust-side extraction before the frontend masking pipeline
- FR-6: PDF items must appear in the file browser with a `.pdf` type badge
- FR-7: The content viewer must display PDF text with page markers, supporting masked/raw toggle and entity highlights
- FR-8: Page markers must not be detected as entities or masked
- FR-9: Export of PDF items must default to `.txt` format with masked content
- FR-10: An experimental "Export as masked PDF" option must be available using `lopdf::replace_text()`
- FR-11: Original PDF bytes must be stored in SQLite for the masked PDF export to use
- FR-12: The batch zip export must include PDF items as `.txt` files
- FR-13: The warning column must be added to the items table schema

## Non-Goals (Out of Scope)

- **No OCR** — scanned/image-based PDFs are not supported. Only text-layer PDFs.
- **No PDF rendering** — we do not render the PDF visually. Content is displayed as extracted text.
- **No multi-column layout preservation** — text is extracted in reading order as determined by `lopdf`. Complex layouts may produce imperfect ordering.
- **No PDF form field extraction** — only text content is extracted.
- **No password-protected PDF support** — `lopdf` only supports empty-password decryption. Encrypted PDFs will be rejected.
- **No guaranteed masked PDF quality** — the experimental PDF export is best-effort. `replace_text()` may not handle all font encodings or layouts.

## Design Considerations

- Reuse all existing UI components: drop zone, file list, content viewer, entity sidebar, export buttons
- Page markers should be visually distinct — consider a horizontal rule with centered "Page N" text in a muted color
- The "Export as masked PDF" button should be clearly labeled as experimental
- Warning banners for partial extraction should be dismissible but re-appear on re-selecting the item

## Technical Considerations

- **`lopdf` version:** v0.39.0 (requires Rust 1.85+). Verify current Rust toolchain version.
- **IPC boundary:** PDF bytes are read in the frontend (FileReader as ArrayBuffer), sent to Rust via Tauri invoke as `Vec<u8>`. Extracted text returns as a String. This means the full PDF binary crosses the IPC boundary — fine for typical document sizes (< 50MB).
- **Storage impact:** Storing raw PDF bytes in SQLite (`raw_pdf_bytes` BLOB) increases database size significantly for large PDFs. This is acceptable for a local-only app.
- **Page marker format:** Use `\n\n--- Page N ---\n\n` as the delimiter. The masking engine must not match this pattern as an entity. The existing `[[TYPE_N]]` regex should not collide.
- **`replace_text()` limitations:** `lopdf`'s text replacement works on the PDF content stream level. It may fail for text split across multiple text objects, CIDFont-encoded text, or text with complex positioning. The fallback to `.txt` export handles these cases.
- **Schema migration:** Adding `warning` (TEXT) and `raw_pdf_bytes` (BLOB) columns. Use `ALTER TABLE` with `IF NOT EXISTS` or handle gracefully on startup.

## Success Metrics

- User can drop a standard text-layer PDF and see masked output within 3 seconds
- Extracted text is readable and entity detection catches PII within it
- Partial extraction warning is shown for mixed-content PDFs
- Scanned PDFs are rejected with a clear error message, not a crash
- The experimental masked PDF export produces a valid PDF with tokens replacing PII for simple single-column documents

## Open Questions

- What is the maximum PDF file size we should accept? Should we add a size limit to prevent memory issues during extraction?
- Should page markers be included in clipboard copy, or should we offer a "copy without page markers" option?
- How should we handle PDFs with non-Latin text (CJK, Arabic, etc.)? `lopdf` text extraction may not support all encodings.
