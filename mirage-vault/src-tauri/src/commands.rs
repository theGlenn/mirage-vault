use crate::crypto;
use crate::db::DbState;
use pdfium_render::prelude::*;
use rand::Rng;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::io::{Cursor, Write};
use std::sync::Mutex;
use tauri::Manager;
use tauri::State;
use tauri_plugin_dialog::DialogExt;

// --- Request / Response types ---

#[derive(Deserialize)]
pub struct EntityInput {
    pub entity_type: String,
    pub original_value: String,
    pub token: String,
    pub span_start: i64,
    pub span_end: i64,
}

#[derive(Serialize)]
pub struct ItemSummary {
    pub id: i64,
    pub name: String,
    pub file_type: String,
    pub entity_count: i64,
    pub created_at: String,
    pub warning: Option<String>,
    pub status: String,
}

#[derive(Serialize)]
pub struct EntityOutput {
    pub id: i64,
    pub entity_type: String,
    pub original_value: String,
    pub token: String,
    pub span_start: i64,
    pub span_end: i64,
}

#[derive(Serialize)]
pub struct ItemDetail {
    pub id: i64,
    pub name: String,
    pub file_type: String,
    pub raw_content: String,
    pub masked_content: String,
    pub created_at: String,
    pub warning: Option<String>,
    pub raw_pdf_bytes: Option<Vec<u8>>,
    pub entities: Vec<EntityOutput>,
}

fn extract_hash_from_token(token: &str) -> Option<String> {
    let trimmed = token.trim();
    if !(trimmed.starts_with("[[") && trimmed.ends_with("]]")) {
        return None;
    }

    let inner = &trimmed[2..trimmed.len() - 2];
    let (_entity_type, hash) = inner.split_once(':')?;
    if hash.is_empty() || !hash.chars().all(|c| c.is_ascii_alphanumeric()) {
        return None;
    }

    Some(hash.to_string())
}

// --- MCP Server State ---

pub struct McpServerState {
    pub child: Mutex<Option<std::process::Child>>,
    pub passphrase: Mutex<Option<String>>,
}

#[derive(Serialize)]
pub struct McpServerStatus {
    pub running: bool,
    pub port: Option<u16>,
}

fn find_mcp_script() -> Result<std::path::PathBuf, String> {
    // Check environment variable first
    if let Ok(path) = std::env::var("MIRAGE_MCP_SERVER_SCRIPT") {
        let p = std::path::PathBuf::from(&path);
        if p.exists() {
            return Ok(p);
        }
    }

    // Development: relative to CARGO_MANIFEST_DIR (src-tauri/)
    let dev_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../mcp-server/dist/index-sse.js");
    if dev_path.exists() {
        return Ok(dev_path.canonicalize().map_err(|e| e.to_string())?);
    }

    // Production: next to the executable
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            let prod_path = parent.join("mcp-server/dist/index-sse.js");
            if prod_path.exists() {
                return Ok(prod_path);
            }
        }
    }

    Err("MCP server script not found. Build the mcp-server package first: cd mcp-server && pnpm build".to_string())
}

fn start_mcp_server_internal(
    app: &tauri::AppHandle,
    mcp_state: &McpServerState,
) -> Result<(), String> {
    let passphrase = {
        let pp = mcp_state.passphrase.lock().map_err(|e| e.to_string())?;
        pp.clone().unwrap_or_default()
    };

    let mut child_guard = mcp_state.child.lock().map_err(|e| e.to_string())?;

    // Check if already running
    if let Some(ref mut child) = *child_guard {
        match child.try_wait() {
            Ok(None) => return Ok(()), // already running
            _ => {
                *child_guard = None;
            }
        }
    }

    let mcp_script = find_mcp_script()?;

    let db_path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("vault.db");

    let child = std::process::Command::new("node")
        .arg(&mcp_script)
        .env("MIRAGE_VAULT_PASSPHRASE", &passphrase)
        .env(
            "MIRAGE_VAULT_DB_PATH",
            db_path.to_str().unwrap_or(""),
        )
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start MCP server: {}", e))?;

    *child_guard = Some(child);
    Ok(())
}

pub fn stop_mcp_process(mcp_state: &McpServerState) {
    if let Ok(mut child_guard) = mcp_state.child.lock() {
        if let Some(ref mut child) = *child_guard {
            let _ = child.kill();
            let _ = child.wait();
        }
        *child_guard = None;
    }
}

// --- Key Management Commands ---

#[tauri::command]
pub fn init_encryption(
    passphrase: String,
    app: tauri::AppHandle,
    mcp_state: State<'_, McpServerState>,
) -> Result<(), String> {
    crypto::init_with_passphrase(&passphrase)?;

    // Store passphrase for MCP server
    {
        let mut pp = mcp_state.passphrase.lock().map_err(|e| e.to_string())?;
        *pp = Some(passphrase);
    }

    // Auto-start MCP server (non-fatal if it fails)
    if let Err(e) = start_mcp_server_internal(&app, &mcp_state) {
        log::warn!("Failed to auto-start MCP server: {}", e);
    }

    Ok(())
}

#[tauri::command]
pub fn is_encryption_initialized() -> bool {
    crypto::is_key_set()
}

#[tauri::command]
pub fn clear_encryption_key(mcp_state: State<'_, McpServerState>) {
    // Stop MCP server and clear passphrase
    stop_mcp_process(&mcp_state);
    if let Ok(mut pp) = mcp_state.passphrase.lock() {
        *pp = None;
    }
    crypto::clear_key();
}

// --- MCP Server Management Commands ---

#[tauri::command]
pub fn start_mcp_server(
    app: tauri::AppHandle,
    mcp_state: State<'_, McpServerState>,
) -> Result<McpServerStatus, String> {
    start_mcp_server_internal(&app, &mcp_state)?;
    Ok(McpServerStatus {
        running: true,
        port: Some(3420),
    })
}

#[tauri::command]
pub fn stop_mcp_server(
    mcp_state: State<'_, McpServerState>,
) -> Result<(), String> {
    let mut child_guard = mcp_state.child.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut child) = *child_guard {
        child
            .kill()
            .map_err(|e| format!("Failed to stop MCP server: {}", e))?;
        let _ = child.wait();
    }
    *child_guard = None;
    Ok(())
}

#[tauri::command]
pub fn get_mcp_server_status(
    mcp_state: State<'_, McpServerState>,
) -> Result<McpServerStatus, String> {
    let mut child_guard = mcp_state.child.lock().map_err(|e| e.to_string())?;

    if let Some(ref mut child) = *child_guard {
        match child.try_wait() {
            Ok(None) => Ok(McpServerStatus {
                running: true,
                port: Some(3420),
            }),
            _ => {
                *child_guard = None;
                Ok(McpServerStatus {
                    running: false,
                    port: None,
                })
            }
        }
    } else {
        Ok(McpServerStatus {
            running: false,
            port: None,
        })
    }
}

// --- MCPB Export ---

fn find_mcpb_file() -> Result<std::path::PathBuf, String> {
    // Check environment variable first
    if let Ok(path) = std::env::var("MIRAGE_MCPB_PATH") {
        let p = std::path::PathBuf::from(&path);
        if p.exists() {
            return Ok(p);
        }
    }

    // Development: relative to CARGO_MANIFEST_DIR (src-tauri/)
    let dev_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../mcp-server/dist/mirage-vault.mcpb");
    if dev_path.exists() {
        return Ok(dev_path.canonicalize().map_err(|e| e.to_string())?);
    }

    // Production: next to the executable
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            let prod_path = parent.join("mirage-vault.mcpb");
            if prod_path.exists() {
                return Ok(prod_path);
            }
        }
    }

    Err("MCPB extension file not found. Build it first: cd mcp-server && pnpm run package".to_string())
}

#[tauri::command]
pub fn export_mcpb(dest_path: String) -> Result<(), String> {
    let source = find_mcpb_file()?;
    std::fs::copy(&source, &dest_path).map_err(|e| format!("Failed to copy MCPB file: {}", e))?;
    Ok(())
}

// --- Commands ---

#[tauri::command]
pub fn save_item(
    db: State<'_, DbState>,
    name: String,
    file_type: String,
    raw_content: String,
    masked_content: String,
    entities: Vec<EntityInput>,
    warning: Option<String>,
    raw_pdf_bytes: Option<Vec<u8>>,
    status: Option<String>,
) -> Result<i64, String> {
    let item_status = status.unwrap_or_else(|| "done".to_string());
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    log::info!("save_item: name={}, file_type={}, status={}", name, file_type, item_status);

    // Encrypt raw content before storing
    let encrypted_content = if crypto::is_key_set() {
        crypto::encrypt(&raw_content)?
    } else {
        // If encryption not initialized, store as plaintext (for development)
        raw_content
    };

    conn.execute(
        "INSERT INTO items (name, file_type, raw_content, masked_content, warning, raw_pdf_bytes, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![name, file_type, encrypted_content, masked_content, warning, raw_pdf_bytes, item_status],
    )
    .map_err(|e| e.to_string())?;

    let item_id = conn.last_insert_rowid();

    for entity in &entities {
        // Encrypt the original value before storing
        let encrypted_value = if crypto::is_key_set() {
            crypto::encrypt(&entity.original_value)?
        } else {
            entity.original_value.clone()
        };
        
        conn.execute(
            "INSERT INTO entities (item_id, entity_type, original_value, token, span_start, span_end) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                item_id,
                entity.entity_type,
                encrypted_value,
                entity.token,
                entity.span_start,
                entity.span_end,
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(item_id)
}

#[tauri::command]
pub fn update_item_masking(
    db: State<'_, DbState>,
    item_id: i64,
    masked_content: String,
    entities: Vec<EntityInput>,
    status: Option<String>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let item_status = status.unwrap_or_else(|| "done".to_string());

    conn.execute_batch("BEGIN TRANSACTION;")
        .map_err(|e| e.to_string())?;

    let updated = conn
        .execute(
            "UPDATE items SET masked_content = ?1, status = ?2 WHERE id = ?3",
            rusqlite::params![masked_content, item_status, item_id],
        )
        .map_err(|e| {
            let _ = conn.execute_batch("ROLLBACK;");
            e.to_string()
        })?;

    if updated == 0 {
        let _ = conn.execute_batch("ROLLBACK;");
        return Err("Item not found.".to_string());
    }

    conn.execute(
        "DELETE FROM entities WHERE item_id = ?1",
        rusqlite::params![item_id],
    )
    .map_err(|e| {
        let _ = conn.execute_batch("ROLLBACK;");
        e.to_string()
    })?;

    conn.execute(
        "DELETE FROM hash_mappings WHERE item_id = ?1",
        rusqlite::params![item_id],
    )
    .map_err(|e| {
        let _ = conn.execute_batch("ROLLBACK;");
        e.to_string()
    })?;

    let mut seen_hashes = std::collections::HashSet::new();

    for entity in &entities {
        let encrypted_value = if crypto::is_key_set() {
            crypto::encrypt(&entity.original_value).map_err(|e| {
                let _ = conn.execute_batch("ROLLBACK;");
                e
            })?
        } else {
            entity.original_value.clone()
        };

        conn.execute(
            "INSERT INTO entities (item_id, entity_type, original_value, token, span_start, span_end) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                item_id,
                entity.entity_type,
                encrypted_value,
                entity.token,
                entity.span_start,
                entity.span_end,
            ],
        )
        .map_err(|e| {
            let _ = conn.execute_batch("ROLLBACK;");
            e.to_string()
        })?;

        if let Some(hash) = extract_hash_from_token(&entity.token) {
            if seen_hashes.insert(hash.clone()) {
                conn.execute(
                    "INSERT INTO hash_mappings (item_id, hash, original, entity_type) VALUES (?1, ?2, ?3, ?4)",
                    rusqlite::params![item_id, hash, entity.original_value, entity.entity_type],
                )
                .map_err(|e| {
                    let _ = conn.execute_batch("ROLLBACK;");
                    e.to_string()
                })?;
            }
        }
    }

    conn.execute_batch("COMMIT;")
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn list_items(db: State<'_, DbState>) -> Result<Vec<ItemSummary>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT i.id, i.name, i.file_type, COUNT(e.id) AS entity_count, i.created_at, i.warning, i.status
             FROM items i
             LEFT JOIN entities e ON e.item_id = i.id
             GROUP BY i.id
             ORDER BY i.created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(ItemSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                file_type: row.get(2)?,
                entity_count: row.get(3)?,
                created_at: row.get(4)?,
                warning: row.get(5)?,
                status: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    for row in rows {
        items.push(row.map_err(|e| e.to_string())?);
    }

    Ok(items)
}

#[tauri::command]
pub fn get_item(db: State<'_, DbState>, item_id: i64) -> Result<ItemDetail, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let item = conn
        .query_row(
            "SELECT id, name, file_type, raw_content, masked_content, created_at, warning, raw_pdf_bytes FROM items WHERE id = ?1",
            rusqlite::params![item_id],
            |row| {
                let encrypted_content: String = row.get(3)?;
                
                // Decrypt raw content if encryption is initialized
                let raw_content = if crypto::is_key_set() {
                    crypto::decrypt(&encrypted_content).unwrap_or_else(|_| encrypted_content)
                } else {
                    encrypted_content
                };
                
                Ok(ItemDetail {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    file_type: row.get(2)?,
                    raw_content,
                    masked_content: row.get(4)?,
                    created_at: row.get(5)?,
                    warning: row.get(6)?,
                    raw_pdf_bytes: row.get(7)?,
                    entities: Vec::new(),
                })
            },
        )
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, entity_type, original_value, token, span_start, span_end FROM entities WHERE item_id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let entities = stmt
        .query_map(rusqlite::params![item_id], |row| {
            let encrypted_value: String = row.get(2)?;
            
            // Decrypt the original value if encryption is initialized
            let original_value = if crypto::is_key_set() {
                crypto::decrypt(&encrypted_value).unwrap_or_else(|_| encrypted_value)
            } else {
                encrypted_value
            };
            
            Ok(EntityOutput {
                id: row.get(0)?,
                entity_type: row.get(1)?,
                original_value,
                token: row.get(3)?,
                span_start: row.get(4)?,
                span_end: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut entity_list = Vec::new();
    for entity in entities {
        entity_list.push(entity.map_err(|e| e.to_string())?);
    }

    Ok(ItemDetail {
        entities: entity_list,
        ..item
    })
}

#[tauri::command]
pub fn delete_item(db: State<'_, DbState>, item_id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    // Foreign keys with ON DELETE CASCADE handle entities deletion,
    // but we wrap in a transaction for safety.
    conn.execute_batch("BEGIN TRANSACTION;")
        .map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM entities WHERE item_id = ?1",
        rusqlite::params![item_id],
    )
    .map_err(|e| {
        let _ = conn.execute_batch("ROLLBACK;");
        e.to_string()
    })?;

    conn.execute("DELETE FROM items WHERE id = ?1", rusqlite::params![item_id])
        .map_err(|e| {
            let _ = conn.execute_batch("ROLLBACK;");
            e.to_string()
        })?;

    conn.execute_batch("COMMIT;")
        .map_err(|e| e.to_string())?;

    Ok(())
}

// --- File read commands (for Tauri drag-drop which provides file paths) ---

#[tauri::command]
pub fn read_file_text(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| e.to_string())
}

// --- PDF commands ---

#[derive(Serialize)]
pub struct PdfExtractResult {
    pub text: String,
    pub page_count: u32,
    pub has_warning: bool,
}

#[tauri::command]
pub fn extract_pdf_text(content: Vec<u8>) -> Result<PdfExtractResult, String> {
    match extract_pdf_text_with_pdfium(&content) {
        Ok(result) => Ok(result),
        Err(_) => extract_pdf_text_with_lopdf(&content),
    }
}

fn extract_pdf_text_with_pdfium(content: &[u8]) -> Result<PdfExtractResult, String> {
    let bindings = Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path("./"))
        .or_else(|_| Pdfium::bind_to_system_library())
        .map_err(|e| format!("Failed to bind to Pdfium library: {}", e))?;

    let pdfium = Pdfium::new(bindings);
    let document = pdfium
        .load_pdf_from_byte_vec(content.to_vec(), None)
        .map_err(|e| format!("Failed to parse PDF file: {}", e))?;

    let page_count = document.pages().len() as u32;
    let mut texts: Vec<String> = Vec::new();
    let mut empty_pages = 0u32;

    for (index, page) in document.pages().iter().enumerate() {
        let page_text = page
            .text()
            .map_err(|e| format!("Failed to extract text from page {}: {}", index + 1, e))?;
        let trimmed = page_text.all().trim().to_string();

        if index > 0 {
            texts.push(format!("\n\n--- Page {} ---\n\n", index + 1));
        }

        if trimmed.is_empty() {
            empty_pages += 1;
        }

        texts.push(trimmed);
    }

    build_pdf_extract_result(texts, page_count, empty_pages)
}

fn extract_pdf_text_with_lopdf(content: &[u8]) -> Result<PdfExtractResult, String> {
    let doc = lopdf::Document::load_from(Cursor::new(content))
        .map_err(|_| "Failed to parse PDF file.".to_string())?;

    let pages = doc.get_pages();
    let page_count = pages.len() as u32;
    let mut texts: Vec<String> = Vec::new();
    let mut empty_pages = 0u32;

    for (i, page_num) in pages.keys().enumerate() {
        let page_text = doc.extract_text(&[*page_num]).unwrap_or_default();
        let trimmed = page_text.trim().to_string();

        if i > 0 {
            texts.push(format!("\n\n--- Page {} ---\n\n", page_num));
        }

        if trimmed.is_empty() {
            empty_pages += 1;
        }

        texts.push(trimmed);
    }

    build_pdf_extract_result(texts, page_count, empty_pages)
}

fn build_pdf_extract_result(
    texts: Vec<String>,
    page_count: u32,
    empty_pages: u32,
) -> Result<PdfExtractResult, String> {
    let combined = texts.join("");

    if combined.trim().is_empty() {
        return Err("No extractable text found. This may be a scanned document.".to_string());
    }

    let has_warning = empty_pages > 0 && empty_pages < page_count;

    Ok(PdfExtractResult {
        text: combined,
        page_count,
        has_warning,
    })
}

// --- PDF export commands ---

#[derive(Deserialize)]
pub struct ReplacementPair {
    pub original: String,
    pub token: String,
}

#[tauri::command]
pub async fn export_masked_pdf(
    app: tauri::AppHandle,
    pdf_bytes: Vec<u8>,
    replacements: Vec<ReplacementPair>,
    file_name: String,
) -> Result<bool, String> {
    let mut doc = lopdf::Document::load_from(Cursor::new(pdf_bytes))
        .map_err(|_| "Failed to parse PDF file.".to_string())?;

    let page_numbers: Vec<u32> = doc.get_pages().keys().copied().collect();
    for pair in &replacements {
        for &page_num in &page_numbers {
            // replace_text may fail on some pages (e.g., unsupported font encodings); skip those
            let _ = doc.replace_text(page_num, &pair.original, &pair.token);
        }
    }

    let default_name = format!(
        "{}_masked.pdf",
        file_name.trim_end_matches(".pdf")
    );

    let file_path = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter("PDF file", &["pdf"])
        .blocking_save_file();

    let file_path = match file_path {
        Some(path) => path,
        None => return Ok(false), // User cancelled
    };

    let mut file = std::fs::File::create(file_path.as_path().unwrap())
        .map_err(|e| format!("Failed to create output file: {}", e))?;
    doc.save_to(&mut file)
        .map_err(|e| format!("Failed to save masked PDF: {}", e))?;

    Ok(true)
}

// --- Export commands ---

#[tauri::command]
pub async fn export_file(
    app: tauri::AppHandle,
    file_name: String,
    content: String,
    file_extension: String,
) -> Result<(), String> {
    let default_name = format!(
        "{}_masked.{}",
        file_name.trim_end_matches(&format!(".{}", file_extension)),
        file_extension
    );

    let file_path = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter("Masked file", &[&file_extension])
        .blocking_save_file();

    let file_path = match file_path {
        Some(path) => path,
        None => return Ok(()), // User cancelled
    };

    std::fs::write(file_path.as_path().unwrap(), content.as_bytes())
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[derive(Deserialize)]
pub struct ZipItemInput {
    pub name: String,
    pub file_type: String,
    pub masked_content: String,
}

#[tauri::command]
pub async fn export_zip(
    app: tauri::AppHandle,
    items: Vec<ZipItemInput>,
) -> Result<(), String> {
    let file_path = app
        .dialog()
        .file()
        .set_file_name("vault_export.zip")
        .add_filter("ZIP archive", &["zip"])
        .blocking_save_file();

    let file_path = match file_path {
        Some(path) => path,
        None => return Ok(()), // User cancelled
    };

    let file =
        std::fs::File::create(file_path.as_path().unwrap()).map_err(|e| e.to_string())?;
    let mut zip_writer = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    for item in &items {
        let ext = &item.file_type;
        let entry_name = format!(
            "{}_masked.{}",
            item.name.trim_end_matches(&format!(".{}", ext)),
            ext
        );
        zip_writer
            .start_file(&entry_name, options)
            .map_err(|e| e.to_string())?;
        zip_writer
            .write_all(item.masked_content.as_bytes())
            .map_err(|e| e.to_string())?;
    }

    zip_writer.finish().map_err(|e| e.to_string())?;

    Ok(())
}

// --- Session CRUD commands ---

#[derive(Serialize)]
pub struct SessionSummary {
    pub id: i64,
    pub name: String,
    pub status: String,
    pub item_count: i64,
    pub entry_count: i64,
    pub created_at: String,
    pub updated_at: String,
    pub mcp_shared: bool,
}

#[derive(Serialize)]
pub struct SessionEntryOutput {
    pub id: i64,
    pub entry_type: String,
    pub source_item_id: Option<i64>,
    pub raw_content: String,
    pub decoded_content: Option<String>,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct SessionItemOutput {
    pub id: i64,
    pub name: String,
    pub file_type: String,
    pub entity_count: i64,
    pub added_at: String,
}

#[derive(Serialize)]
pub struct SessionDetail {
    pub id: i64,
    pub name: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub mcp_shared: bool,
    pub entries: Vec<SessionEntryOutput>,
    pub items: Vec<SessionItemOutput>,
}

#[tauri::command]
pub fn create_session(db: State<'_, DbState>, name: String) -> Result<i64, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO sessions (name) VALUES (?1)",
        rusqlite::params![name],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn list_sessions(db: State<'_, DbState>) -> Result<Vec<SessionSummary>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.name, s.status,
                    (SELECT COUNT(*) FROM session_items si WHERE si.session_id = s.id) AS item_count,
                    (SELECT COUNT(*) FROM session_entries se WHERE se.session_id = s.id) AS entry_count,
                    s.created_at, s.updated_at, s.mcp_shared
             FROM sessions s
             ORDER BY s.updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            let mcp_shared_int: i64 = row.get(7)?;
            Ok(SessionSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                status: row.get(2)?,
                item_count: row.get(3)?,
                entry_count: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                mcp_shared: mcp_shared_int != 0,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut sessions = Vec::new();
    for row in rows {
        sessions.push(row.map_err(|e| e.to_string())?);
    }
    Ok(sessions)
}

#[tauri::command]
pub fn get_session(db: State<'_, DbState>, session_id: i64) -> Result<SessionDetail, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let session = conn
        .query_row(
            "SELECT id, name, status, created_at, updated_at, mcp_shared FROM sessions WHERE id = ?1",
            rusqlite::params![session_id],
            |row| {
                let mcp_shared_int: i64 = row.get(5)?;
                Ok(SessionDetail {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    status: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                    mcp_shared: mcp_shared_int != 0,
                    entries: Vec::new(),
                    items: Vec::new(),
                })
            },
        )
        .map_err(|e| e.to_string())?;

    // Load entries
    let mut entry_stmt = conn
        .prepare(
            "SELECT id, entry_type, source_item_id, raw_content, decoded_content, created_at
             FROM session_entries
             WHERE session_id = ?1
             ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;

    let entries = entry_stmt
        .query_map(rusqlite::params![session_id], |row| {
            let encrypted_raw: String = row.get(3)?;
            let encrypted_decoded: Option<String> = row.get(4)?;

            let raw_content = if crypto::is_key_set() {
                crypto::decrypt(&encrypted_raw).unwrap_or(encrypted_raw)
            } else {
                encrypted_raw
            };

            let decoded_content = encrypted_decoded.map(|enc| {
                if crypto::is_key_set() {
                    crypto::decrypt(&enc).unwrap_or(enc)
                } else {
                    enc
                }
            });

            Ok(SessionEntryOutput {
                id: row.get(0)?,
                entry_type: row.get(1)?,
                source_item_id: row.get(2)?,
                raw_content,
                decoded_content,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut entry_list = Vec::new();
    for entry in entries {
        entry_list.push(entry.map_err(|e| e.to_string())?);
    }

    // Load items
    let mut item_stmt = conn
        .prepare(
            "SELECT i.id, i.name, i.file_type, COUNT(e.id) AS entity_count, si.added_at
             FROM session_items si
             JOIN items i ON i.id = si.item_id
             LEFT JOIN entities e ON e.item_id = i.id
             WHERE si.session_id = ?1
             GROUP BY i.id
             ORDER BY si.added_at ASC",
        )
        .map_err(|e| e.to_string())?;

    let items = item_stmt
        .query_map(rusqlite::params![session_id], |row| {
            Ok(SessionItemOutput {
                id: row.get(0)?,
                name: row.get(1)?,
                file_type: row.get(2)?,
                entity_count: row.get(3)?,
                added_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut item_list = Vec::new();
    for item in items {
        item_list.push(item.map_err(|e| e.to_string())?);
    }

    Ok(SessionDetail {
        entries: entry_list,
        items: item_list,
        ..session
    })
}

// --- Session update/archive/delete commands ---

#[tauri::command]
pub fn update_session(db: State<'_, DbState>, session_id: i64, name: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let updated = conn
        .execute(
            "UPDATE sessions SET name = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![name, session_id],
        )
        .map_err(|e| e.to_string())?;
    if updated == 0 {
        return Err("Session not found.".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn toggle_session_mcp_shared(
    db: State<'_, DbState>,
    session_id: i64,
    shared: bool,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let updated = conn
        .execute(
            "UPDATE sessions SET mcp_shared = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![shared as i64, session_id],
        )
        .map_err(|e| e.to_string())?;
    if updated == 0 {
        return Err("Session not found.".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn archive_session(db: State<'_, DbState>, session_id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let updated = conn
        .execute(
            "UPDATE sessions SET status = 'archived', updated_at = datetime('now') WHERE id = ?1",
            rusqlite::params![session_id],
        )
        .map_err(|e| e.to_string())?;
    if updated == 0 {
        return Err("Session not found.".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn unarchive_session(db: State<'_, DbState>, session_id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let updated = conn
        .execute(
            "UPDATE sessions SET status = 'active', updated_at = datetime('now') WHERE id = ?1",
            rusqlite::params![session_id],
        )
        .map_err(|e| e.to_string())?;
    if updated == 0 {
        return Err("Session not found.".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn delete_session(db: State<'_, DbState>, session_id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let deleted = conn
        .execute(
            "DELETE FROM sessions WHERE id = ?1",
            rusqlite::params![session_id],
        )
        .map_err(|e| e.to_string())?;
    if deleted == 0 {
        return Err("Session not found.".to_string());
    }
    Ok(())
}

// --- Session item management commands ---

#[derive(Serialize)]
pub struct SessionEntityOutput {
    pub entity_type: String,
    pub original_value: String,
    pub token: String,
}

#[tauri::command]
pub fn add_item_to_session(db: State<'_, DbState>, session_id: i64, item_id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO session_items (session_id, item_id) VALUES (?1, ?2)",
        rusqlite::params![session_id, item_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE sessions SET updated_at = datetime('now') WHERE id = ?1",
        rusqlite::params![session_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn remove_item_from_session(db: State<'_, DbState>, session_id: i64, item_id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let deleted = conn
        .execute(
            "DELETE FROM session_items WHERE session_id = ?1 AND item_id = ?2",
            rusqlite::params![session_id, item_id],
        )
        .map_err(|e| e.to_string())?;
    if deleted == 0 {
        return Err("Item not linked to this session.".to_string());
    }
    conn.execute(
        "UPDATE sessions SET updated_at = datetime('now') WHERE id = ?1",
        rusqlite::params![session_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_session_entities(db: State<'_, DbState>, session_id: i64) -> Result<Vec<SessionEntityOutput>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT e.entity_type, e.original_value, e.token
             FROM entities e
             JOIN session_items si ON si.item_id = e.item_id
             WHERE si.session_id = ?1
             ORDER BY e.id ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(rusqlite::params![session_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    // Deduplicate by (entity_type, decrypted_original_value), keeping the first token
    let mut seen: HashMap<(String, String), String> = HashMap::new();
    let mut order: Vec<(String, String)> = Vec::new();

    for row in rows {
        let (entity_type, encrypted_value, token) = row.map_err(|e| e.to_string())?;

        let original_value = if crypto::is_key_set() {
            crypto::decrypt(&encrypted_value).unwrap_or(encrypted_value)
        } else {
            encrypted_value
        };

        let key = (entity_type.clone(), original_value.clone());
        if !seen.contains_key(&key) {
            seen.insert(key.clone(), token);
            order.push(key);
        }
    }

    let result: Vec<SessionEntityOutput> = order
        .into_iter()
        .map(|key| {
            let token = seen.remove(&key).unwrap();
            SessionEntityOutput {
                entity_type: key.0,
                original_value: key.1,
                token,
            }
        })
        .collect();

    Ok(result)
}

// --- Session entry commands ---

#[tauri::command]
pub fn add_session_entry(
    db: State<'_, DbState>,
    session_id: i64,
    entry_type: String,
    raw_content: String,
    source_item_id: Option<i64>,
) -> Result<i64, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let encrypted_content = if crypto::is_key_set() {
        crypto::encrypt(&raw_content)?
    } else {
        raw_content
    };

    conn.execute(
        "INSERT INTO session_entries (session_id, entry_type, source_item_id, raw_content) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![session_id, entry_type, source_item_id, encrypted_content],
    )
    .map_err(|e| e.to_string())?;

    let entry_id = conn.last_insert_rowid();

    conn.execute(
        "UPDATE sessions SET updated_at = datetime('now') WHERE id = ?1",
        rusqlite::params![session_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(entry_id)
}

#[tauri::command]
pub fn update_session_entry_content(
    db: State<'_, DbState>,
    entry_id: i64,
    raw_content: String,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let encrypted_content = if crypto::is_key_set() {
        crypto::encrypt(&raw_content)?
    } else {
        raw_content
    };

    conn.execute(
        "UPDATE session_entries SET raw_content = ?1 WHERE id = ?2",
        rusqlite::params![encrypted_content, entry_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn decode_session_entry(
    db: State<'_, DbState>,
    session_id: i64,
    entry_id: i64,
) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    // 1) Load all entities across all session items
    let mut stmt = conn
        .prepare(
            "SELECT e.token, e.original_value
             FROM entities e
             JOIN session_items si ON si.item_id = e.item_id
             WHERE si.session_id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(rusqlite::params![session_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;

    // 2) Build token → decrypted_original_value map
    let mut token_map: HashMap<String, String> = HashMap::new();
    for row in rows {
        let (token, encrypted_value) = row.map_err(|e| e.to_string())?;
        let original_value = if crypto::is_key_set() {
            crypto::decrypt(&encrypted_value).unwrap_or(encrypted_value)
        } else {
            encrypted_value
        };
        // Keep the first mapping if duplicates exist
        token_map.entry(token).or_insert(original_value);
    }

    // 3) Read the entry's raw_content and decrypt it
    let encrypted_raw: String = conn
        .query_row(
            "SELECT raw_content FROM session_entries WHERE id = ?1 AND session_id = ?2",
            rusqlite::params![entry_id, session_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let raw_content = if crypto::is_key_set() {
        crypto::decrypt(&encrypted_raw).unwrap_or(encrypted_raw)
    } else {
        encrypted_raw
    };

    // 4) Replace all [[TYPE:HASH]] and [[TYPE_N]] tokens with original values
    let re = Regex::new(r"\[\[(\w+)[_:](\w+)\]\]").map_err(|e| e.to_string())?;
    let decoded = re.replace_all(&raw_content, |caps: &regex::Captures| {
        let full_match = caps.get(0).unwrap().as_str();
        // Look up the full token in the map; leave as-is if not found
        token_map.get(full_match).cloned().unwrap_or_else(|| full_match.to_string())
    });

    let decoded_text = decoded.to_string();

    // 5) Encrypt the decoded result and store in decoded_content column
    let encrypted_decoded = if crypto::is_key_set() {
        crypto::encrypt(&decoded_text)?
    } else {
        decoded_text.clone()
    };

    conn.execute(
        "UPDATE session_entries SET decoded_content = ?1 WHERE id = ?2",
        rusqlite::params![encrypted_decoded, entry_id],
    )
    .map_err(|e| e.to_string())?;

    // 6) Return the decoded text
    Ok(decoded_text)
}

// --- Hash Mapping commands for LLM-based masking ---

#[derive(Deserialize)]
pub struct HashMappingInput {
    pub hash: String,
    pub original: String,
    pub entity_type: String,
}

#[derive(Serialize)]
pub struct HashMappingOutput {
    pub id: i64,
    pub hash: String,
    pub original: String,
    pub entity_type: String,
}

#[tauri::command]
pub fn save_hash_mappings(
    db: State<'_, DbState>,
    item_id: i64,
    mappings: Vec<HashMappingInput>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    
    for mapping in &mappings {
        conn.execute(
            "INSERT OR REPLACE INTO hash_mappings (item_id, hash, original, entity_type) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![
                item_id,
                mapping.hash,
                mapping.original,
                mapping.entity_type,
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

#[tauri::command]
pub fn get_hash_mappings(
    db: State<'_, DbState>,
    item_id: i64,
) -> Result<Vec<HashMappingOutput>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    
    let mut stmt = conn
        .prepare(
            "SELECT id, hash, original, entity_type FROM hash_mappings WHERE item_id = ?1 ORDER BY id",
        )
        .map_err(|e| e.to_string())?;
    
    let mappings = stmt
        .query_map(rusqlite::params![item_id], |row| {
            Ok(HashMappingOutput {
                id: row.get(0)?,
                hash: row.get(1)?,
                original: row.get(2)?,
                entity_type: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    
    let mut result = Vec::new();
    for mapping in mappings {
        result.push(mapping.map_err(|e| e.to_string())?);
    }

    Ok(result)
}

// --- Token namespace reconciliation ---

#[tauri::command]
pub fn reconcile_item_tokens(
    db: State<'_, DbState>,
    session_id: i64,
    item_id: i64,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    conn.execute_batch("BEGIN TRANSACTION;")
        .map_err(|e| e.to_string())?;

    // 1) Load all entities from OTHER items in the session
    let mut stmt = conn
        .prepare(
            "SELECT e.entity_type, e.original_value, e.token
             FROM entities e
             JOIN session_items si ON si.item_id = e.item_id
             WHERE si.session_id = ?1 AND si.item_id != ?2
             ORDER BY e.id ASC",
        )
        .map_err(|e| {
            let _ = conn.execute_batch("ROLLBACK;");
            e.to_string()
        })?;

    let rows = stmt
        .query_map(rusqlite::params![session_id, item_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| {
            let _ = conn.execute_batch("ROLLBACK;");
            e.to_string()
        })?;

    // Build (entity_type, decrypted_value) → existing_token map
    // Also collect all existing session tokens into a HashSet
    let mut session_map: HashMap<(String, String), String> = HashMap::new();
    let mut existing_tokens: HashSet<String> = HashSet::new();

    for row in rows {
        let (entity_type, encrypted_value, token) = row.map_err(|e| {
            let _ = conn.execute_batch("ROLLBACK;");
            e.to_string()
        })?;

        let original_value = if crypto::is_key_set() {
            crypto::decrypt(&encrypted_value).unwrap_or(encrypted_value)
        } else {
            encrypted_value
        };

        existing_tokens.insert(token.clone());
        let key = (entity_type, original_value);
        session_map.entry(key).or_insert(token);
    }

    // 2) Load the new item's entities
    let mut item_stmt = conn
        .prepare(
            "SELECT entity_type, original_value, token, span_start, span_end
             FROM entities WHERE item_id = ?1 ORDER BY id ASC",
        )
        .map_err(|e| {
            let _ = conn.execute_batch("ROLLBACK;");
            e.to_string()
        })?;

    let item_rows = item_stmt
        .query_map(rusqlite::params![item_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, i64>(4)?,
            ))
        })
        .map_err(|e| {
            let _ = conn.execute_batch("ROLLBACK;");
            e.to_string()
        })?;

    struct EntityRow {
        entity_type: String,
        decrypted_value: String,
        old_token: String,
        span_start: i64,
        span_end: i64,
    }

    let mut item_entities: Vec<EntityRow> = Vec::new();
    for row in item_rows {
        let (entity_type, encrypted_value, token, span_start, span_end) = row.map_err(|e| {
            let _ = conn.execute_batch("ROLLBACK;");
            e.to_string()
        })?;

        let original_value = if crypto::is_key_set() {
            crypto::decrypt(&encrypted_value).unwrap_or(encrypted_value)
        } else {
            encrypted_value
        };

        item_entities.push(EntityRow {
            entity_type,
            decrypted_value: original_value,
            old_token: token,
            span_start,
            span_end,
        });
    }

    // 3) For each entity, determine new token
    let mut rng = rand::thread_rng();
    let mut token_replacements: Vec<(String, String)> = Vec::new();
    let mut new_entities: Vec<(String, String, String, i64, i64)> = Vec::new();

    for entity in &item_entities {
        let key = (entity.entity_type.clone(), entity.decrypted_value.clone());

        let new_token = if let Some(existing_token) = session_map.get(&key) {
            existing_token.clone()
        } else {
            // Generate a new [[TYPE:HASH]] token that doesn't conflict
            let new_tok = loop {
                let random_bytes: [u8; 4] = rng.gen();
                let hash = format!(
                    "{:02x}{:02x}{:02x}{:02x}",
                    random_bytes[0], random_bytes[1], random_bytes[2], random_bytes[3]
                );
                let candidate = format!("[[{}:{}]]", entity.entity_type, hash);
                if !existing_tokens.contains(&candidate) {
                    existing_tokens.insert(candidate.clone());
                    break candidate;
                }
            };
            // Register so subsequent entities with same (type, value) get the same token
            session_map.insert(key, new_tok.clone());
            new_tok
        };

        if new_token != entity.old_token {
            token_replacements.push((entity.old_token.clone(), new_token.clone()));
        }

        new_entities.push((
            entity.entity_type.clone(),
            entity.decrypted_value.clone(),
            new_token,
            entity.span_start,
            entity.span_end,
        ));
    }

    // 4) Load and rewrite masked_content
    let masked_content: String = conn
        .query_row(
            "SELECT masked_content FROM items WHERE id = ?1",
            rusqlite::params![item_id],
            |row| row.get(0),
        )
        .map_err(|e| {
            let _ = conn.execute_batch("ROLLBACK;");
            e.to_string()
        })?;

    let mut new_masked = masked_content;
    // Sort by old_token length descending to avoid partial matches
    token_replacements.sort_by(|a, b| b.0.len().cmp(&a.0.len()));
    for (old_tok, new_tok) in &token_replacements {
        new_masked = new_masked.replace(old_tok, new_tok);
    }

    // 5) Update items.masked_content
    conn.execute(
        "UPDATE items SET masked_content = ?1 WHERE id = ?2",
        rusqlite::params![new_masked, item_id],
    )
    .map_err(|e| {
        let _ = conn.execute_batch("ROLLBACK;");
        e.to_string()
    })?;

    // 6) Delete old entities and hash_mappings, re-insert with new tokens
    conn.execute(
        "DELETE FROM entities WHERE item_id = ?1",
        rusqlite::params![item_id],
    )
    .map_err(|e| {
        let _ = conn.execute_batch("ROLLBACK;");
        e.to_string()
    })?;

    conn.execute(
        "DELETE FROM hash_mappings WHERE item_id = ?1",
        rusqlite::params![item_id],
    )
    .map_err(|e| {
        let _ = conn.execute_batch("ROLLBACK;");
        e.to_string()
    })?;

    let mut seen_hashes = HashSet::new();
    for (entity_type, decrypted_value, token, span_start, span_end) in &new_entities {
        let encrypted_value = if crypto::is_key_set() {
            crypto::encrypt(decrypted_value).map_err(|e| {
                let _ = conn.execute_batch("ROLLBACK;");
                e
            })?
        } else {
            decrypted_value.clone()
        };

        conn.execute(
            "INSERT INTO entities (item_id, entity_type, original_value, token, span_start, span_end) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![item_id, entity_type, encrypted_value, token, span_start, span_end],
        )
        .map_err(|e| {
            let _ = conn.execute_batch("ROLLBACK;");
            e.to_string()
        })?;

        if let Some(hash) = extract_hash_from_token(token) {
            if seen_hashes.insert(hash.clone()) {
                conn.execute(
                    "INSERT INTO hash_mappings (item_id, hash, original, entity_type) VALUES (?1, ?2, ?3, ?4)",
                    rusqlite::params![item_id, hash, decrypted_value, entity_type],
                )
                .map_err(|e| {
                    let _ = conn.execute_batch("ROLLBACK;");
                    e.to_string()
                })?;
            }
        }
    }

    conn.execute_batch("COMMIT;")
        .map_err(|e| e.to_string())?;

    Ok(())
}
