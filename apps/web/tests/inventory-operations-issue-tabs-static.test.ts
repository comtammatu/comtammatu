import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(
  "app/(protected)/inventory/operations/page.tsx",
  "utf8",
);

test("operations keeps sale consumption separate from internal issues", () => {
  assert.match(source, /value: "consumption", label: "Tiêu hao \/ xuất bán"/);
  assert.match(source, /value: "issues", label: "Xuất kho nội bộ"/);
  assert.match(
    source,
    /activeTab === "consumption"[\s\S]*scope="consumption"[\s\S]*listBasePath="\/inventory\/consumption"/,
  );
  assert.match(
    source,
    /activeTab === "issues"[\s\S]*scope="internal"[\s\S]*listBasePath="\/inventory\/issues"/,
  );
});
