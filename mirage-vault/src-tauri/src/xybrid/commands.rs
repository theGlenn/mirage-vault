use serde::Serialize;
use tauri::Emitter;
use xybrid_sdk::RegistryClient;

use crate::xybrid::discovery::{find_model_dir, DEFAULT_MODEL_ID};
use crate::xybrid::inference;
use crate::xybrid::loader;
use crate::xybrid::state::SharedXybridLlmState;

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

#[derive(Clone, Serialize)]
pub struct XybridModelStatus {
    pub model_id: String,
    pub status: String, // "ready" | "needed" | "loading"
}

#[derive(Clone, Serialize)]
pub struct XybridDownloadProgress {
    pub model_id: String,
    pub progress: f32,
}

#[derive(Clone, Serialize)]
pub struct XybridDownloadComplete {
    pub model_id: String,
}

#[derive(Clone, Serialize)]
pub struct XybridDownloadError {
    pub model_id: String,
    pub error: String,
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Returns true if the LLM model is loaded and ready for inference.
#[tauri::command]
pub fn xybrid_is_ready(
    llm_state: tauri::State<'_, SharedXybridLlmState>,
) -> Result<bool, String> {
    let llm = llm_state.lock().map_err(|e| e.to_string())?;
    Ok(llm.executor.is_some() && llm.metadata.is_some())
}

/// Checks whether the default model (ministral-3-3b) is downloaded on disk.
#[tauri::command]
pub fn xybrid_check_model() -> Result<XybridModelStatus, String> {
    let found = find_model_dir(DEFAULT_MODEL_ID).is_some();
    Ok(XybridModelStatus {
        model_id: DEFAULT_MODEL_ID.to_string(),
        status: if found {
            "ready".to_string()
        } else {
            "needed".to_string()
        },
    })
}

/// Downloads the default model from the Xybrid registry.
///
/// Emits Tauri events for progress tracking:
/// - `xybrid-download-progress` — { model_id, progress: 0.0..1.0 }
/// - `xybrid-download-complete` — { model_id }
/// - `xybrid-download-error`    — { model_id, error }
#[tauri::command]
pub async fn xybrid_download_model(app: tauri::AppHandle) -> Result<(), String> {
    let model_id = DEFAULT_MODEL_ID.to_string();

    // Skip if already downloaded
    if find_model_dir(&model_id).is_some() {
        let _ = app.emit(
            "xybrid-download-complete",
            XybridDownloadComplete {
                model_id: model_id.clone(),
            },
        );
        return Ok(());
    }

    let app_handle = app.clone();
    let model_id_clone = model_id.clone();

    tokio::task::spawn_blocking(move || {
        let client = RegistryClient::default_client().map_err(|e| {
            let _ = app_handle.emit(
                "xybrid-download-error",
                XybridDownloadError {
                    model_id: model_id_clone.clone(),
                    error: format!("Registry client init failed: {}", e),
                },
            );
            format!("Registry client init failed: {}", e)
        })?;

        let progress_model_id = model_id_clone.clone();
        let progress_app = app_handle.clone();

        let result = client.fetch_extracted(&model_id_clone, None, move |progress| {
            let _ = progress_app.emit(
                "xybrid-download-progress",
                XybridDownloadProgress {
                    model_id: progress_model_id.clone(),
                    progress,
                },
            );
        });

        match result {
            Ok(path) => {
                eprintln!(
                    "[xybrid] Downloaded {} to {}",
                    model_id_clone,
                    path.display()
                );
                let _ = app_handle.emit(
                    "xybrid-download-complete",
                    XybridDownloadComplete {
                        model_id: model_id_clone,
                    },
                );
                Ok(())
            }
            Err(e) => {
                let error_msg = format!("Download failed for {}: {}", model_id_clone, e);
                let _ = app_handle.emit(
                    "xybrid-download-error",
                    XybridDownloadError {
                        model_id: model_id_clone,
                        error: error_msg.clone(),
                    },
                );
                Err(error_msg)
            }
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Loads the default model (ministral-3-3b) into memory so it's ready for inference.
#[tauri::command]
pub fn xybrid_load_model(
    llm_state: tauri::State<'_, SharedXybridLlmState>,
) -> Result<String, String> {
    let mut llm = llm_state.lock().map_err(|e| e.to_string())?;
    loader::load_model(&mut llm)
}

/// Runs a one-shot LLM text generation.
///
/// This is the main inference command — the frontend constructs the prompt
/// (the same prompts used with Ollama) and gets back the raw LLM response.
///
/// The model is auto-loaded on first call if not already in memory.
#[tauri::command]
pub async fn xybrid_generate(
    prompt: String,
    system_prompt: Option<String>,
    temperature: Option<f64>,
    max_tokens: Option<u32>,
    llm_state: tauri::State<'_, SharedXybridLlmState>,
) -> Result<String, String> {
    let llm = llm_state.inner().clone();

    // Auto-load model if not yet loaded
    {
        let mut llm_guard = llm.lock().map_err(|e| e.to_string())?;
        if llm_guard.executor.is_none() || llm_guard.metadata.is_none() {
            loader::load_model(&mut llm_guard)?;
        }
    }

    // Run inference on a blocking thread to avoid blocking the async runtime
    tokio::task::spawn_blocking(move || {
        inference::generate(
            &llm,
            &prompt,
            system_prompt.as_deref(),
            temperature,
            max_tokens,
        )
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}
