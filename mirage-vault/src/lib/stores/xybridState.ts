import { writable, derived } from 'svelte/store';
import { maskingConfig } from './maskingConfig';

export type XybridStatus =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'loading'
  | 'ready'
  | 'error';

export interface XybridState {
  status: XybridStatus;
  /** 0.0–1.0 during download, -1 otherwise */
  progress: number;
  error: string | null;
  modelId: string | null;
}

const DEFAULT_STATE: XybridState = {
  status: 'idle',
  progress: -1,
  error: null,
  modelId: null,
};

function createXybridStateStore() {
  const { subscribe, set, update } = writable<XybridState>(DEFAULT_STATE);

  return {
    subscribe,

    setChecking: () =>
      update((s) => ({ ...s, status: 'checking', error: null })),

    setDownloading: (modelId: string) =>
      update((s) => ({
        ...s,
        status: 'downloading',
        modelId,
        progress: 0,
        error: null,
      })),

    setProgress: (progress: number) =>
      update((s) => ({ ...s, progress })),

    setLoading: () =>
      update((s) => ({ ...s, status: 'loading', progress: -1, error: null })),

    setReady: () =>
      update((s) => ({ ...s, status: 'ready', progress: -1, error: null })),

    setError: (error: string) =>
      update((s) => ({ ...s, status: 'error', error })),

    reset: () => set(DEFAULT_STATE),
  };
}

export const xybridState = createXybridStateStore();

export const isXybridActive = derived(
  maskingConfig,
  ($config) => $config.strategy === 'xybrid',
);
