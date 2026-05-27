import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { KDS_VISIBLE_STATUSES } from "../app/(protected)/br/[branchId]/kds/lib/ticket-status";

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

test("KDS visible snapshots exclude cancelled tickets", () => {
  assert.deepEqual(
    [...KDS_VISIBLE_STATUSES],
    ["pending", "preparing", "ready"],
  );
  assert.match(kdsPageSource, /KDS_VISIBLE_STATUSES/);
  assert.match(kdsRealtimeSource, /KDS_VISIBLE_STATUSES/);
  assert.doesNotMatch(kdsPageSource, /"cancelled"/);
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
