import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../", import.meta.url);

function read(rel: string): string {
  return readFileSync(new URL(rel, root), "utf8");
}

test("/branches lists sales Chi nhánh only and does not launch central sites", () => {
  const page = read("app/(protected)/branches/page.tsx");
  const table = read("app/(protected)/branches/branch-table.tsx");
  const actions = read("app/(protected)/branches/actions.ts");

  assert.match(page, /\.eq\("branch_kind", "branch"\)/);
  assert.doesNotMatch(page, /branch_kind,/);

  assert.doesNotMatch(table, /resolveSiteKind/);
  assert.doesNotMatch(table, /getSiteKindLabelVi/);
  assert.doesNotMatch(table, /central_supply|central_kitchen/);
  assert.doesNotMatch(table, /\/inventory\?branch=/);
  assert.match(table, /href=\{`\/br\/\$\{branch\.id\}`\}/);

  assert.match(actions, /branch_kind: "branch"/);
  assert.match(actions, /\.eq\("branch_kind", "branch"\)/);
  assert.doesNotMatch(
    actions,
    /update\(\{[\s\S]*branch_kind: "branch"[\s\S]*\}\)/,
  );
});
