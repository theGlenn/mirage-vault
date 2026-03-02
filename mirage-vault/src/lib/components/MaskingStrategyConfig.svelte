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
    xybrid: {
      enabled: false,
      useJsonFormat: false,
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
    padding: 0;
    font-family: 'Geist Mono', 'SF Mono', Monaco, monospace;
    color: var(--text-primary);
  }

  .strategy-cards {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
    margin-bottom: 16px;
  }

  .strategy-card {
    display: flex;
    flex-direction: column;
    padding: 12px;
    border: 2px solid var(--border);
    border-radius: 8px;
    background: var(--bg-elevated);
    cursor: pointer;
    text-align: left;
    transition: border-color 0.15s, background-color 0.15s;
  }

  .strategy-card:hover {
    border-color: var(--color-orange);
  }

  .strategy-card.active {
    border-color: var(--color-orange);
    background: var(--bg-surface);
  }

  .strategy-card.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .strategy-card.disabled:hover {
    border-color: var(--border);
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }

  .strategy-icon {
    font-size: 20px;
  }

  .strategy-title {
    flex: 1;
    font-weight: 600;
    font-size: 13px;
    letter-spacing: 0.02em;
  }

  .selected-badge {
    padding: 2px 6px;
    background: var(--color-orange);
    color: #fff;
    font-size: 10px;
    font-weight: 600;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .unavailable-badge {
    padding: 2px 6px;
    background: var(--accent-red);
    color: #fff;
    font-size: 10px;
    font-weight: 600;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .strategy-desc {
    margin: 0 0 8px 0;
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .strategy-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 11px;
    color: var(--text-muted);
  }

  .meta-item strong {
    color: var(--text-secondary);
  }

  .unavailable-hint {
    margin-top: 8px;
    padding: 8px;
    background: var(--bg-secondary);
    border: 1px solid var(--accent-red);
    border-radius: 6px;
    font-size: 11px;
    color: var(--accent-red);
  }

  .unavailable-hint a {
    color: var(--color-orange);
    text-decoration: underline;
  }

  .hybrid-section {
    margin: 16px 0;
    padding: 12px;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .toggle-label {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    font-weight: 500;
  }

  .toggle-label input:disabled {
    cursor: not-allowed;
  }

  .toggle-text {
    font-size: 12px;
    color: var(--text-primary);
  }

  .hybrid-desc {
    margin: 6px 0 0 24px;
    font-size: 11px;
    color: var(--text-muted);
  }

  .details-toggle {
    width: 100%;
    padding: 10px 12px;
    background: transparent;
    border: 2px solid var(--border);
    border-radius: 8px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    font-family: inherit;
    text-align: left;
    color: var(--text-primary);
  }

  .details-toggle:hover {
    background: var(--bg-elevated);
    border-color: var(--color-orange);
  }

  .details-panel {
    margin-top: 12px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-secondary);
  }

  .settings-group {
    margin-bottom: 20px;
  }

  .settings-group.disabled {
    opacity: 0.4;
    pointer-events: none;
  }

  .settings-group h4 {
    margin: 0 0 10px 0;
    font-size: 12px;
    color: var(--text-primary);
    font-weight: 600;
  }

  .setting-row {
    margin-bottom: 10px;
  }

  .setting-row label {
    display: block;
    font-size: 11px;
    font-weight: 500;
    margin-bottom: 4px;
    color: var(--text-secondary);
  }

  .checkbox-label {
    display: flex !important;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    color: var(--text-primary);
  }

  .setting-row input[type="text"],
  .setting-row input[type="number"],
  .setting-row select {
    width: 100%;
    padding: 6px 10px;
    border: 2px solid var(--border);
    border-radius: 6px;
    font-size: 12px;
    font-family: inherit;
    background: var(--bg-elevated);
    color: var(--text-primary);
  }

  .setting-row input:focus,
  .setting-row select:focus {
    outline: none;
    border-color: var(--color-orange);
  }

  .input-with-status {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .input-with-status input {
    flex: 1;
  }

  .refresh-btn {
    padding: 6px 8px;
    background: var(--bg-elevated);
    border: 2px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
  }

  .refresh-btn:hover {
    border-color: var(--color-orange);
    background: var(--bg-surface);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-muted);
  }

  .status-dot.available {
    background: #4caf50;
  }

  .hint {
    display: block;
    margin-top: 4px;
    font-size: 10px;
    color: var(--text-muted);
  }

  .config-summary {
    margin-top: 16px;
    padding: 10px 12px;
    background: var(--bg-secondary);
    border: 2px solid var(--border);
    border-radius: 8px;
    font-size: 12px;
    color: var(--text-primary);
  }

  .summary-badge {
    display: inline-block;
    margin-left: 6px;
    padding: 2px 6px;
    background: var(--color-orange);
    color: #fff;
    font-size: 10px;
    font-weight: 600;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .summary-badge.primary {
    background: #4caf50;
  }
</style>
