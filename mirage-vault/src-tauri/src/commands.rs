use crate::crypto;
use crate::db::DbState;
use pdfium_render::prelude::*;
use serde::{Deserialize, Serialize};
use std::io::{Cursor, Write};
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

// --- Key Management Commands ---

#[tauri::command]
pub fn init_encryption(passphrase: String) -> Result<(), String> {
    crypto::init_with_passphrase(&passphrase)
}

#[tauri::command]
pub fn is_encryption_initialized() -> bool {
    crypto::is_key_set()
}

#[tauri::command]
pub fn clear_encryption_key() {
    crypto::clear_key();
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
) -> Result<i64, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    // Encrypt raw content before storing
    let encrypted_content = if crypto::is_key_set() {
        crypto::encrypt(&raw_content)?
    } else {
        // If encryption not initialized, store as plaintext (for development)
        raw_content
    };

    conn.execute(
        "INSERT INTO items (name, file_type, raw_content, masked_content, warning, raw_pdf_bytes) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![name, file_type, encrypted_content, masked_content, warning, raw_pdf_bytes],
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
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    conn.execute_batch("BEGIN TRANSACTION;")
        .map_err(|e| e.to_string())?;

    let updated = conn
        .execute(
            "UPDATE items SET masked_content = ?1 WHERE id = ?2",
            rusqlite::params![masked_content, item_id],
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
            "SELECT i.id, i.name, i.file_type, COUNT(e.id) AS entity_count, i.created_at, i.warning
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
