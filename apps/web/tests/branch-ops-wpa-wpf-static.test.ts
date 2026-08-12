import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readWeb(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function readRepo(path: string): string {
  return readFileSync(join(process.cwd(), "../..", path), "utf8");
}

test("WP-A daily summary has no operator close ceremony", () => {
  const client = readWeb(
    "app/(protected)/br/[branchId]/(operator)/close-day/close-day-client.tsx",
  );
  const labels = readRepo("packages/shared/src/labels/vi.ts");
  assert.doesNotMatch(client, /closeBranchDay|AppDetailFooter|confirm\(/);
  assert.match(labels, /branch_close_day:\s*"Báo cáo tổng hợp ngày"/);
  assert.doesNotMatch(labels, /branch_close_day:\s*"Chốt ngày"/);
  assert.ok(
    !existsSync(
      join(
        process.cwd(),
        "app/(protected)/br/[branchId]/(operator)/close-day/actions.ts",
      ),
    ),
  );
});

test("WP-C pos_void_requests is SELECT-only for authenticated", () => {
  const grants = readRepo(
    "supabase/migrations/20260808091754_harden_pos_void_requests_grants.sql",
  );
  assert.match(
    grants,
    /REVOKE ALL ON TABLE public\.pos_void_requests FROM PUBLIC, anon, authenticated/,
  );
  assert.match(
    grants,
    /GRANT SELECT ON TABLE public\.pos_void_requests TO authenticated/,
  );
});

test("WP-C pos_void_requests select policy avoids locked auth_is_owner EXECUTE", () => {
  const createQueue = readRepo(
    "supabase/migrations/20260808085549_shift_leader_void_request_queue.sql",
  );
  const fix = readRepo(
    "supabase/migrations/20260808134718_remove_auth_is_owner_from_authenticated_policies.sql",
  );
  assert.match(createQueue, /pos_void_requests_select/);
  assert.match(createQueue, /public\.auth_is_owner\(auth\.uid\(\)\)/);
  assert.match(fix, /ALTER POLICY pos_void_requests_select/);
  assert.match(fix, /public\.has_permission\(branch_id, 'pos:use'\)/);
  assert.match(fix, /public\.has_permission\(branch_id, 'settings:branch'\)/);
  assert.doesNotMatch(
    fix,
    /ALTER POLICY pos_void_requests_select[\s\S]*auth_is_owner/,
  );
});

test("WP-C void request queue is wired into POS", () => {
  const inner = readWeb(
    "app/(protected)/br/[branchId]/pos/pos-desktop-inner.tsx",
  );
  const actions = readWeb(
    "app/(protected)/br/[branchId]/pos/void-request-actions.ts",
  );
  assert.match(inner, /VoidRequestQueue/);
  assert.match(actions, /request_pos_void_after_paid/);
  assert.match(actions, /resolve_pos_void_request/);
});

test("WP-D allows_photo flows through HR + PWA tasks", () => {
  const migration = readRepo(
    "supabase/migrations/20260808085917_position_shift_task_photo_and_kds_default_station.sql",
  );
  const hrClient = readWeb("app/(protected)/hr/position-tasks-client.tsx");
  const tasksClient = readWeb("lib/staff-runtime/tasks/tasks-client.tsx");
  assert.match(migration, /allows_photo/);
  assert.match(migration, /self_service_attach_task_photo/);
  assert.match(migration, /Quầy lên món/);
  assert.match(hrClient, /allowsPhoto/);
  assert.match(tasksClient, /attachChecklistTaskPhoto/);
});

test("WP-F roster star calls set_shift_assignment_leader", () => {
  const rosterClient = readWeb("lib/hr/roster/roster-week-client.tsx");
  const rosterDayCell = readWeb("lib/hr/roster/roster-day-cell.tsx");
  const rosterEditor = readWeb("lib/hr/roster/use-roster-week-editor.ts");
  const rosterActions = readWeb("lib/hr/roster/actions.ts");
  assert.match(rosterClient, /handleLeaderToggle/);
  assert.match(rosterDayCell, /IconStar/);
  assert.match(rosterEditor, /setShiftAssignmentLeader/);
  assert.match(rosterActions, /set_shift_assignment_leader/);
});
