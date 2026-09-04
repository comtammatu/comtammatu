import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const ticketRowMeta = read(
  "app/(protected)/br/[branchId]/kds/_components/ticket-row-meta.tsx",
);
const orderNote = read(
  "app/(protected)/br/[branchId]/kds/_components/order-note.tsx",
);
const orderGrid = read(
  "app/(protected)/br/[branchId]/kds/_components/order-grid.tsx",
);
const focusView = read(
  "app/(protected)/br/[branchId]/kds/_components/focus-view.tsx",
);
const viewModeToggle = read(
  "app/(protected)/br/[branchId]/kds/_components/view-mode-toggle.tsx",
);
const batchActions = read(
  "app/(protected)/br/[branchId]/kds/_components/batch-actions.tsx",
);
const kdsBoard = read("app/(protected)/br/[branchId]/kds/kds-board.tsx");
const kdsMessages = readFileSync(
  join(process.cwd(), "../../packages/shared/src/messages/kds.ts"),
  "utf8",
);

test("KDS item and order notes use stock NoteCallout without scroll or pad fork", () => {
  assert.match(ticketRowMeta, /<NoteCallout/);
  assert.match(ticketRowMeta, /tone="warning"/);
  assert.match(ticketRowMeta, /className="w-full min-w-0"/);
  assert.doesNotMatch(ticketRowMeta, /px-2 py-1/);
  assert.doesNotMatch(ticketRowMeta, /leading-snug/);
  assert.doesNotMatch(
    ticketRowMeta,
    /overflow-y-auto|max-h-16|max-h-20|line-clamp|truncate/,
  );

  assert.match(orderNote, /<NoteCallout/);
  assert.match(orderNote, /tone="warning"/);
  assert.doesNotMatch(orderNote, /bg-warning\/15/);
  assert.doesNotMatch(orderNote, /overflow-y-auto|max-h-20|max-h-32/);
  assert.doesNotMatch(orderNote, /compact \? "px-2 py-1"/);
});

test("KDS ticket rows use Rhythm A gaps and default body leading", () => {
  assert.match(ticketRowMeta, /flex w-full min-w-0 flex-col gap-2/);
  assert.match(ticketRowMeta, /flex flex-wrap items-center gap-1\.5/);

  assert.match(
    orderGrid,
    /flex min-w-0 flex-1 flex-col justify-center min-h-8 gap-2/,
  );
  assert.match(
    orderGrid,
    /flex min-w-0 flex-wrap items-baseline gap-x-1\.5 gap-y-1/,
  );
  assert.match(
    orderGrid,
    /min-w-0 break-words text-sm font-medium text-muted-foreground/,
  );
  assert.doesNotMatch(orderGrid, /gap-y-0\.5/);
  assert.doesNotMatch(orderGrid, /leading-4/);
  assert.doesNotMatch(orderGrid, /leading-snug/);
  assert.match(orderGrid, /xl:py-2 xl:first:pt-0 xl:last:pb-0/);
  assert.match(
    orderGrid,
    /rounded-none border-0 p-0 py-2 first:pt-0 last:pb-0/,
  );

  assert.match(
    focusView,
    /flex min-w-0 flex-1 flex-col justify-center min-h-12 gap-2/,
  );
  assert.match(
    focusView,
    /flex min-w-0 flex-wrap items-baseline gap-x-1\.5 gap-y-1/,
  );
  assert.match(
    focusView,
    /min-w-0 break-words text-sm font-medium text-muted-foreground/,
  );
  assert.doesNotMatch(focusView, /gap-y-0\.5/);
  assert.doesNotMatch(focusView, /leading-4/);
});

test("KDS heatmap bump controls use station touch sizes", () => {
  assert.match(
    orderGrid,
    /data-testid=\{`kds-heatmap-complete-ticket-\$\{String\(ticket\.id\)\}`\}[\s\S]*?size="touch"/,
  );
  assert.match(
    orderGrid,
    /data-testid=\{`kds-recall-\$\{String\(ticket\.id\)\}`\}[\s\S]*?size="touch"/,
  );
  assert.doesNotMatch(orderGrid, /className="h-8 px-2\.5/);
  assert.doesNotMatch(orderGrid, /className="h-8 w-8 px-0/);
});

test("KDS view mode toggle shows 1 phiếu / Toàn bộ labels", () => {
  assert.match(kdsMessages, /viewModeFocusLabel: "1 phiếu"/);
  assert.match(kdsMessages, /viewModeOverviewLabel: "Toàn bộ"/);
  assert.match(viewModeToggle, /KDS_VI\.viewModeFocusLabel/);
  assert.match(viewModeToggle, /KDS_VI\.viewModeOverviewLabel/);
});

test("KDS comprehensive board shows compact lane titles and batch complete only for 2+ items", () => {
  assert.match(orderGrid, /kds-column-title-/);
  assert.match(orderGrid, /\{column\.title\}/);
  assert.match(batchActions, /activeTickets\.length < 2/);
  assert.match(focusView, /activeTickets\.length >= 2/);
  assert.match(
    kdsBoard,
    /mode === "comprehensive"[\s\S]*<BatchSummaryBar/,
  );
});
