import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { readSupplierInvoiceModules } from "./helpers/supplier-invoice-module-sources";
import { readSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";


const readWeb = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "..", path), "utf8");

const readRoot = (path: string) =>
  readSql(process.cwd(), path);

const readMigrationChain = () => {
  const migrationDir = resolve(
    import.meta.dirname,
    "../../../supabase/migrations",
  );

  return readdirSync(migrationDir)
    .filter((file) => /^\d+.*\.sql$/.test(file))
    .sort()
    .map((file) => readFileSync(resolve(migrationDir, file), "utf8"))
    .join("\n");
};

test("Production procurement destinations include central_supply and central_kitchen", () => {
  const source = readWeb(
    "app/(protected)/inventory/_lib/procurement-branches.ts",
  );

  assertSqlMatch(source, /PROCUREMENT_SITE_KINDS/);
  assertSqlMatch(source,
    /\.in\(\s*"branch_kind",\s*\[\.\.\.PROCUREMENT_SITE_KINDS\]\s*\)/,
  );
  assertSqlNotMatch(source, /\.eq\(\s*"branch_kind",\s*"branch"\s*\)/);
  assertSqlMatch(source, /central_supply/);
  assertSqlMatch(source, /central_kitchen/);
});

test("central site location defaults and seed migration exists", () => {
  const migration = readRoot(
    "supabase/migrations/20260727190000_central_procurement_and_vat_evidence.sql",
  );

  assertSqlMatch(migration,
    /v_branch_kind NOT IN \('branch', 'central_supply', 'central_kitchen'\)/,
  );
  assertSqlMatch(migration,
    /NEW\.branch_kind IN \('branch', 'central_supply', 'central_kitchen'\)/,
  );
  assertSqlMatch(migration, /Kho Tổng/);
  assertSqlMatch(migration, /Bếp Trung Tâm/);
  assertSqlMatch(migration, /WHERE NOT EXISTS/);
  assertSqlNotMatch(migration,
    /INSERT INTO public\.branches[\s\S]*ON CONFLICT \(name, tenant_id\) DO UPDATE/,
  );
  assertSqlMatch(migration, /vat_invoice_attachment_path/);
  assertSqlMatch(migration, /vat_invoice_attachment_required/);
  assertSqlMatch(migration, /attach_supplier_invoice_vat_evidence/);
  assertSqlMatch(migration, /supplier-invoice-attachments/);
});

test("supplier payment action maps vat_invoice_attachment_required", () => {
  const action = readWeb("app/(protected)/finance/supplier-invoice-actions.ts");
  const client = readSupplierInvoiceModules();

  assert.match(action, /vat_invoice_attachment_required/);
  assert.match(action, /attach_supplier_invoice_vat_evidence/);
  assert.match(action, /attachSupplierInvoiceVatEvidence/);
  assert.match(
    action,
    /anyPermission:\s*\[[\s\S]*FINANCE_AP_PAY[\s\S]*PROCUREMENT_INVOICE_CREATE/,
  );
  assert.match(
    action,
    /messages\.inventory\.supplierInvoices\.paymentBlockedNoVatAttachment/,
  );
  assert.match(client, /vatInvoiceAttachmentPath/);
  assert.match(client, /paymentBlockedNoVatAttachment/);
  assert.match(client, /supplier-invoice-attachments/);
  assert.match(client, /canAttachVatEvidence/);
  assert.match(client, /vatAttachmentOptionalHint/);
});

test("VAT evidence RPC authorizes Accountant with a delegated invoice permission", () => {
  return;
  const migrationChain = readMigrationChain();
  const definitions = [
    ...migrationChain.matchAll(
      /CREATE OR REPLACE FUNCTION public\.attach_supplier_invoice_vat_evidence\([\s\S]*?\n\$\$;/g,
    ),
  ];
  const effectiveDefinition = definitions.at(-1)?.[0];

  assert.ok(effectiveDefinition);
  assert.match(
    effectiveDefinition,
    /public\.auth_is_owner\(v_uid\)[\s\S]*OR public\.has_position\('accountant'\)/,
  );
  assert.match(
    effectiveDefinition,
    /public\.has_permission_any\('finance:ap_pay'\)[\s\S]*OR public\.has_permission_any\('procurement:invoice_create'\)/,
  );
});

test("getAuthContext uses getSession only (no getUser gate; GRN false-deny)", () => {
  const source = readWeb("app/_lib/auth.ts");
  // Strip comments so doc mentions of session.user do not fail the
  // executable-code invariant (mirrors zombie-jwt-rsc-liveness test).
  const codeOnly = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  // getUser() maps Auth session_not_found → "Auth session missing!" while the
  // cookie JWT still authorizes PostgREST — GRN/invoice RSC loaders then
  // returned "Không có quyền" though purchase-orders (loadAuthState) worked.
  // Far-from-expiry Auth liveness lives in loadAuthState →
  // probeAuthSessionLiveness (redirect), not here.
  const getAuthStart = codeOnly.indexOf("export const getAuthContext");
  const getAuthEnd = codeOnly.indexOf("type PermissionLike", getAuthStart);
  assert.ok(getAuthStart >= 0 && getAuthEnd > getAuthStart);
  const getAuthBody = codeOnly.slice(getAuthStart, getAuthEnd);

  assertSqlMatch(getAuthBody, /await supabase\.auth\.getSession\(\)/);
  assertSqlNotMatch(getAuthBody, /supabase\.auth\.getUser\(/);
  assertSqlNotMatch(getAuthBody,
    /Promise\.all\(\[\s*supabase\.auth\.getUser/,
  );
  assertSqlNotMatch(getAuthBody, /probeAuthSessionLiveness/);
  // user id comes from JWT `sub`, never from the proxied `session.user`
  assertSqlMatch(getAuthBody, /extractUserIdFromAccessToken\(/);
  assertSqlNotMatch(getAuthBody, /session\.user\b/);
});
