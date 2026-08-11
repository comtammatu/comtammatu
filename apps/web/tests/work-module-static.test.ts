import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const webRoot = process.cwd();

function readRepo(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function readWeb(path: string): string {
  return readFileSync(join(webRoot, path), "utf8");
}

function existsRepo(path: string): boolean {
  return existsSync(resolve(repoRoot, path));
}

test("Work module ACL path is /work", () => {
  const moduleAcl = readRepo("packages/shared/src/auth/module-acl.ts");
  assert.match(moduleAcl, /work:\s*\{[\s\S]*?path:\s*"\/work"/);
});

test("Work pages and compose census exist", () => {
  assert.ok(
    existsRepo("apps/web/app/(protected)/work/page.tsx"),
    "work page must exist",
  );
  assert.ok(
    existsRepo("apps/web/app/(protected)/work/tasks/[id]/page.tsx"),
    "work task detail page must exist",
  );

  const archetypes = readRepo("scripts/page-archetypes.mjs");
  assert.match(
    archetypes,
    /"apps\/web\/app\/\(protected\)\/work\/page\.tsx": "LIST"/,
  );
  assert.match(
    archetypes,
    /"apps\/web\/app\/\(protected\)\/work\/tasks\/\[id\]\/page\.tsx": "DETAIL"/,
  );
});

test("Control home attention includes work:mine-due bucket", () => {
  const attention = readWeb("app/_lib/control-home-attention.ts");
  const controlSurface = readWeb("lib/messages/control-surface.ts");

  assert.match(attention, /id:\s*"work:mine-due"/);
  assert.match(attention, /loadWorkAttention/);
  assert.match(controlSurface, /workMineDue:\s*"Việc đến hạn \/ quá hạn"/);
});

test("Staff runtime exposes /work CTA when can_access_workspace", () => {
  const staffPage = readWeb("lib/staff-runtime/page.tsx");
  assert.match(staffPage, /can_access_workspace/);
  assert.match(staffPage, /href="\/work"/);
  assert.match(staffPage, /openWorkCta/);
});

test("Work board uses HTML5 drag-and-drop handlers", () => {
  const board = readWeb("app/(protected)/work/_components/work-board.tsx");
  assert.match(board, /onDragStart=/);
  assert.match(board, /onDrop=/);
});

test("Work permission key is registered", () => {
  const permissions = readRepo("packages/shared/src/auth/permissions.ts");
  assert.match(permissions, /WORK_MANAGE: "work:manage"/);
});
