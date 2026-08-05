import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(process.cwd(), "../..");
const synonymsPath = resolve(repoRoot, "docs/ref/terminology-synonyms.json");

test("terminology synonyms file parses and seeds finance bans", () => {
  const raw = JSON.parse(readFileSync(synonymsPath, "utf8"));
  assert.ok(Array.isArray(raw.entries));
  assert.ok(raw.entries.length >= 5);
  const operating = raw.entries.find((e) => e.term === "operating_result");
  assert.equal(operating?.label_vi, "Kết quả kinh doanh");
  assert.ok(operating?.forbidden?.includes("Kết quả vận hành"));
  const bank = raw.entries.find((e) => e.term === "bank_book_balance");
  assert.equal(bank?.label_vi, "Tiền tài khoản");
  assert.ok(bank?.forbidden?.includes("Tiền trong ngân hàng"));
});

test("lint-terminology self-test and clean scan exit 0", () => {
  const selfTest = spawnSync(
    "node",
    ["scripts/lint-terminology.mjs", "--self-test"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.equal(selfTest.status, 0, selfTest.stderr || selfTest.stdout);

  const lint = spawnSync("node", ["scripts/lint-terminology.mjs"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(lint.status, 0, lint.stderr || lint.stdout);
});
