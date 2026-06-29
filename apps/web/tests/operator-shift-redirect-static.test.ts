import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");
const exists = (path: string) => existsSync(resolve(repoRoot, path));

const shiftRedirects = [
  ["clock", "/employee/clock"],
  ["tasks", "/employee/tasks"],
  ["schedule", "/employee/schedule"],
  ["leave", "/employee/leave"],
  ["payslip", "/employee/payslip"],
  ["profile", "/employee/profile"],
] as const;

test("operator shift detail routes temporarily redirect to employee pages", () => {
  for (const [segment, target] of shiftRedirects) {
    const path = `apps/web/app/(protected)/br/[branchId]/(operator)/shift/${segment}/page.tsx`;

    assert.equal(exists(path), true, path);

    const source = read(path);
    assert.match(source, /from "next\/navigation"/, path);
    assert.ok(source.includes(`redirect("${target}")`), `${path} -> ${target}`);
  }
});

test("operator shift landing routes through branch-scoped detail routes", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/page.tsx",
  );

  for (const segment of ["clock", "tasks", "schedule", "profile"] as const) {
    assert.ok(
      source.includes(`href={\`/br/${"${branchId}"}/shift/${segment}\`}`),
      segment,
    );
  }
});
