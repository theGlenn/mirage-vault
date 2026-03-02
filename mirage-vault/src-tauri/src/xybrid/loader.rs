use xybrid_core::execution::{ModelMetadata, TemplateExecutor};

use crate::xybrid::discovery::{find_model_dir, DEFAULT_MODEL_ID};
use crate::xybrid::state::XybridLlmState;

/// Loads the default LLM model (ministral-3-3b) into the executor.
/// Returns the loaded model_id on success.
pub fn load_model(llm: &mut XybridLlmState) -> Result<String, String> {
    load_model_by_id(llm, DEFAULT_MODEL_ID)
}

/// Loads a specific LLM model by ID into the executor.
/// Returns the loaded model_id on success.
pub fn load_model_by_id(llm: &mut XybridLlmState, model_id: &str) -> Result<String, String> {
    eprintln!(
        "[xybrid::load_model_by_id] Loading model '{}'",
        model_id
    );

    let model_dir = find_model_dir(model_id)
        .ok_or_else(|| format!("Model '{}' not found. Download it first.", model_id))?;

    let metadata_path = model_dir.join("model_metadata.json");
    let metadata_content =
        std::fs::read_to_string(&metadata_path).map_err(|e| {
            format!(
                "Failed to read metadata at {}: {}",
                metadata_path.display(),
                e
            )
        })?;
    let metadata: ModelMetadata =
        serde_json::from_str(&metadata_content).map_err(|e| {
            format!("Failed to parse model metadata: {}", e)
        })?;

    let loaded_id = metadata.model_id.clone();
    eprintln!(
        "[xybrid::load_model_by_id] Loaded {} v{} from {}",
        metadata.model_id,
        metadata.version,
        model_dir.display()
    );

    let executor = TemplateExecutor::with_base_path(model_dir.to_str().unwrap());
    llm.executor = Some(executor);
    llm.metadata = Some(metadata);
    llm.model_dir = Some(model_dir.to_string_lossy().to_string());

    Ok(loaded_id)
}
