import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const runnerPageSource = readFileSync(
  join(process.cwd(), "app/(protected)/br/[branchId]/runner/page.tsx"),
  "utf8",
);

test("Runner page uses customer-facing Màn gọi số vocabulary", () => {
  assert.match(runnerPageSource, /eyebrow: MODULE_LABELS_VI\.runner/);
  assert.match(runnerPageSource, /sectionTitle: "Mời nhận món"/);
  assert.match(runnerPageSource, /sequence: "Thứ tự"/);
  assert.match(runnerPageSource, /\.in\("status", \["ready", "served"\]\)/);
  assert.match(runnerPageSource, /item\.lane === "served"/);
  assert.doesNotMatch(runnerPageSource, /eyebrow: "Runner"/);
  assert.doesNotMatch(runnerPageSource, /Chưa có đơn Runner/);
  assert.doesNotMatch(
    runnerPageSource,
    /\.in\("status", \["pending", "preparing"\]\)/,
  );
  assert.doesNotMatch(runnerPageSource, /aria-label=\{`Runner/);
});
