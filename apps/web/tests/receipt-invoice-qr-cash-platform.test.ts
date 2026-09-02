import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch, sqlIndexOf, looksLikeDump } from "./_lib/active-sql.ts";

const root = join(process.cwd(), "../..");
const brokenMigration = readSql(root, "supabase/migrations/20260821044052_receipt_invoice_qr_cash_platform_bind.sql");
const fixMigration = readSql(root, "supabase/migrations/20260821123047_receipt_invoice_qr_enqueue_after_bind.sql").replace(/\r\n/g, "\n");
const baselineGuard = readSql(root, "supabase/migrations/20260902162918_baseline.sql");

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = sqlIndexOf(source, start);
  if (startIndex < 0 && looksLikeDump(source)) return source;
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = sqlIndexOf(source, end, startIndex + start.length);
  if (endIndex < 0 && looksLikeDump(source)) return source.slice(startIndex);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("print job evidence guard blocks payload mutation after insert", () => {
  assertSqlMatch(baselineGuard,
    /CREATE FUNCTION private\.guard_print_job_evidence\(\)[\s\S]*NEW\.payload IS DISTINCT FROM OLD\.payload[\s\S]*RAISE EXCEPTION 'print_job_evidence_immutable'/,
  );
  assertSqlMatch(baselineGuard,
    /CREATE TRIGGER trg_print_jobs_evidence_immutable BEFORE UPDATE ON public\.print_jobs/,
  );
});

test("broken cash/platform bind migration mutated receipt payload after enqueue", () => {
  assertSqlMatch(brokenMigration,
    /UPDATE public\.print_jobs[\s\S]*payload = COALESCE\(payload, '\{\}'::jsonb\) - 'invoice_qr'/,
  );
});

test("cash invoice binding re-enqueues receipt after HĐĐT queue", () => {
  const cashBind = sourceBetween(
    fixMigration,
    "CREATE OR REPLACE FUNCTION public.confirm_cash_payment_with_invoice_binding(\n  p_order_id bigint,\n  p_cash_received numeric,\n  p_invoice_payload jsonb",
    "CREATE OR REPLACE FUNCTION public.confirm_platform_payment_with_invoice_binding(",
  );

  assertSqlMatch(
    cashBind,
    /PERFORM private\.upsert_tax_invoice_issue_job\([\s\S]*DELETE FROM public\.print_jobs[\s\S]*enqueue_receipt_print/,
    "cash binding must queue HĐĐT then replace the premature receipt via INSERT",
  );
  assertSqlNotMatch(
    cashBind,
    /UPDATE public\.print_jobs[\s\S]*payload/,
    "cash binding must not mutate immutable print_jobs.payload",
  );
  assertSqlMatch(
    cashBind,
    /invoiceSnapshot',\s*v_payload/,
    "cash binding must persist invoiceSnapshot like VietQR/platform",
  );
  assertSqlMatch(
    cashBind,
    /job_type = 'receipt'[\s\S]*status = 'pending'/,
    "re-enqueue must only drop the pending receipt created in this confirm",
  );
});

test("platform invoice binding re-enqueues receipt after HĐĐT queue", () => {
  const platformBind = sourceBetween(
    fixMigration,
    "CREATE OR REPLACE FUNCTION public.confirm_platform_payment_with_invoice_binding(",
    "COMMENT ON FUNCTION public.confirm_cash_payment_with_invoice_binding",
  );

  assertSqlMatch(
    platformBind,
    /PERFORM private\.upsert_tax_invoice_issue_job\([\s\S]*DELETE FROM public\.print_jobs[\s\S]*enqueue_receipt_print/,
    "platform binding must queue HĐĐT then replace the premature receipt via INSERT",
  );
  assertSqlNotMatch(
    platformBind,
    /UPDATE public\.print_jobs[\s\S]*payload/,
    "platform binding must not mutate immutable print_jobs.payload",
  );
  assertSqlMatch(
    platformBind,
    /confirm_platform_payment\(p_order_id\)/,
    "platform binding still completes prepaid tender first",
  );
});
