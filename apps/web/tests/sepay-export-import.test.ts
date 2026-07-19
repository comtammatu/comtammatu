import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseSepayExportRows } from "../app/(protected)/finance/_lib/sepay-export-model";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");

const headers = [
  "ID",
  "Ngân hàng",
  "Tài khoản",
  "Chủ tài khoản",
  "Tài khoản ảo",
  "Thời gian",
  "Loại giao dịch",
  "Tiền",
  "Luỹ kế",
  "Nội dung",
  "Mã thanh toán",
  "Mã tham chiếu",
];

function row(overrides: Record<string, string> = {}) {
  return {
    ID: "66922766",
    "Ngân hàng": "MB",
    "Tài khoản": "0000000000",
    "Chủ tài khoản": "MA TU",
    "Tài khoản ảo": "",
    "Thời gian": "07/07/2026 12:30:45",
    "Loại giao dịch": "Tiền ra",
    Tiền: "51.181.000",
    "Luỹ kế": "30.644.335",
    "Nội dung": "Thanh toán nhà cung cấp",
    "Mã thanh toán": "",
    "Mã tham chiếu": "REF-66922766",
    ...overrides,
  };
}

test("SePay export parser normalizes outgoing and incoming rows", () => {
  const parsed = parseSepayExportRows(headers, [
    row(),
    row({
      ID: "66922767",
      "Thời gian": "2026-07-08 08:15:00",
      "Loại giao dịch": "Tiền vào",
      Tiền: "62,000",
      "Luỹ kế": "30,706,335.00",
    }),
  ]);

  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.deepEqual(
    parsed.rows.map((item) => ({
      id: item.provider_transaction_id,
      type: item.transfer_type,
      amount: item.amount,
      balance: item.balance_after,
    })),
    [
      { id: "66922766", type: "out", amount: 51_181_000, balance: 30_644_335 },
      { id: "66922767", type: "in", amount: 62_000, balance: 30_706_335 },
    ],
  );
});

test("SePay export parser fails closed on missing columns and invalid money", () => {
  assert.deepEqual(parseSepayExportRows(["ID"], [row()]), {
    success: false,
    error:
      "File SePay thiếu cột: Tài khoản, Thời gian, Loại giao dịch, Tiền, Luỹ kế, Nội dung, Mã thanh toán, Mã tham chiếu",
  });

  const invalid = parseSepayExportRows(headers, [row({ Tiền: "không rõ" })]);
  assert.equal(invalid.success, false);
});

test("canonical bank ledger import is atomic and idempotent", () => {
  const migration = read(
    "supabase/migrations/20260719210000_create_canonical_bank_transactions.sql",
  );
  const action = read(
    "apps/web/app/(protected)/finance/bank-transactions/import-actions.ts",
  );
  const page = read(
    "apps/web/app/(protected)/finance/bank-transactions/page.tsx",
  );

  assert.match(
    migration,
    /UNIQUE \(tenant_id, provider_transaction_id\)/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.import_sepay_bank_transactions[\s\S]*FOR v_row IN[\s\S]*bank_transaction_conflict/,
  );
  assert.match(
    migration,
    /FROM public\.bank_transactions transaction[\s\S]*transaction\.occurred_at >= p_since/,
  );
  assert.match(action, /const importSchema = z\.object/);
  assert.match(action, /parseSpreadsheetFile/);
  assert.match(action, /parseSepayExportRows/);
  assert.match(action, /\.rpc\(\s*"import_sepay_bank_transactions"/);
  assert.match(action, /revalidateSurfacePath\("\/finance"\)/);
  assert.match(page, /canLinkPayments \? <SepayImportDialog \/>/);
});
