import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readWeb(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const branchQueueSource = readWeb(
  "app/(protected)/br/[branchId]/(operator)/_components/home/branch-queue-section.tsx",
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

test("branch home queue only renders positive pending work", () => {
  assert.match(
    branchQueueSource,
    /buildQueueRows\(basePath, queueCounts\)\.filter\(\s*\(row\) => row\.count > 0/,
  );
  assert.match(branchQueueSource, /if \(queueRows\.length === 0\) return null/);
  assert.match(branchQueueSource, /\{rows\.map\(\(row\) => \(/);
  assert.match(branchQueueSource, /<Badge variant="warning">/);
});

test("operator transfer receive auto-starts inspection and requires shortage notes", () => {
  assert.match(receiveClientSource, /isTransferReceiveReady/);
  assert.match(receiveClientSource, /isTransferReceiveStartable/);
  assert.match(receiveClientSource, /transferConfirmReceive/);
  assert.match(receiveClientSource, /receiveSessionStartRequested/);
  assert.match(receiveClientSource, /receiveStarting/);
  assert.match(receiveClientSource, /receiveStartRetry/);
  assert.doesNotMatch(receiveClientSource, /receiveStartAction/);
  assert.doesNotMatch(receiveClientSource, /receiveStartTitle/);
  assert.match(
    transferDetailModelSource,
    /return status === "confirmed_receive";/,
  );
  assert.match(
    transferDetailModelSource,
    /export function isTransferReceiveStartable/,
  );
  assert.match(receiveClientSource, /receiveWaitingShipTitle/);
  assert.match(receiveClientSource, /receiveCopy\.receiveOpenDetail/);
  assert.match(receiveClientSource, /detailHref \?/);
  assert.match(receiveClientSource, /render=\{<Link href=\{detailHref\}/);
  assert.match(receiveClientSource, /documentTitle/);
  assert.match(receiveClientSource, /const \[notes, setNotes\]/);
  assert.match(receiveClientSource, /qty < item\.qty && note\.length < 5/);
  assert.match(receiveClientSource, /copy\.shortageNoteMinLength/);
  assert.match(receiveClientSource, /shortfall_class: classification/);
  assert.match(receiveClientSource, /<Textarea/);
});

test("transfer receive server action advances valid state machine steps only", () => {
  assert.match(
    transferActionsSource,
    /export async function transferConfirmReceive/,
  );
  assert.match(transferActionsSource, /stock_transfer_confirm_receive/);
  assert.match(
    transferActionsSource,
    /authz\.transfer\.status !== "confirmed_receive"/,
  );
});

test("stocktake list uses styled confirm dialog instead of browser confirm", () => {
  assert.match(
    stocktakeListSource,
    /@\/components\/confirm-dialog/,
  );
  assert.match(stocktakeListSource, /const ok = await confirm\(\{/);
  assert.doesNotMatch(stocktakeListSource, /confirm\("/);
});

test("Owner surface count assignment dialog has a searchable ingredient list", () => {
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
  assert.match(loadingSource, /<PageSkeleton bare \/>/);
  assert.match(errorSource, /"use client"/);
  assert.match(errorSource, /import \{ ErrorPanel, type ErrorPanelProps \}/);
  assert.match(errorSource, /<ErrorPanel \{\.\.\.props\} \/>/);
});
