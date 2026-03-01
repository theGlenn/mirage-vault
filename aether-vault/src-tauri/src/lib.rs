mod commands;
mod crypto;
mod db;

use std::sync::Mutex;
use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let conn = db::init_db(&app.handle())?;
            app.manage(db::DbState(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::init_encryption,
            commands::is_encryption_initialized,
            commands::clear_encryption_key,
            commands::save_item,
            commands::list_items,
            commands::get_item,
            commands::delete_item,
            commands::read_file_text,
            commands::read_file_bytes,
            commands::extract_pdf_text,
            commands::export_masked_pdf,
            commands::export_file,
            commands::export_zip,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
