import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const readWeb = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "..", path), "utf8");

const readRoot = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../../..", path), "utf8");

const readMigrationChain = () => {
  const migrationDir = resolve(
    import.meta.dirname,
    "../../../supabase/migration-archive",
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

  assert.match(source, /PROCUREMENT_SITE_KINDS/);
  assert.match(
    source,
    /\.in\(\s*"branch_kind",\s*\[\.\.\.PROCUREMENT_SITE_KINDS\]\s*\)/,
  );
  assert.doesNotMatch(source, /\.eq\(\s*"branch_kind",\s*"branch"\s*\)/);
  assert.match(source, /central_supply/);
  assert.match(source, /central_kitchen/);
});

test("central site location defaults and seed migration exists", () => {
  const migration = readRoot(
    "supabase/migration-archive/20260727190000_central_procurement_and_vat_evidence.sql",
  );

  assert.match(
    migration,
    /v_branch_kind NOT IN \('branch', 'central_supply', 'central_kitchen'\)/,
  );
  assert.match(
    migration,
    /NEW\.branch_kind IN \('branch', 'central_supply', 'central_kitchen'\)/,
  );
  assert.match(migration, /Kho Tổng/);
  assert.match(migration, /Bếp Trung Tâm/);
  assert.match(migration, /WHERE NOT EXISTS/);
  assert.doesNotMatch(
    migration,
    /INSERT INTO public\.branches[\s\S]*ON CONFLICT \(name, tenant_id\) DO UPDATE/,
  );
  assert.match(migration, /vat_invoice_attachment_path/);
  assert.match(migration, /vat_invoice_attachment_required/);
  assert.match(migration, /attach_supplier_invoice_vat_evidence/);
  assert.match(migration, /supplier-invoice-attachments/);
});

test("supplier payment action maps vat_invoice_attachment_required", () => {
  const action = readWeb(
    "app/(protected)/finance/supplier-invoice-actions.ts",
  );
  const client = readWeb(
    "app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx",
  );

  assert.match(action, /vat_invoice_attachment_required/);
  assert.match(action, /attach_supplier_invoice_vat_evidence/);
  assert.match(action, /attachSupplierInvoiceVatEvidence/);
  assert.match(
    action,
    /anyPermission:\s*\[[\s\S]*FINANCE_AP_PAY[\s\S]*PROCUREMENT_INVOICE_CREATE/,
  );
  assert.match(
    action,
    /Vui lòng đính kèm ít nhất 1 file HĐ GTGT trước khi ghi nhận thanh toán/,
  );
  assert.match(client, /vatInvoiceAttachmentPath/);
  assert.match(client, /paymentBlockedNoVatAttachment/);
  assert.match(client, /supplier-invoice-attachments/);
  assert.match(client, /canAttachVatEvidence/);
  assert.match(client, /vatAttachmentOptionalHint/);
});

test("VAT evidence RPC authorizes Accountant with a delegated invoice permission", () => {
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

  // getUser() maps Auth session_not_found → "Auth session missing!" while the
  // cookie JWT still authorizes PostgREST — GRN/invoice RSC loaders then
  // returned "Không có quyền" though purchase-orders (loadAuthState) worked.
  // Far-from-expiry Auth liveness lives in loadAuthState →
  // probeAuthSessionLiveness (redirect), not here.
  const getAuthStart = source.indexOf("export const getAuthContext");
  const getAuthEnd = source.indexOf("type PermissionLike", getAuthStart);
  assert.ok(getAuthStart >= 0 && getAuthEnd > getAuthStart);
  const getAuthBody = source.slice(getAuthStart, getAuthEnd);

  assert.match(getAuthBody, /await supabase\.auth\.getSession\(\)/);
  assert.doesNotMatch(getAuthBody, /supabase\.auth\.getUser\(/);
  assert.doesNotMatch(
    getAuthBody,
    /Promise\.all\(\[\s*supabase\.auth\.getUser/,
  );
  assert.doesNotMatch(getAuthBody, /probeAuthSessionLiveness/);
  assert.match(getAuthBody, /user:\s*session\.user/);
});
