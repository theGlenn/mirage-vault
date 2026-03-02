use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use xybrid_core::execution::{ModelMetadata, TemplateExecutor};

/// Holds the embedded LLM executor used for PII detection and masking.
///
/// Unlike a chat assistant, we don't maintain conversation context here —
/// each PII detection call is a one-shot inference with its own system prompt.
pub struct XybridLlmState {
    pub executor: Option<TemplateExecutor>,
    pub metadata: Option<ModelMetadata>,
    pub model_dir: Option<String>,
    pub cancel_flag: Arc<AtomicBool>,
}

impl Default for XybridLlmState {
    fn default() -> Self {
        Self {
            executor: None,
            metadata: None,
            model_dir: None,
            cancel_flag: Arc::new(AtomicBool::new(false)),
        }
    }
}

pub type SharedXybridLlmState = Arc<Mutex<XybridLlmState>>;
