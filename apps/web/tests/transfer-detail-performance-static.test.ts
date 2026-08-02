import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");

function read(path: string) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

test("transfer detail lazy-loads stock correction dialog", () => {
  const source = read(
    "apps/web/app/(protected)/inventory/transfers/[id]/transfer-detail-client.tsx",
  );

  assert.match(source, /import dynamic from "next\/dynamic"/);
  assert.match(
    source,
    /import \{ QuantityInput \} from "@\/components\/form\/domain-number-inputs"/,
  );
  assert.doesNotMatch(
    source,
    /import \{ QuantityInput \} from "@\/components\/form"/,
  );
  assert.match(
    source,
    /import type \{ CorrectionBranchOption \} from "\.\.\/\.\.\/_components\/document-stock-correction-dialog"/,
  );
  assert.match(
    source,
    /const DocumentStockCorrectionDialog = dynamic\(\s*\(\) =>\s*import\("\.\.\/\.\.\/_components\/document-stock-correction-dialog"\)/,
  );
  assert.doesNotMatch(
    source,
    /import \{\s*DocumentStockCorrectionDialog/,
  );
});
