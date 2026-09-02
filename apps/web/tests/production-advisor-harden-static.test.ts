import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch, looksLikeDump } from "./_lib/active-sql.ts";

const repoRoot = resolve(import.meta.dirname, "../../..");
const migration = readSql(repoRoot, "supabase/migrations/20260728170006_harden_greenfield_advisor_findings.sql");
const postTopology = readSql(repoRoot, "supabase/migrations/20260728170211_reenforce_advisor_harden_after_topology.sql");
const topology = readSql(repoRoot, "supabase/migrations/20260728190000_inventory_topology_physical_qc_cleanup.sql");

test("Production advisor harden revokes anon EXECUTE on the two flagged SECURITY DEFINER RPCs", () => {
  assertSqlMatch(migration,
    /REVOKE ALL ON FUNCTION public\.next_inventory_doc_number\(bigint, text\)\s+FROM PUBLIC, anon/,
  );
  assertSqlMatch(migration,
    /REVOKE ALL ON FUNCTION public\.attach_supplier_invoice_vat_evidence\(bigint, text\)\s+FROM PUBLIC, anon/,
  );
  assertSqlMatch(migration,
    /GRANT EXECUTE ON FUNCTION public\.next_inventory_doc_number\(bigint, text\)\s+TO authenticated, service_role/,
  );
  assertSqlMatch(migration,
    /GRANT EXECUTE ON FUNCTION public\.attach_supplier_invoice_vat_evidence\(bigint, text\)\s+TO authenticated, service_role/,
  );
});

test("advisor harden adds deny-all policies for RLS-on zero-policy tables", () => {
  for (const table of [
    "archive_run_log",
    "feedback_rate_buckets",
    "kds_ticket_events",
    "order_daily_counters",
    "reconcile_run_log",
    "self_order_rate_buckets",
    "self_order_request_operations",
    "tax_invoice_buyer_requests",
  ]) {
    assertSqlMatch(migration,
      new RegExp(
        `CREATE POLICY ${table}_no_client_access\\s+ON public\\.${table}\\s+FOR ALL TO anon, authenticated\\s+USING \\(false\\)\\s+WITH CHECK \\(false\\)`,
      ),
    );
  }
});

test("advisor harden wraps stock issue auth helpers as initplans", () => {
  if (looksLikeDump(migration) || looksLikeDump(postTopology) || looksLikeDump(topology)) return;
  assert.equal(
    [...migration.matchAll(/created_by = \(SELECT auth\.uid\(\)\)/g)].length,
    5,
  );
  assert.equal(
    [...migration.matchAll(/tenant_id = \(SELECT public\.auth_tenant_id\(\)\)/g)]
      .length,
    5,
  );
  assertSqlNotMatch(migration, /created_by = auth\.uid\(\)/);
  assertSqlNotMatch(migration, /tenant_id = public\.auth_tenant_id\(\)/);
});

test("advisor harden drops the duplicate branches composite unique", () => {
  assertSqlMatch(migration,
    /ALTER TABLE public\.branches\s+DROP CONSTRAINT IF EXISTS branches_id_tenant_key/,
  );
});

test("post-topology reenforce keeps anon revoke, initplans, and duplicate drop", () => {
  if (looksLikeDump(migration) || looksLikeDump(postTopology) || looksLikeDump(topology)) return;
  assertSqlMatch(postTopology,
    /REVOKE ALL ON FUNCTION public\.next_inventory_doc_number\(bigint, text\)\s+FROM PUBLIC, anon/,
  );
  assert.equal(
    [...postTopology.matchAll(/created_by = \(SELECT auth\.uid\(\)\)/g)].length,
    5,
  );
  assertSqlMatch(postTopology,
    /DROP CONSTRAINT IF EXISTS branches_id_tenant_key/,
  );
});

test("topology security hardening survives the later duplicate-unique cleanup", () => {
  assertSqlMatch(topology,
    /ADD CONSTRAINT branches_id_tenant_key\s+UNIQUE \(id, tenant_id\)/,
  );
  assertSqlMatch(postTopology, /DROP CONSTRAINT IF EXISTS branches_id_tenant_key/);
  assertSqlMatch(postTopology,
    /REVOKE ALL ON FUNCTION public\.next_inventory_doc_number\(bigint, text\)\s+FROM PUBLIC, anon/,
  );
  assertSqlMatch(postTopology,
    /created_by = \(SELECT auth\.uid\(\)\)/,
  );
});
