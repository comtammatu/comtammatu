import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { getSiteKindLabelVi } from "@comtammatu/shared/labels";
import { getStatusBadgeMeta } from "../app/components/status-badge";
import { tStatus } from "../app/(protected)/inventory/_lib/dictionary";

test("unknown runtime values never echo technical keys", () => {
  assert.equal(getStatusBadgeMeta("order", "new_backend_status").label, "Không xác định");
  assert.equal(tStatus("new_backend_status"), "Không xác định");
  assert.equal(getSiteKindLabelVi("new_site_kind"), "Không xác định");
});

test("sent keeps its domain-specific purchase order meaning", () => {
  assert.equal(getStatusBadgeMeta("purchase-order", "sent").label, "Đã duyệt");
  assert.equal(getStatusBadgeMeta("inventory", "sent").label, "Đã gửi");
});

test("error surfaces hide digest and blank notifications use a fallback", () => {
  const globalError = readFileSync(join(process.cwd(), "app/global-error.tsx"), "utf8");
  const errorPanel = readFileSync(
    join(process.cwd(), "app/components/error-panel.tsx"),
    "utf8",
  );
  const notify = readFileSync(
    join(process.cwd(), "../../packages/ui/src/lib/notify.ts"),
    "utf8",
  );

  assert.doesNotMatch(globalError, /\{\s*error\.digest\b/);
  assert.doesNotMatch(errorPanel, /\{\s*error\.digest\b/);
  assert.match(errorPanel, /action=["']\/api\/auth\/signout["']/);
  assert.match(errorPanel, /ACTIONS_VI\.signInAgain/);
  assert.match(notify, /msg\?\.trim\(\)\s*\|\|\s*FALLBACK_ERROR/);
  assert.match(notify, /error\(err\)\.trim\(\)\s*\|\|\s*FALLBACK_ERROR/);
  assert.match(notify, /error\?\.trim\(\)\s*\|\|\s*FALLBACK_ERROR/);
});
