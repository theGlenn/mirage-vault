export type UploadStage = 'drag' | 'reading' | 'parsing' | 'saving' | 'processing' | 'done' | 'error';

export interface UploadProgress {
  /** Client-generated ID for tracking before DB assignment */
  trackingId: string;
  /** File path on disk (empty for paste) */
  filePath: string;
  /** Display name */
  fileName: string;
  /** File extension without dot */
  fileType: string;
  /** Current pipeline stage */
  stage: UploadStage;
  /** Progress bar percentage: 0 | 20 | 40 | 60 | 80 | 100 */
  progress: number;
  /** DB item ID, assigned at saving stage. null before that. */
  itemId: number | null;
  /** Error message when stage === 'error' */
  error: string | null;
  /** Which stage the error occurred at, for retry logic */
  errorStage: UploadStage | null;
  /** Cached raw text content for retry without re-reading filesystem */
  rawContent: string | null;
  /** Cached raw PDF bytes for retry */
  rawPdfBytes: number[] | null;
  /** Timestamp for tracking duration */
  startedAt: number;
  /** Whether this is a paste operation (no filesystem read) */
  isPaste: boolean;
  /** Timestamp of the last stage transition (for timing logs) */
  lastStageAt: number;
}

export const STAGE_PROGRESS: Record<UploadStage, number> = {
  drag: 0,
  reading: 20,
  parsing: 40,
  saving: 60,
  processing: 80,
  done: 100,
  error: -1,
};

export function generateTrackingId(): string {
  return `upload_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
