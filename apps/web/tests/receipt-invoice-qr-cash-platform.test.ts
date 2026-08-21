import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(process.cwd(), "../..");
const migration = readFileSync(
  join(
    root,
    "supabase/migrations/20260821044052_receipt_invoice_qr_cash_platform_bind.sql",
  ),
  "utf8",
);

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("cash invoice binding re-touches receipt payload after HĐĐT queue", () => {
  const cashBind = sourceBetween(
    migration,
    "CREATE OR REPLACE FUNCTION public.confirm_cash_payment_with_invoice_binding(\n  p_order_id bigint,\n  p_cash_received numeric,\n  p_invoice_payload jsonb",
    "CREATE OR REPLACE FUNCTION public.confirm_platform_payment_with_invoice_binding(",
  );

  assert.match(
    cashBind,
    /PERFORM private\.upsert_tax_invoice_issue_job\([\s\S]*UPDATE public\.print_jobs[\s\S]*payload = COALESCE\(payload, '\{\}'::jsonb\) - 'invoice_qr'/,
    "cash binding must queue HĐĐT before re-firing receipt invoice QR attach",
  );
  assert.match(
    cashBind,
    /invoiceSnapshot',\s*v_payload/,
    "cash binding must persist invoiceSnapshot like VietQR/platform",
  );
  assert.match(
    cashBind,
    /job_type = 'receipt'/,
    "re-touch must target the receipt print job only",
  );
});

test("platform invoice binding re-touches receipt payload after HĐĐT queue", () => {
  const platformBind = sourceBetween(
    migration,
    "CREATE OR REPLACE FUNCTION public.confirm_platform_payment_with_invoice_binding(",
    "COMMENT ON FUNCTION public.confirm_cash_payment_with_invoice_binding",
  );

  assert.match(
    platformBind,
    /PERFORM private\.upsert_tax_invoice_issue_job\([\s\S]*UPDATE public\.print_jobs[\s\S]*payload = COALESCE\(payload, '\{\}'::jsonb\) - 'invoice_qr'/,
    "platform binding must queue HĐĐT before re-firing receipt invoice QR attach",
  );
  assert.match(
    platformBind,
    /confirm_platform_payment\(p_order_id\)/,
    "platform binding still completes prepaid tender first",
  );
});
