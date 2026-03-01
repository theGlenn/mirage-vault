use rusqlite::Connection;
use std::sync::Mutex;
use tauri::AppHandle;
use tauri::Manager;

pub struct DbState(pub Mutex<Connection>);

pub fn init_db(app: &AppHandle) -> Result<Connection, Box<dyn std::error::Error>> {
    let app_data_dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&app_data_dir)?;
    let db_path = app_data_dir.join("vault.db");
    let conn = Connection::open(db_path)?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            file_type TEXT NOT NULL,
            raw_content TEXT NOT NULL,
            masked_content TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS entities (
            id INTEGER PRIMARY KEY,
            item_id INTEGER NOT NULL,
            entity_type TEXT NOT NULL,
            original_value TEXT NOT NULL,
            token TEXT NOT NULL,
            span_start INTEGER NOT NULL,
            span_end INTEGER NOT NULL,
            FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS hash_mappings (
            id INTEGER PRIMARY KEY,
            item_id INTEGER NOT NULL,
            hash TEXT NOT NULL,
            original TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
            UNIQUE(item_id, hash)
        );
        CREATE INDEX IF NOT EXISTS idx_hash_mappings_item ON hash_mappings(item_id);
        CREATE INDEX IF NOT EXISTS idx_hash_mappings_hash ON hash_mappings(hash);

        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS session_items (
            id INTEGER PRIMARY KEY,
            session_id INTEGER NOT NULL,
            item_id INTEGER NOT NULL,
            added_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
            FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
            UNIQUE(session_id, item_id)
        );
        CREATE TABLE IF NOT EXISTS session_entries (
            id INTEGER PRIMARY KEY,
            session_id INTEGER NOT NULL,
            entry_type TEXT NOT NULL,
            source_item_id INTEGER,
            raw_content TEXT NOT NULL,
            decoded_content TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
            FOREIGN KEY (source_item_id) REFERENCES items(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_session_items_session ON session_items(session_id);
        CREATE INDEX IF NOT EXISTS idx_session_items_item ON session_items(item_id);
        CREATE INDEX IF NOT EXISTS idx_session_entries_session ON session_entries(session_id);",
    )?;

    // Enable foreign key enforcement
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;

    // Idempotent migrations: add columns for PDF support
    // ALTER TABLE ADD COLUMN errors if the column already exists, so we catch and ignore that.
    let migrations = [
        "ALTER TABLE items ADD COLUMN warning TEXT",
        "ALTER TABLE items ADD COLUMN raw_pdf_bytes BLOB",
        "ALTER TABLE items ADD COLUMN status TEXT NOT NULL DEFAULT 'done'",
        "ALTER TABLE items ADD COLUMN session_id INTEGER",
    ];
    for sql in &migrations {
        match conn.execute_batch(sql) {
            Ok(_) => {}
            Err(e) if e.to_string().contains("duplicate column name") => {}
            Err(e) => return Err(e.into()),
        }
    }

    Ok(conn)
}
