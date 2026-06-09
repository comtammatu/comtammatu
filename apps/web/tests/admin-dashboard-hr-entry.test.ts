import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const dashboardSource = readFileSync(
  join(process.cwd(), "app/(protected)/admin/dashboard/page.tsx"),
  "utf8",
);

test("Admin dashboard keeps an ACL-scoped HR shortcut", () => {
  assert.match(
    dashboardSource,
    /canAccess\(claims\.user_role, "hr"\)/,
    "HR shortcut must stay gated by module ACL",
  );
  assert.match(
    dashboardSource,
    /href: MODULE_ACL\.hr\.path/,
    "HR shortcut must use the canonical HR path from MODULE_ACL",
  );
  assert.match(
    dashboardSource,
    /title: MODULE_ACL\.hr\.label/,
    "HR shortcut must use the canonical HR label from MODULE_ACL",
  );
  assert.match(
    dashboardSource,
    /hrCta: "Mở nhân sự"/,
    "HR shortcut copy should keep the direct admin action wording",
  );
  assert.match(
    dashboardSource,
    /ctaLabel: ADMIN_DASHBOARD_COPY\.hrCta/,
    "HR shortcut should be visible as a direct admin action",
  );
});
