import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readSource(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const menuActionsSource = readSource(
  "app/(protected)/br/[branchId]/pos/menu-actions.ts",
);
const providerSource = readSource(
  "app/(protected)/br/[branchId]/pos/_providers/pos-desktop-provider.tsx",
);
const innerSource = readSource(
  "app/(protected)/br/[branchId]/pos/pos-desktop-inner.tsx",
);

test("fetchDailyLimitsForPos accepts optional excludeHoldTokens and forwards them as p_exclude_hold_tokens", () => {
  assert.match(
    menuActionsSource,
    /export async function fetchDailyLimitsForPos\(\s*branchId: number,\s*excludeHoldTokens\?: string\[\],\s*\): Promise<ActionResult>/,
  );
  assert.match(
    menuActionsSource,
    /rpcCaller\.rpc\("get_branch_menu_daily_limits_for_pos", \{\s*p_branch_id: parsedBranchId\.data,\s*p_exclude_hold_tokens:/,
  );
  // Only threads tokens when the caller actually has live holds.
  assert.match(
    menuActionsSource,
    /excludeHoldTokens && excludeHoldTokens\.length > 0\s*\?\s*excludeHoldTokens\s*:\s*null/,
  );
});

test("RSC initial load (fetchMenuForPos) omits p_exclude_hold_tokens — no live hold yet", () => {
  // The call args object itself carries only p_branch_id — no third key.
  assert.match(
    menuActionsSource,
    /const limitsPromise = rpcCaller\.rpc\(\s*"get_branch_menu_daily_limits_for_pos",\s*\{ p_branch_id: parsedBranchId\.data \},\s*\);/,
  );
});

test("provider exposes a hold-token getter registration read fresh on every refetch", () => {
  assert.match(
    providerSource,
    /registerDailyLimitHoldTokenGetter: \(getTokens: \(\) => readonly string\[\]\) => void;/,
  );
  assert.match(
    providerSource,
    /const loadDailyLimits = useCallback\(async \(\) => \{\s*const liveTokens = holdTokenGetterRef\.current\?\.\(\) \?\? \[\];\s*const result = await fetchDailyLimitsForPos\(\s*branchId,\s*liveTokens\.length > 0 \? \[\.\.\.liveTokens\] : undefined,/,
  );
});

test("PosDesktopInner registers its live cart/append hold tokens with the provider", () => {
  assert.match(
    innerSource,
    /registerDailyLimitHoldTokenGetter\(\(\) => \[\s*getDailyLimitHoldToken\("pos_cart"\),\s*getDailyLimitHoldToken\("pos_append"\),\s*\]\);/,
  );
});

test("client keeps single-side own-demand accounting — no hold add-back beside daily-limit-draft.ts", () => {
  const draftSource = readSource(
    "app/(protected)/br/[branchId]/pos/_utils/daily-limit-draft.ts",
  );
  // The server now excludes own holds (p_exclude_hold_tokens); the client's
  // only own-demand accounting stays the draft-demand subtraction here —
  // adding a second client-side hold credit would double-count (D064 §4).
  assert.match(draftSource, /remainingDailyQuotaAfterDemand/);
  assert.doesNotMatch(providerSource, /active_hold_demand/);
  assert.doesNotMatch(innerSource, /active_hold_demand/);
});
