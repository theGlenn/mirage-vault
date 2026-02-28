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
        );",
    )?;

    // Enable foreign key enforcement
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;

    Ok(conn)
}
