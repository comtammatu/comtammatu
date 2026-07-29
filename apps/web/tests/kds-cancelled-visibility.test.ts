import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const kdsRealtimeSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/kds/_hooks/use-kds-realtime.ts",
  ),
  "utf8",
);

function extractVisibleStatuses(source: string): string[] {
  const match = source.match(
    /const KDS_VISIBLE_STATUSES = \[([\s\S]*?)\](?: as const)?;/,
  );
  assert.ok(match, "KDS_VISIBLE_STATUSES must be declared");
  return [...match[1]!.matchAll(/"([^"]+)"/g)].map((item) => item[1]!);
}

test("KDS visible snapshots exclude cancelled tickets", () => {
  // The page now streams the shell and fetches the ticket snapshot in the
  // realtime hook, so KDS_VISIBLE_STATUSES lives there (not on the page).
  assert.deepEqual(extractVisibleStatuses(kdsRealtimeSource), [
    "pending",
    "preparing",
    "ready",
  ]);
});

test("KDS realtime evicts tickets that become cancelled", () => {
  assert.match(kdsRealtimeSource, /function isVisibleKdsTicket/);
  assert.match(
    kdsRealtimeSource,
    /if \(!isVisibleKdsTicket\(newTicket\)\) return;/,
  );
  assert.match(
    kdsRealtimeSource,
    /isVisibleKdsTicket\(updated\)[\s\S]*prev\.filter\(\(t\) => t\.id !== updated\.id\)/,
  );
});
