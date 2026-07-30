import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(import.meta.dirname, "../../..");
const migration = readFileSync(
  resolve(
    repoRoot,
    "supabase/migrations/20260728170006_harden_greenfield_advisor_findings.sql",
  ),
  "utf8",
);
const postTopology = readFileSync(
  resolve(
    repoRoot,
    "supabase/migrations/20260728170211_reenforce_advisor_harden_after_topology.sql",
  ),
  "utf8",
);
const topology = readFileSync(
  resolve(
    repoRoot,
    "supabase/migrations/20260728190000_inventory_topology_physical_qc_cleanup.sql",
  ),
  "utf8",
);

test("advisor harden revokes anon EXECUTE on the two flagged SECURITY DEFINER RPCs", () => {
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.next_inventory_doc_number\(bigint, text\)\s+FROM PUBLIC, anon/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.attach_supplier_invoice_vat_evidence\(bigint, text\)\s+FROM PUBLIC, anon/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.next_inventory_doc_number\(bigint, text\)\s+TO authenticated, service_role/,
  );
  assert.match(
    migration,
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
    assert.match(
      migration,
      new RegExp(
        `CREATE POLICY ${table}_no_client_access\\s+ON public\\.${table}\\s+FOR ALL TO anon, authenticated\\s+USING \\(false\\)\\s+WITH CHECK \\(false\\)`,
      ),
    );
  }
});

test("advisor harden wraps stock issue auth helpers as initplans", () => {
  assert.equal(
    [...migration.matchAll(/created_by = \(SELECT auth\.uid\(\)\)/g)].length,
    5,
  );
  assert.equal(
    [...migration.matchAll(/tenant_id = \(SELECT public\.auth_tenant_id\(\)\)/g)]
      .length,
    5,
  );
  assert.doesNotMatch(migration, /created_by = auth\.uid\(\)/);
  assert.doesNotMatch(migration, /tenant_id = public\.auth_tenant_id\(\)/);
});

test("advisor harden drops the duplicate branches composite unique", () => {
  assert.match(
    migration,
    /ALTER TABLE public\.branches\s+DROP CONSTRAINT IF EXISTS branches_id_tenant_key/,
  );
});

test("post-topology reenforce keeps anon revoke, initplans, and duplicate drop", () => {
  assert.match(
    postTopology,
    /REVOKE ALL ON FUNCTION public\.next_inventory_doc_number\(bigint, text\)\s+FROM PUBLIC, anon/,
  );
  assert.equal(
    [...postTopology.matchAll(/created_by = \(SELECT auth\.uid\(\)\)/g)].length,
    5,
  );
  assert.match(
    postTopology,
    /DROP CONSTRAINT IF EXISTS branches_id_tenant_key/,
  );
});

test("topology security hardening survives the later duplicate-unique cleanup", () => {
  assert.match(
    topology,
    /ADD CONSTRAINT branches_id_tenant_key\s+UNIQUE \(id, tenant_id\)/,
  );
  assert.match(postTopology, /DROP CONSTRAINT IF EXISTS branches_id_tenant_key/);
  assert.match(
    postTopology,
    /REVOKE ALL ON FUNCTION public\.next_inventory_doc_number\(bigint, text\)\s+FROM PUBLIC, anon/,
  );
  assert.match(
    postTopology,
    /created_by = \(SELECT auth\.uid\(\)\)/,
  );
});
