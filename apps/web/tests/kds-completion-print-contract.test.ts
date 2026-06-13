import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const useKdsMutationsSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/kds/hooks/use-kds-mutations.ts",
  ),
  "utf8",
);

const batchActionsSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/kds/components/batch-actions.tsx",
  ),
  "utf8",
);

test("KDS completion sends only active tickets to the completion RPC", () => {
  assert.match(
    useKdsMutationsSource,
    /isKdsActiveTicketStatus\(ticket\.status\)/,
    "client mutation must filter out ready/cancelled tickets before RPC",
  );
  assert.match(
    useKdsMutationsSource,
    /p_ticket_ids: activeIds/,
    "RPC payload must use the active ticket list",
  );
  assert.match(
    batchActionsSource,
    /activeTickets: KdsTicket\[\]/,
    "whole-card complete must pass only pending/preparing tickets",
  );
  assert.match(
    batchActionsSource,
    /void onCompleteTickets\(activeTicketIds\)/,
    "whole-card complete must not recompute a wider order item set",
  );
});

test("KDS completion surfaces safe print warnings without raw DB errors", () => {
  assert.match(
    useKdsMutationsSource,
    /type CompleteKdsTicketsResult = \{[\s\S]*print_warning\?: string \| null/,
    "client must understand safe print_warning metadata",
  );
  assert.match(
    useKdsMutationsSource,
    /toast\.warning\([\s\S]*chưa tạo đủ phiếu in bếp/,
    "client must warn operators when completion could not queue all slips",
  );
  assert.doesNotMatch(
    useKdsMutationsSource,
    /toast\.warning\([^)]*error\.message/,
    "client must not display raw database errors in print warnings",
  );
});
