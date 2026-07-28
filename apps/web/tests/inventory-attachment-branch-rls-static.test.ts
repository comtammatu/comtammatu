import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");

function readRepo(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

const ownerGrnLine = readRepo(
  "apps/web/app/(protected)/inventory/grn/[id]/views/grn-line-row.tsx",
);
const branchGrnLine = readRepo(
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/_components/grn-line-sheet.tsx",
);
const wastePhotoUpload = readRepo(
  "apps/web/app/(protected)/inventory/_components/waste-photo-upload.tsx",
);

test("GRN rejection evidence uses document-line paths and image inputs", () => {
  assert.match(
    ownerGrnLine,
    /folder=\{`grn\/\$\{grnId\}\/rejected\/\$\{line\.lineId\}`\}/,
  );
  assert.match(
    branchGrnLine,
    /folder=\{`grn\/\$\{grn\.id\}\/rejected\/\$\{line\.lineId\}`\}/,
  );
  assert.match(ownerGrnLine, /acceptTypes="image"/);
  assert.match(branchGrnLine, /acceptTypes="image"/);
});

test("pre-persist waste evidence carries an authorized branch in its path", () => {
  assert.match(
    wastePhotoUpload,
    /folder=\{`branches\/\$\{branchId\}\/waste\/\$\{issueId\}`\}/,
  );
});
