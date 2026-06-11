/**
 * Device-local operational preferences (e.g. POS/KDS sound alerts).
 * NOT for scope or workflow state — those stay in URL/server state
 * (see scripts/check-client-storage.mjs). Both accessors fail soft in
 * private mode / storage-denied contexts.
 */
export function readDevicePref(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeDevicePref(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode — preference simply does not persist.
  }
}
