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

  assert.match(
    sendKitchenButton ?? "",
    /onClick=\{\(\) => setSubmitIntent\("normal"\)\}/,
  );
  assert.match(sendKitchenButton ?? "", /Gửi bếp \(\{totalQuantity\}\)/);
  assert.match(
    sendKitchenButton ?? "",
    /aria-keyshortcuts="Meta\+Enter Control\+Enter"/,
  );
  assert.doesNotMatch(sendKitchenButton ?? "", /variant="outline"/);
  assert.doesNotMatch(sendKitchenButton ?? "", /variant="secondary"/);

  assert.match(
    priorityButton ?? "",
    /onClick=\{\(\) => setSubmitIntent\("priority"\)\}/,
  );
  assert.match(priorityButton ?? "", /variant="outline"/);
  assert.match(priorityButton ?? "", /<>Ưu tiên<\/>/);
  assert.doesNotMatch(priorityButton ?? "", /shadow-md/);
  assert.doesNotMatch(priorityButton ?? "", /IconFlame/);
  assert.doesNotMatch(priorityButton ?? "", /Gửi ưu tiên/);
});
