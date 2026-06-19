import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const dashboardSource = readFileSync(
  join(process.cwd(), "app/(protected)/admin/dashboard/page.tsx"),
  "utf8",
);
const navConfigSource = readFileSync(
  join(process.cwd(), "../../packages/shared/src/auth/nav-config.ts"),
  "utf8",
);

test("Admin dashboard keeps workspace navigation in the nav source", () => {
  assert.match(
    navConfigSource,
    /moduleKey: "hr"/,
    "HR workspace must stay in the shared workspace nav",
  );
  assert.match(
    dashboardSource,
    /workQueueTitle/,
    "dashboard should stay focused on owner work, not workspace launchers",
  );
  assert.doesNotMatch(
    dashboardSource,
    /canAccess\(role, "hr"\)/,
    "workspace shortcuts belong to shared nav, not the dashboard page",
  );
});
