<script lang="ts">
  import { onMount } from 'svelte';
  import { 
    maskingConfig, 
    type MaskingStrategy,
    getEffectiveStrategy 
  } from '$lib/stores/maskingConfig';
  import { isLlmAvailable, getAvailableModels } from '$lib/llm';

  let config = $state({
    strategy: 'nlp' as MaskingStrategy,
    useLlmRefinement: false,
    ollama: {
      enabled: false,
      baseUrl: 'http://localhost:11434',
      model: 'ministral-3:3b',
      timeoutMs: 30000,
      useJsonFormat: false,
    },
    nlp: {
      entityTypes: ['PERSON', 'ORG', 'EMAIL', 'PHONE', 'AMOUNT', 'DATE', 'API_KEY'],
      useCompromise: true,
      useRegex: true,
    },
  });
  
  let isAvailable = $state(false);
  let availableModels = $state<string[]>([]);
  let isChecking = $state(false);
  let showDetails = $state(false);

  // Subscribe to store
  $effect(() => {
    const unsubscribe = maskingConfig.subscribe(c => {
      config = c;
    });
    return unsubscribe;
  });

  onMount(async () => {
    await checkOllamaStatus();
  });

  async function checkOllamaStatus() {
    isChecking = true;
    try {
      isAvailable = await isLlmAvailable();
      if (isAvailable) {
        availableModels = await getAvailableModels();
      }
    } finally {
      isChecking = false;
    }
  }

  function setStrategy(strategy: MaskingStrategy) {
    maskingConfig.setStrategy(strategy);
  }

  function toggleLlmRefinement() {
    maskingConfig.setLlmRefinement(!config.useLlmRefinement);
  }

  const strategyInfo = {
    nlp: {
      title: 'NLP (Fast)',
      description: 'Uses regex patterns and compromise.js for fast local detection. Good for most use cases.',
      speed: 'Fast (~100ms)',
      accuracy: 'Good for common patterns',
      bestFor: 'Real-time chat, bulk processing',
    },
    ollama: {
      title: 'Ollama LLM (Thorough)',
      description: 'Uses local LLM for comprehensive PII detection. Catches edge cases but slower.',
      speed: 'Slower (~4-5s)',
      accuracy: 'Excellent, catches edge cases',
      bestFor: 'Sensitive documents, compliance',
    },
  };

  const effectiveStrategy = $derived(getEffectiveStrategy(config));
</script>

<div class="masking-config">
  <!-- Strategy Selection Cards -->
  <div class="strategy-cards">
    <button
      class="strategy-card"
      class:active={config.strategy === 'nlp'}
      onclick={() => setStrategy('nlp')}
    >
      <div class="card-header">
        <div class="strategy-icon">⚡</div>
        <div class="strategy-title">{strategyInfo.nlp.title}</div>
        {#if config.strategy === 'nlp'}
          <div class="selected-badge">Selected</div>
        {/if}
      </div>      
      <p class="strategy-desc">{strategyInfo.nlp.description}</p>      
      <div class="strategy-meta">
        <span class="meta-item">
          <strong>Speed:</strong> {strategyInfo.nlp.speed}
        </span>
        <span class="meta-item">
          <strong>Accuracy:</strong> {strategyInfo.nlp.accuracy}
        </span>
        <span class="meta-item">
          <strong>Best for:</strong> {strategyInfo.nlp.bestFor}
        </span>
      </div>
    </button>

    <button
      class="strategy-card"
      class:active={config.strategy === 'ollama'}
      class:disabled={!isAvailable}
      onclick={() => isAvailable && setStrategy('ollama')}
    >
      <div class="card-header">
        <div class="strategy-icon">🧠</div>
        <div class="strategy-title">{strategyInfo.ollama.title}</div>
        {#if config.strategy === 'ollama'}
          <div class="selected-badge">Selected</div>
        {/if}
        {#if !isAvailable}
          <div class="unavailable-badge">Unavailable</div>
        {/if}
      </div>
      
      <p class="strategy-desc">{strategyInfo.ollama.description}</p>
      
      <div class="strategy-meta">
        <span class="meta-item">
          <strong>Speed:</strong> {strategyInfo.ollama.speed}
        </span>
        <span class="meta-item">
          <strong>Accuracy:</strong> {strategyInfo.ollama.accuracy}
        </span>
        <span class="meta-item">
          <strong>Best for:</strong> {strategyInfo.ollama.bestFor}
        </span>
      </div>
      
      {#if !isAvailable}
        <div class="unavailable-hint">
          Ollama not running. Install from <a href="https://ollama.com" target="_blank">ollama.com</a>
        </div>
      {/if}
    </button>
  </div>

  <!-- Hybrid Mode Toggle -->
  <div class="hybrid-section">
    <label class="toggle-label">
      <input
        type="checkbox"
        checked={config.useLlmRefinement}
        onchange={toggleLlmRefinement}
        disabled={config.strategy === 'ollama' || !isAvailable}
      />
      <span class="toggle-text">
        Use LLM refinement on top of NLP (hybrid mode)
      </span>
    </label>    
    <p class="hybrid-desc">
      {#if config.strategy === 'ollama'}
        Not applicable when using Ollama as primary strategy.
      {:else if !isAvailable}
        Install Ollama to enable hybrid mode.
      {:else}
        Fast NLP detection first, then LLM verifies and adds missing entities.
        Best balance of speed and accuracy.
      {/if}
    </p>
  </div>

  <!-- Advanced Settings Toggle -->
  <button class="details-toggle" onclick={() => showDetails = !showDetails}>
    {showDetails ? '▼' : '▶'} Advanced Settings
  </button>

  {#if showDetails}
    <div class="details-panel">
      
      <!-- NLP Settings -->
      <div class="settings-group" class:disabled={config.strategy === 'ollama'}>
        <h4>📝 NLP Settings</h4>        
        <div class="setting-row">
          <label class="checkbox-label">
            <input
              type="checkbox"
              checked={config.nlp.useRegex}
              onchange={(e) => maskingConfig.setNlpConfig({ useRegex: e.currentTarget.checked })}
              disabled={config.strategy === 'ollama'}
            />
            Use regex patterns (emails, phones, amounts)
          </label>
        </div>        
        <div class="setting-row">
          <label class="checkbox-label">
            <input
              type="checkbox"
              checked={config.nlp.useCompromise}
              onchange={(e) => maskingConfig.setNlpConfig({ useCompromise: e.currentTarget.checked })}
              disabled={config.strategy === 'ollama'}
            />
            Use compromise.js (person/organization names)
          </label>
        </div>
      </div>

      <!-- Ollama Settings -->
      <div class="settings-group" class:disabled={config.strategy === 'nlp' && !config.useLlmRefinement}>
        <h4>🧠 Ollama Settings</h4>        
        <div class="setting-row">
          <label for="ollama-url">Ollama URL</label>
          <div class="input-with-status">
            <input
              id="ollama-url"
              type="text"
              bind:value={config.ollama.baseUrl}
              onchange={() => maskingConfig.setOllamaConfig({ baseUrl: config.ollama.baseUrl })}
              placeholder="http://localhost:11434"
              disabled={config.strategy === 'nlp' && !config.useLlmRefinement}
            />
            <button 
              class="refresh-btn" 
              onclick={checkOllamaStatus}
              disabled={isChecking}
              title="Check Ollama status"
            >
              {isChecking ? '⏳' : '🔄'}
            </button>
            <span class="status-dot" class:available={isAvailable}></span>
          </div>
        </div>        
        <div class="setting-row">
          <label for="ollama-model">Model</label>
          <select 
            id="ollama-model" 
            bind:value={config.ollama.model} 
            onchange={() => maskingConfig.setOllamaConfig({ model: config.ollama.model })}
            disabled={config.strategy === 'nlp' && !config.useLlmRefinement}
          >
            {#if availableModels.length === 0}
              <option value={config.ollama.model}>{config.ollama.model}</option>
            {:else}
              {#each availableModels as model}
                <option value={model}>{model}</option>
              {/each}
            {/if}
          </select>
        </div>        
        <div class="setting-row">
          <label for="timeout">Timeout (ms)</label>
          <input
            id="timeout"
            type="number"
            bind:value={config.ollama.timeoutMs}
            onchange={() => maskingConfig.setOllamaConfig({ timeoutMs: config.ollama.timeoutMs })}
            min="5000"
            max="120000"
            step="5000"
            disabled={config.strategy === 'nlp' && !config.useLlmRefinement}
          />
        </div>        
        <div class="setting-row">
          <label class="checkbox-label">
            <input
              type="checkbox"
              checked={config.ollama.useJsonFormat}
              onchange={(e) => maskingConfig.setOllamaConfig({ useJsonFormat: e.currentTarget.checked })}
              disabled={config.strategy === 'nlp' && !config.useLlmRefinement}
            />
            Use JSON format (more accurate, slower)
          </label>
          <span class="hint">Simple format is faster but JSON is more reliable</span>
        </div>
      </div>
    </div>
  {/if}

  <!-- Current Configuration Summary -->
  <div class="config-summary">
    <strong>Current Configuration:</strong>
    <span class="summary-badge" class:primary={config.strategy === 'nlp'}>
      {config.strategy === 'nlp' ? '⚡ NLP' : '🧠 Ollama'}
    </span>
    {#if config.useLlmRefinement && config.strategy === 'nlp'}
      <span class="summary-badge">+ LLM Refinement</span>
    {/if}
  </div>
</div>

<style>
  .masking-config {
    width: 100%;
    box-sizing: border-box;
    padding: 12px;
  }

  .strategy-cards {
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
    margin-bottom: 20px;
  }

  .strategy-card {
    display: flex;
    flex-direction: column;
    padding: 12px;
    border: 2px solid #e0e0e0;
    border-radius: 12px;
    background: white;
    cursor: pointer;
    text-align: left;
    transition: all 0.2s;
  }

  .strategy-card:hover {
    border-color: #1976d2;
    box-shadow: 0 2px 8px rgba(25, 118, 210, 0.1);
  }

  .strategy-card.active {
    border-color: #1976d2;
    background: #e3f2fd;
  }

  .strategy-card.disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .strategy-card.disabled:hover {
    border-color: #e0e0e0;
    box-shadow: none;
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }

  .strategy-icon {
    font-size: 24px;
  }

  .strategy-title {
    flex: 1;
    font-weight: 600;
    font-size: 16px;
  }

  .selected-badge {
    padding: 4px 8px;
    background: #1976d2;
    color: white;
    font-size: 12px;
    font-weight: 500;
    border-radius: 4px;
  }

  .unavailable-badge {
    padding: 4px 8px;
    background: #ff5722;
    color: white;
    font-size: 12px;
    font-weight: 500;
    border-radius: 4px;
  }

  .strategy-desc {
    margin: 0 0 12px 0;
    font-size: 14px;
    color: #555;
    line-height: 1.5;
  }

  .strategy-meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
    color: #666;
  }

  .meta-item strong {
    color: #333;
  }

  .unavailable-hint {
    margin-top: 12px;
    padding: 8px;
    background: #ffebee;
    border-radius: 6px;
    font-size: 13px;
    color: #c62828;
  }

  .unavailable-hint a {
    color: #1976d2;
    text-decoration: underline;
  }

  .hybrid-section {
    margin: 20px 0;
    padding: 12px;
    background: #f5f5f5;
    border-radius: 8px;
  }

  .toggle-label {
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;
    font-weight: 500;
  }

  .toggle-label input:disabled {
    cursor: not-allowed;
  }

  .toggle-text {
    font-size: 15px;
  }

  .hybrid-desc {
    margin: 8px 0 0 28px;
    font-size: 13px;
    color: #666;
  }

  .details-toggle {
    width: 100%;
    padding: 12px;
    background: transparent;
    border: 1px solid #ddd;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    text-align: left;
  }

  .details-toggle:hover {
    background: #f5f5f5;
  }

  .details-panel {
    margin-top: 16px;
    padding: 12px;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    background: #fafafa;
  }

  .settings-group {
    margin-bottom: 24px;
  }

  .settings-group.disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  .settings-group h4 {
    margin: 0 0 12px 0;
    font-size: 14px;
    color: #333;
  }

  .setting-row {
    margin-bottom: 12px;
  }

  .setting-row label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    margin-bottom: 4px;
  }

  .checkbox-label {
    display: flex !important;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  .setting-row input[type="text"],
  .setting-row input[type="number"],
  .setting-row select {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
  }

  .input-with-status {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .input-with-status input {
    flex: 1;
  }

  .refresh-btn {
    padding: 8px;
    background: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 4px;
    cursor: pointer;
  }

  .refresh-btn:hover {
    background: #e0e0e0;
  }

  .status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #ccc;
  }

  .status-dot.available {
    background: #4caf50;
  }

  .hint {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    color: #888;
  }

  .config-summary {
    margin-top: 20px;
    padding: 12px 16px;
    background: #e3f2fd;
    border-radius: 8px;
    font-size: 14px;
  }

  .summary-badge {
    display: inline-block;
    margin-left: 8px;
    padding: 4px 8px;
    background: #1976d2;
    color: white;
    font-size: 12px;
    font-weight: 500;
    border-radius: 4px;
  }

  .summary-badge.primary {
    background: #4caf50;
  }
</style>
