import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const kdsPageSource = readFileSync(
  join(process.cwd(), "app/(protected)/br/[branchId]/kds/page.tsx"),
  "utf8",
);

const kdsRealtimeSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/kds/hooks/use-kds-realtime.ts",
  ),
  "utf8",
);

const kdsMutationsSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/kds/hooks/use-kds-mutations.ts",
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
  assert.deepEqual(extractVisibleStatuses(kdsPageSource), [
    "pending",
    "preparing",
    "ready",
  ]);
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

test("KDS out-of-stock optimistic path removes the row instead of marking it cancelled", () => {
  assert.match(
    kdsMutationsSource,
    /setTickets\(\(prev\) => prev\.filter\(\(t\) => t\.id !== ticketId\)\);/,
  );
  assert.doesNotMatch(
    kdsMutationsSource,
    /t\.id === ticketId \? \{ \.\.\.t, status: "cancelled" \} : t/,
  );
});
