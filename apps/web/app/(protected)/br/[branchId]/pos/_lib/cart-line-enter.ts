// One-shot enter signal for POS cart lines. Adding a menu item either merges
// onto an existing line (same key, quantity++) or appends a brand-new line
// (new key). The cart store is local, deterministic state — a key that was not
// present on the previous observation is always a genuinely new line, so the
// "new key" test is provable here (unlike the KDS board, which mixes realtime
// INSERTs with snapshot refreshes). Quantity changes reuse the existing key and
// are already covered by the line's own quantity pulse, so they never enter.

export interface JustAddedCartKeys {
  nextKnownKeys: Set<string>;
  addedKeys: string[];
}

export function deriveJustAddedCartKeys(
  previousKeys: ReadonlySet<string> | null,
  currentKeys: readonly string[],
): JustAddedCartKeys {
  const nextKnownKeys = new Set(currentKeys);
  // Prime on first observation — the initial cart never flashes on mount.
  if (previousKeys === null) {
    return { nextKnownKeys, addedKeys: [] };
  }
  const addedKeys: string[] = [];
  for (const key of currentKeys) {
    if (!previousKeys.has(key)) addedKeys.push(key);
  }
  return { nextKnownKeys, addedKeys };
}

// § G one-shot content enter: a single fade-in at duration-150 only. No slide,
// nothing decorative; the class clears once the line is no longer just-added.
export function getCartLineEnterClass(): string {
  return "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150";
}
