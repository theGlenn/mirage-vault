use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use xybrid_core::conversation::ConversationContext;
use xybrid_core::ir::{Envelope, EnvelopeKind, MessageRole};

use crate::xybrid::state::XybridLlmState;

/// Runs a one-shot text generation against the loaded LLM.
///
/// This is the core inference function used by all PII detection commands.
/// Each call gets a fresh ConversationContext (no memory between calls) — the
/// frontend constructs the prompt and system_prompt, and this function returns
/// the raw LLM response text for the frontend to parse.
///
/// Parameters:
/// - `prompt`: The user-facing prompt text (e.g., "Find PII in: ...")
/// - `system_prompt`: Optional system instructions for the model
/// - `temperature`: LLM temperature (default 0.1 for deterministic PII detection)
/// - `max_tokens`: Maximum tokens to generate (default 2000)
pub fn generate(
    llm: &Arc<Mutex<XybridLlmState>>,
    prompt: &str,
    system_prompt: Option<&str>,
    temperature: Option<f64>,
    max_tokens: Option<u32>,
) -> Result<String, String> {
    let mut llm_guard = llm.lock().map_err(|e| e.to_string())?;

    let metadata = llm_guard
        .metadata
        .clone()
        .ok_or("Model metadata not loaded")?;

    let executor = llm_guard
        .executor
        .as_mut()
        .ok_or("Model executor not loaded")?;

    // Build envelope metadata with inference parameters
    let mut envelope_metadata = HashMap::new();
    let temp = temperature.unwrap_or(0.1);
    let tokens = max_tokens.unwrap_or(2000);
    envelope_metadata.insert("temperature".to_string(), temp.to_string());
    envelope_metadata.insert("max_tokens".to_string(), tokens.to_string());

    let input = Envelope {
        kind: EnvelopeKind::Text(prompt.to_string()),
        metadata: envelope_metadata,
    }
    .with_role(MessageRole::User);

    // Use ConversationContext if we have a system prompt, so the model
    // properly separates system instructions from user input.
    let output = if let Some(sys) = system_prompt {
        let context = ConversationContext::new().with_system(
            Envelope::new(EnvelopeKind::Text(sys.to_string()))
                .with_role(MessageRole::System),
        );

        // execute_streaming_with_context is the only context-aware execute
        // variant — we use a no-op callback since we don't need streaming.
        executor
            .execute_streaming_with_context(
                &metadata,
                &input,
                &context,
                Box::new(|_| Ok(())),
                None,
            )
            .map_err(|e| format!("LLM inference failed: {}", e))?
    } else {
        executor
            .execute(&metadata, &input, None)
            .map_err(|e| format!("LLM inference failed: {}", e))?
    };

    match output.kind {
        EnvelopeKind::Text(text) => Ok(text),
        _ => Err("LLM did not produce text output".to_string()),
    }
}
