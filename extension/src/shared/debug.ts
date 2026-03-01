const DEBUG_FLAG = true;

function prefix(scope: string): string {
  return `[MIRAGE][${scope}]`;
}

export function debugLog(scope: string, ...args: unknown[]) {
  if (!DEBUG_FLAG) {
    return;
  }
  console.log(prefix(scope), ...args);
}

export function debugWarn(scope: string, ...args: unknown[]) {
  if (!DEBUG_FLAG) {
    return;
  }
  console.warn(prefix(scope), ...args);
}

export function debugError(scope: string, ...args: unknown[]) {
  if (!DEBUG_FLAG) {
    return;
  }
  console.error(prefix(scope), ...args);
}
