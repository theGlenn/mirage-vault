use std::path::PathBuf;
use xybrid_sdk::RegistryClient;

/// The default LLM model used for PII detection.
pub const DEFAULT_MODEL_ID: &str = "ministral-3-3b";

/// Searches known locations for a model directory containing model_metadata.json.
///
/// Priority order:
/// 1. SDK extraction cache (via RegistryClient)
/// 2. Direct check of ~/.xybrid/cache/extracted/{model_id}/
/// 3. Dev fixture paths (for development builds)
pub fn find_model_dir(model_id: &str) -> Option<PathBuf> {
    eprintln!("[xybrid::find_model_dir] Looking for model '{}'", model_id);

    // 1. Primary: Use RegistryClient's extraction_dir (SDK way)
    if let Ok(client) = RegistryClient::default_client() {
        if client.is_extracted(model_id) {
            let dir = client.extraction_dir(model_id);
            eprintln!(
                "[xybrid::find_model_dir] Found via SDK: {}",
                dir.display()
            );
            return Some(dir);
        }
    }
    
    eprintln!("[xybrid::find_model_dir] Not found via SDK, checking other locations...");
    // 2. Fallback: Direct check of extracted directory
    let home = dirs::home_dir().unwrap_or_default();
    let extracted_path = home
        .join(".xybrid")
        .join("cache")
        .join("extracted")
        .join(model_id);
    if extracted_path.join("model_metadata.json").exists() {
        eprintln!(
            "[xybrid::find_model_dir] Found in extracted cache: {}",
            extracted_path.display()
        );
        return Some(extracted_path);
    }

    // 3. Dev fixtures (for development builds)
    let dev_candidates = [
        PathBuf::from("../../fixtures/models").join(model_id),
        PathBuf::from("../../repos/xybrid/integration-tests/fixtures/models").join(model_id),
    ];
    for path in &dev_candidates {
        if path.join("model_metadata.json").exists() {
            eprintln!(
                "[xybrid::find_model_dir] Found in dev fixtures: {}",
                path.display()
            );
            return Some(path.clone());
        }
    }

    eprintln!(
        "[xybrid::find_model_dir] Model '{}' NOT FOUND anywhere",
        model_id
    );
    None
}
