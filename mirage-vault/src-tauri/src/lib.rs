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
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .setup(|app| {
            let conn = db::init_db(&app.handle())?;
            app.manage(db::DbState(Mutex::new(conn)));
            app.manage(commands::McpServerState {
                child: Mutex::new(None),
                passphrase: Mutex::new(None),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::init_encryption,
            commands::is_encryption_initialized,
            commands::clear_encryption_key,
            commands::save_item,
            commands::update_item_masking,
            commands::list_items,
            commands::get_item,
            commands::delete_item,
            commands::read_file_text,
            commands::read_file_bytes,
            commands::extract_pdf_text,
            commands::export_masked_pdf,
            commands::export_file,
            commands::export_zip,
            commands::save_hash_mappings,
            commands::get_hash_mappings,
            commands::create_session,
            commands::list_sessions,
            commands::get_session,
            commands::update_session,
            commands::toggle_session_mcp_shared,
            commands::archive_session,
            commands::unarchive_session,
            commands::delete_session,
            commands::add_item_to_session,
            commands::remove_item_from_session,
            commands::get_session_entities,
            commands::add_session_entry,
            commands::update_session_entry_content,
            commands::decode_session_entry,
            commands::reconcile_item_tokens,
            commands::start_mcp_server,
            commands::stop_mcp_server,
            commands::get_mcp_server_status,
            commands::export_mcpb,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                // Kill MCP server process on app exit
                if let Some(mcp_state) = app_handle.try_state::<commands::McpServerState>() {
                    commands::stop_mcp_process(&mcp_state);
                }
            }
        });
}
