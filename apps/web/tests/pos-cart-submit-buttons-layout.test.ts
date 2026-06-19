import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const source = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/pos/_components/cart-pane.tsx",
  ),
  "utf8",
);

const submitButtonsBlock =
  /<div className="grid gap-2 sm:grid-cols-2">([\s\S]*?)<\/div>/.exec(
    source,
  )?.[1] ?? "";
const submitButtons = submitButtonsBlock.match(/<Button[\s\S]*?<\/Button>/g);

test("POS cart makes Gửi bếp the primary submit action and keeps Ưu tiên secondary", () => {
  assert.ok(submitButtons);
  assert.equal(submitButtons.length, 2);

  const [sendKitchenButton, priorityButton] = submitButtons;

  // Normal submit fires immediately — no confirm dialog tax on every
  // order. Only the priority path keeps its confirm dialog.
  assert.match(sendKitchenButton ?? "", /onClick=\{\(\) => onSubmitOrder\(\)\}/);
  assert.doesNotMatch(sendKitchenButton ?? "", /setSubmitIntent\("normal"\)/);
  assert.match(
    sendKitchenButton ?? "",
    /\{messages\.pos\.pendingDraft\.submitKitchen\(totalQuantity\)\}/,
  );
  assert.match(
    sendKitchenButton ?? "",
    /aria-keyshortcuts="Meta\+Enter Control\+Enter"/,
  );
  assert.doesNotMatch(sendKitchenButton ?? "", /variant="outline"/);
  assert.doesNotMatch(sendKitchenButton ?? "", /variant="secondary"/);

  assert.match(
    priorityButton ?? "",
    /onClick=\{\(\) => void handlePrioritySubmit\(\)\}/,
  );
  assert.match(priorityButton ?? "", /variant="outline"/);
  assert.match(priorityButton ?? "", /<>\{messages\.pos\.pendingDraft\.priority\}<\/>/);
  assert.doesNotMatch(priorityButton ?? "", /shadow-md/);
  assert.doesNotMatch(priorityButton ?? "", /IconFlame/);
  assert.doesNotMatch(priorityButton ?? "", /Gửi ưu tiên/);
});
