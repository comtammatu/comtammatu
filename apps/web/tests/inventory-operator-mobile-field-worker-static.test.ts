import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readWeb(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const hubQueueSource = readWeb(
  "app/(protected)/br/[branchId]/(operator)/_components/hub/hub-queue-section.tsx",
);
const receiveClientSource = readWeb(
  "app/(protected)/br/[branchId]/(operator)/stock/receive/[id]/transfer-receive-client.tsx",
);
const transferDetailModelSource = readWeb(
  "lib/inventory/transfer-detail-model.ts",
);
const transferActionsSource = readWeb(
  "app/(protected)/inventory/transfer-actions.ts",
);
const stocktakeListSource = readWeb(
  "app/(protected)/inventory/stocktake/stocktake-list-client.tsx",
);
const countAssignmentsSource = readWeb(
  "app/(protected)/inventory/count-assignments/count-assignments-client.tsx",
);

test("operator hub queue only renders positive pending work", () => {
  assert.match(
    hubQueueSource,
    /buildQueueRows\(basePath, queueCounts\)\.filter\(\s*\(row\) => row\.count > 0/,
  );
  assert.match(hubQueueSource, /if \(queueRows\.length === 0\) return null/);
  assert.match(hubQueueSource, /\{rows\.map\(\(row\) => \(/);
  assert.match(hubQueueSource, /<Badge variant="warning">/);
});

test("operator transfer receive requires shortage notes and accepts transit state", () => {
  assert.match(receiveClientSource, /isTransferReceiveReady/);
  assert.match(
    transferDetailModelSource,
    /return status === "in_transit" \|\| status === "confirmed_receive";/,
  );
  assert.doesNotMatch(
    receiveClientSource,
    /transfer\.status === "confirmed_receive"/,
  );
  assert.match(
    receiveClientSource,
    /const isWaitingForTransit = transfer\.status === "confirmed_ship"/,
  );
  assert.match(receiveClientSource, /receiveCopy\.receiveWaitingTransit/);
  assert.match(
    receiveClientSource,
    /isWaitingForTransit \? backHref : detailHref/,
  );
  assert.match(receiveClientSource, /receiveCopy\.receiveBackToList/);
  assert.match(receiveClientSource, /const \[notes, setNotes\]/);
  assert.match(receiveClientSource, /qty < item\.qty && note\.length < 3/);
  assert.match(receiveClientSource, /copy\.shortageNoteMinLength/);
  assert.match(receiveClientSource, /note \}/);
  assert.match(receiveClientSource, /<Textarea/);
});

test("transfer receive server action advances valid state machine steps only", () => {
  assert.match(
    transferActionsSource,
    /authz\.transfer\.status === "confirmed_ship"/,
  );
  assert.match(transferActionsSource, /stock_transfer_mark_in_transit/);
  assert.match(transferActionsSource, /mark_in_transit_auto_receive_failed/);
  assert.match(
    transferActionsSource,
    /authz\.transfer\.status === "confirmed_ship" \|\|\s*authz\.transfer\.status === "in_transit"/,
  );
  assert.match(transferActionsSource, /stock_transfer_confirm_receive/);
});

test("stocktake list uses styled confirm dialog instead of browser confirm", () => {
  assert.match(
    stocktakeListSource,
    /@comtammatu\/ui\/components\/confirm-dialog/,
  );
  assert.match(stocktakeListSource, /const ok = await confirm\(\{/);
  assert.doesNotMatch(stocktakeListSource, /confirm\("/);
});

test("Admin Dashboard count assignment dialog has a searchable ingredient list", () => {
  assert.match(countAssignmentsSource, /Search as IconSearch/);
  assert.match(
    countAssignmentsSource,
    /const \[ingredientSearch, setIngredientSearch\]/,
  );
  assert.match(countAssignmentsSource, /<AppDialog/);
  assert.doesNotMatch(countAssignmentsSource, /<Drawer|useSwipeReveal/);
  assert.match(countAssignmentsSource, /const visibleIngredients = useMemo/);
  assert.match(
    countAssignmentsSource,
    /matchesSearch\(\[ingredient\.name, ingredient\.unit\]/,
  );
  assert.match(countAssignmentsSource, /countAssignSearchPlaceholder/);
  assert.match(countAssignmentsSource, /countAssignNoIngredientMatches/);
  assert.match(countAssignmentsSource, /visibleIngredients\.map/);
});

test("operator stock route owns loading and error boundaries", () => {
  const loadingSource = readWeb(
    "app/(protected)/br/[branchId]/(operator)/stock/loading.tsx",
  );
  const errorSource = readWeb(
    "app/(protected)/br/[branchId]/(operator)/stock/error.tsx",
  );

  assert.equal(
    existsSync(
      join(
        process.cwd(),
        "app/(protected)/br/[branchId]/(operator)/stock/loading.tsx",
      ),
    ),
    true,
  );
  assert.equal(
    existsSync(
      join(
        process.cwd(),
        "app/(protected)/br/[branchId]/(operator)/stock/error.tsx",
      ),
    ),
    true,
  );
  assert.match(loadingSource, /import \{ PageSkeleton \}/);
  assert.match(loadingSource, /<PageSkeleton \/>/);
  assert.match(errorSource, /"use client"/);
  assert.match(errorSource, /import \{ ErrorPanel, type ErrorPanelProps \}/);
  assert.match(errorSource, /<ErrorPanel \{\.\.\.props\} \/>/);
});
