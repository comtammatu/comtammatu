import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

test("purchase request dialog keeps its actions visible with many lines", () => {
  const requestSource = readFileSync(
    join(
      process.cwd(),
      "app/(protected)/inventory/purchase-requests/purchase-requests-client.tsx",
    ),
    "utf8",
  );
  const frameSource = readFileSync(
    join(process.cwd(), "app/components/form/form-dialog.tsx"),
    "utf8",
  );

  assert.match(requestSource, /<AppDialog[\s\S]*variant="document"/);
  assert.match(frameSource, /variant\?: "default" \| "document"/);
  assert.match(frameSource, /grid-rows-\[auto_minmax\(0,1fr\)_auto\]/);
  assert.match(frameSource, /sm:w-\[min\(1120px,96vw\)\]/);
  assert.match(frameSource, /sm:max-h-\[95dvh\]/);
  assert.match(
    frameSource,
    /app-dialog-body flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain/,
  );
  assert.match(frameSource, /data-app-dialog-footer-slot/);
  assert.match(frameSource, /border-t bg-popover/);
  assert.match(frameSource, /export function AppDialogFooter/);
});
