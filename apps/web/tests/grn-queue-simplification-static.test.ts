import test from "node:test";
import { readSql, assertSqlMatch } from "./_lib/active-sql.ts";


const readRoot = (path: string) =>
  readSql(process.cwd(), path);

const migration = readRoot(
  "supabase/migrations/20260730100000_auto_grn_draft_queue.sql",
);

test("receivable PO status creates one active GRN draft", () => {
  assertSqlMatch(migration, /CREATE TRIGGER ensure_grn_draft_after_po_status/);
  assertSqlMatch(migration,
    /new\.status = ANY \(ARRAY\['sent'::text, 'approved'::text, 'partially_received'::text\]\)/,
  );
  assertSqlMatch(migration, /CREATE FUNCTION private\.ensure_grn_draft_for_po\(/);
});
