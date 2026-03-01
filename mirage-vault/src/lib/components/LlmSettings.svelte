<script lang="ts">
  import { onMount } from 'svelte';
  import { llmSettings, type LlmSettings } from '$lib/stores/llmSettings';
  import { isLlmAvailable, getAvailableModels, ollamaClient } from '$lib/llm';

  let settings: LlmSettings = $state({
    enabled: false,
    baseUrl: 'http://localhost:11434',
    model: 'ministral-3:3b',
    timeoutMs: 30000,
  });
  
  let isAvailable = $state(false);
  let availableModels = $state<string[]>([]);
  let isChecking = $state(false);
  let errorMessage = $state('');
  let showSettings = $state(false);

  // Subscribe to store
  $effect(() => {
    const unsubscribe = llmSettings.subscribe(s => {
      settings = s;
    });
    return unsubscribe;
  });

  onMount(async () => {
    await checkAvailability();
  });

  async function checkAvailability() {
    isChecking = true;
    errorMessage = '';
    
    try {
      // Update client config
      ollamaClient.setConfig({
        baseUrl: settings.baseUrl,
        model: settings.model,
        timeoutMs: settings.timeoutMs,
      });
      
      isAvailable = await isLlmAvailable();
      
      if (isAvailable) {
        availableModels = await getAvailableModels();
      } else {
        availableModels = [];
        if (settings.enabled) {
          errorMessage = 'Ollama is not running. Please start Ollama or check the URL.';
        }
      }
    } catch (err) {
      isAvailable = false;
      availableModels = [];
      errorMessage = err instanceof Error ? err.message : 'Failed to check Ollama status';
    } finally {
      isChecking = false;
    }
  }

  function saveSettings() {
    llmSettings.set(settings);
    checkAvailability();
  }

  function toggleEnabled() {
    settings.enabled = !settings.enabled;
    saveSettings();
  }
</script>

<div class="llm-settings">
  <button class="settings-toggle" onclick={() => showSettings = !showSettings}>
    <span class="status-indicator" class:available={isAvailable} class:enabled={settings.enabled}></span>
    <span>LLM {settings.enabled ? 'Enabled' : 'Disabled'}</span>
    <span class="toggle-arrow" class:open={showSettings}>▼</span>
  </button>
  
  {#if showSettings}
    <div class="settings-panel">
      <div class="setting-row">
        <label class="toggle-label">
          <input
            type="checkbox"
            checked={settings.enabled}
            onchange={toggleEnabled}
          />
          <span>Enable LLM-Assisted Detection</span>
        </label>
        <button class="refresh-btn" onclick={checkAvailability} disabled={isChecking}>
          {isChecking ? 'Checking...' : 'Refresh'}
        </button>
      </div>
      
      {#if errorMessage}
        <div class="error-message">{errorMessage}</div>
      {/if}
      
      <div class="setting-group">
        <label for="ollama-url">Ollama URL</label>
        <input
          id="ollama-url"
          type="text"
          bind:value={settings.baseUrl}
          onchange={saveSettings}
          placeholder="http://localhost:11434"
        />
      </div>
      
      <div class="setting-group">
        <label for="ollama-model">Model</label>
        <select id="ollama-model" bind:value={settings.model} onchange={saveSettings}>
          {#if availableModels.length === 0}
            <option value={settings.model}>{settings.model} (not verified)</option>
          {:else}
            {#each availableModels as model}
              <option value={model}>{model}</option>
            {/each}
          {/if}
        </select>
        {#if availableModels.length === 0 && !isChecking}
          <span class="hint">Start Ollama to see available models</span>
        {/if}
      </div>
      
      <div class="setting-group">
        <label for="timeout">Timeout (ms)</label>
        <input
          id="timeout"
          type="number"
          bind:value={settings.timeoutMs}
          onchange={saveSettings}
          min="5000"
          max="120000"
          step="5000"
        />
      </div>
      
      <div class="info-box">
        <strong>About LLM-Assisted Detection</strong>
        <p>
          When enabled, the vault sends detected entities to a local Ollama instance
          for verification and enhancement. This catches edge cases that regex/NLP
          might miss, but adds latency to file processing.
        </p>
        <p class="recommended-models">
          <strong>Recommended models:</strong> ministral-3:3b, qwen2:0.5b, or similar small models.
        </p>
      </div>
    </div>
  {/if}
</div>

<style>
  .llm-settings {
    border-top: 1px solid var(--border-color, #e0e0e0);
    padding: 12px 0;
  }
  
  .settings-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 14px;
    color: var(--text-color, #333);
  }
  
  .settings-toggle:hover {
    background: var(--hover-bg, #f5f5f5);
  }
  
  .status-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ccc;
  }
  
  .status-indicator.available {
    background: #4caf50;
  }
  
  .status-indicator.enabled {
    background: #2196f3;
    box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.3);
  }
  
  .toggle-arrow {
    margin-left: auto;
    font-size: 10px;
    transition: transform 0.2s;
  }
  
  .toggle-arrow.open {
    transform: rotate(180deg);
  }
  
  .settings-panel {
    padding: 16px;
    background: var(--panel-bg, #f9f9f9);
    border-radius: 8px;
    margin-top: 8px;
  }
  
  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  
  .toggle-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 14px;
  }
  
  .refresh-btn {
    padding: 4px 12px;
    font-size: 12px;
    background: var(--primary-color, #1976d2);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  
  .refresh-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  .error-message {
    padding: 8px 12px;
    background: #ffebee;
    color: #c62828;
    border-radius: 4px;
    font-size: 13px;
    margin-bottom: 16px;
  }
  
  .setting-group {
    margin-bottom: 16px;
  }
  
  .setting-group label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    margin-bottom: 4px;
    color: var(--text-color, #333);
  }
  
  .setting-group input,
  .setting-group select {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--border-color, #ddd);
    border-radius: 4px;
    font-size: 14px;
    background: white;
  }
  
  .setting-group input:focus,
  .setting-group select:focus {
    outline: none;
    border-color: var(--primary-color, #1976d2);
  }
  
  .hint {
    font-size: 12px;
    color: #666;
    margin-top: 4px;
    display: block;
  }
  
  .info-box {
    padding: 12px;
    background: #e3f2fd;
    border-radius: 4px;
    font-size: 13px;
    line-height: 1.5;
  }
  
  .info-box strong {
    display: block;
    margin-bottom: 8px;
    color: #1565c0;
  }
  
  .info-box p {
    margin: 0 0 8px 0;
    color: #333;
  }
  
  .recommended-models {
    font-size: 12px;
    color: #555;
  }
</style>
