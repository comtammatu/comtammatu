import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";
import {
  KDS_ACTIVE_TICKET_STATUSES,
  KDS_CLEANUP_RETENTION_HOURS,
  getKdsCleanupCutoffIso,
  getKdsResetBeforeLocalDate,
} from "../cleanup";

function repoPath(path: string): string {
  return fileURLToPath(new URL(`../../../../../${path}`, import.meta.url));
}

test("KDS cleanup cutoff is exactly six hours before now", () => {
  const now = new Date("2026-05-23T10:15:30.000Z");

  assert.equal(KDS_CLEANUP_RETENTION_HOURS, 6);
  assert.equal(getKdsCleanupCutoffIso(now), "2026-05-23T04:15:30.000Z");
});

test("KDS reset date follows Asia/Ho_Chi_Minh midnight", () => {
  assert.equal(
    getKdsResetBeforeLocalDate(new Date("2026-05-22T16:59:59.000Z")),
    "2026-05-22",
  );
  assert.equal(
    getKdsResetBeforeLocalDate(new Date("2026-05-22T17:00:00.000Z")),
    "2026-05-23",
  );
});

test("KDS cleanup only targets active queue statuses", () => {
  assert.deepEqual(
    [...KDS_ACTIVE_TICKET_STATUSES],
    ["pending", "preparing", "ready"],
  );
});

test("KDS maintenance cron is registered for every six hours in ICT", () => {
  const vercelJson = JSON.parse(
    readFileSync(repoPath("apps/web/vercel.json"), "utf8"),
  ) as {
    crons?: Array<{ path?: string; schedule?: string }>;
  };

  const cron = vercelJson.crons?.find(
    (entry) => entry.path === "/api/cron/kds-maintenance",
  );

  assert.deepEqual(cron, {
    path: "/api/cron/kds-maintenance",
    schedule: "0 5,11,17,23 * * *",
  });
});

test("KDS maintenance route calls the system cleanup RPC", () => {
  const route = readFileSync(
    repoPath("apps/web/app/api/cron/kds-maintenance/route.ts"),
    "utf8",
  );

  assert.match(route, /cleanup_kds_tickets_as_system/);
  assert.doesNotMatch(route, /\.from\("orders"\)/);
  assert.doesNotMatch(route, /\.from\("order_items"\)/);
});
