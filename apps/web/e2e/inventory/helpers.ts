/**
 * Inventory E2E helpers — service-role Supabase utilities for seeding and
 * verifying Kho Tổng / Bếp Trung Tâm data in tests.
 *
 * Uses the same pattern as e2e/helpers/supabase.ts (service-role client,
 * cleanup closures returned alongside data).
 *
 * Required env vars (same .env.test.local as other E2E suites):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   E2E_CASHIER_EMAIL / E2E_CASHIER_PASSWORD   — used for auth.setup.ts
 *   E2E_INVENTORY_MANAGER_EMAIL (optional)     — warehouse_manager at a CW
 *   E2E_INVENTORY_MANAGER_PASSWORD (optional)  — defaults to E2E_CASHIER_PASSWORD
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@comtammatu/database";

// ─── Service client ───────────────────────────────────────────────────────────

type ServiceClient = ReturnType<typeof createServiceClient>;

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for E2E tests",
    );
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ─── Tenant resolution ────────────────────────────────────────────────────────

export async function resolveTenantId(
  supabase: ServiceClient,
): Promise<number> {
  const { data, error } = await supabase
    .from("branches")
    .select("tenant_id")
    .limit(1)
    .single();
  if (error || !data)
    throw new Error(`Cannot resolve tenant_id: ${error?.message}`);
  return data.tenant_id;
}

// ─── Branch helpers ───────────────────────────────────────────────────────────

export type BranchKind = "central_warehouse" | "central_kitchen" | "branch";

export interface TestBranch {
  id: number;
  name: string;
  kind: BranchKind;
  tenantId: number;
}

/**
 * Finds or creates a branch of the requested kind.
 * Prefer existing branches to avoid polluting the tenant with duplicates.
 */
export async function ensureBranch(
  supabase: ServiceClient,
  tenantId: number,
  kind: BranchKind,
  labelSuffix = "",
): Promise<TestBranch> {
  const name = `E2E ${kind}${labelSuffix ? ` ${labelSuffix}` : ""}`;

  const { data: existing } = await supabase
    .from("branches")
    .select("id, name, branch_kind, tenant_id")
    .eq("tenant_id", tenantId)
    .eq("branch_kind", kind)
    .eq("name", name)
    .maybeSingle();

  if (existing) {
    return { id: existing.id, name: existing.name, kind, tenantId };
  }

  const { data: inserted, error } = await supabase
    .from("branches")
    .insert({
      tenant_id: tenantId,
      name,
      branch_kind: kind,
      is_active: true,
    })
    .select("id, name")
    .single();

  if (error || !inserted) {
    throw new Error(
      `Failed to create E2E branch (${kind}${labelSuffix}): ${error?.message}`,
    );
  }

  return { id: inserted.id, name: inserted.name, kind, tenantId };
}

// ─── Ingredient helpers ───────────────────────────────────────────────────────

export interface TestIngredient {
  id: number;
  name: string;
  unit: string;
}

export async function ensureIngredient(
  supabase: ServiceClient,
  tenantId: number,
  nameSuffix = "",
): Promise<TestIngredient> {
  const name = `E2E Ingredient${nameSuffix ? ` ${nameSuffix}` : ""}`;

  const { data: existing } = await supabase
    .from("ingredients")
    .select("id, name, unit")
    .eq("tenant_id", tenantId)
    .eq("name", name)
    .maybeSingle();

  if (existing) return existing;

  const { data: inserted, error } = await supabase
    .from("ingredients")
    .insert({
      tenant_id: tenantId,
      name,
      unit: "kg",
      purchase_unit: "kg",
      measure_unit: "kg",
      purchase_to_measure_factor: 1,
      unit_cost: 10000,
      is_active: true,
    })
    .select("id, name, unit")
    .single();

  if (error || !inserted) {
    throw new Error(`Failed to create E2E ingredient: ${error?.message}`);
  }

  return inserted;
}

// ─── Supplier helpers ─────────────────────────────────────────────────────────

export async function ensureSupplier(
  supabase: ServiceClient,
  tenantId: number,
): Promise<number> {
  const name = "E2E Supplier";

  const { data: existing } = await supabase
    .from("suppliers")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("name", name)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: inserted, error } = await supabase
    .from("suppliers")
    .insert({ tenant_id: tenantId, name, is_active: true })
    .select("id")
    .single();

  if (error || !inserted) {
    throw new Error(`Failed to create E2E supplier: ${error?.message}`);
  }

  return inserted.id;
}

// ─── Inventory location helpers ───────────────────────────────────────────────

export async function ensureInventoryLocation(
  supabase: ServiceClient,
  tenantId: number,
  branchId: number,
  locationKind:
    | "receive"
    | "issue"
    | "storage"
    | "warehouse"
    | "kitchen" = "storage",
): Promise<number> {
  const name = `E2E Loc ${branchId} ${locationKind}`;

  const { data: branch, error: branchErr } = await supabase
    .from("branches")
    .select("branch_kind")
    .eq("tenant_id", tenantId)
    .eq("id", branchId)
    .single();

  if (branchErr || !branch) {
    throw new Error(
      `Failed to resolve branch for E2E location: ${branchErr?.message}`,
    );
  }

  const desiredLocationKind =
    locationKind === "kitchen"
      ? "kitchen"
      : locationKind === "receive" && branch.branch_kind === "central_kitchen"
        ? "kitchen"
        : "warehouse";

  let existingQuery = supabase
    .from("inventory_locations")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("branch_id", branchId)
    .eq("is_active", true);

  if (locationKind === "receive") {
    existingQuery = existingQuery.eq("is_default_receive", true);
  } else if (locationKind === "issue") {
    existingQuery = existingQuery.eq("is_default_issue", true);
  } else {
    existingQuery = existingQuery.eq("location_kind", desiredLocationKind);
  }

  const { data: existing } = await existingQuery
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing) return existing.id;

  const isDefaultReceive = locationKind === "receive";
  const isDefaultIssue = locationKind === "issue";

  const { data: inserted, error } = await supabase
    .from("inventory_locations")
    .insert({
      tenant_id: tenantId,
      branch_id: branchId,
      name,
      code: `E2E-${branchId}-${locationKind}`,
      location_kind: desiredLocationKind,
      is_active: true,
      is_default_receive: isDefaultReceive,
      is_default_issue: isDefaultIssue,
      is_default_consumption: false,
      sort_order: 999,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    throw new Error(
      `Failed to create E2E inventory location: ${error?.message}`,
    );
  }

  return inserted.id;
}

// ─── Stock level seeding ──────────────────────────────────────────────────────

/**
 * Upsert a stock_levels row so transfers have something to ship.
 */
export async function seedStockLevel(
  supabase: ServiceClient,
  tenantId: number,
  branchId: number,
  ingredientId: number,
  qty: number,
  locationId: number,
): Promise<void> {
  const { error } = await supabase.from("stock_levels").upsert(
    {
      tenant_id: tenantId,
      branch_id: branchId,
      ingredient_id: ingredientId,
      current_quantity: qty,
      avg_unit_cost: 10000,
      location_id: locationId,
    },
    { onConflict: "ingredient_id,branch_id,location_id,tenant_id" },
  );
  if (error) throw new Error(`Failed to seed stock_levels: ${error.message}`);
}

// ─── Stock level reader ───────────────────────────────────────────────────────

export async function getStockLevel(
  supabase: ServiceClient,
  tenantId: number,
  branchId: number,
  ingredientId: number,
  locationId?: number,
): Promise<number | null> {
  const query = supabase
    .from("stock_levels")
    .select("current_quantity")
    .eq("tenant_id", tenantId)
    .eq("branch_id", branchId)
    .eq("ingredient_id", ingredientId);

  if (locationId != null) {
    const { data } = await query.eq("location_id", locationId).maybeSingle();
    return data ? Number(data.current_quantity) : null;
  }

  const { data } = await query;
  if (!data || data.length === 0) return null;

  return data.reduce((sum, row) => sum + Number(row.current_quantity ?? 0), 0);
}

// ─── GRN helpers ──────────────────────────────────────────────────────────────

export interface TestGrn {
  id: number;
  grnNumber: string;
  tenantId: number;
  branchId: number;
  ingredientId: number;
  supplierId: number;
  cleanup: () => Promise<void>;
}

/**
 * Creates a draft GRN + one line item via the service-role client.
 * Bypasses Server Action auth — for seeding only.
 */
export async function createTestGrnDraft(
  supabase: ServiceClient,
  opts: {
    tenantId: number;
    branchId: number;
    supplierId: number;
    ingredientId: number;
    quantity?: number;
    unitCost?: number;
    createdByUserId: string;
  },
): Promise<TestGrn> {
  const grnNumber = `GRN-E2E-${Date.now()}`;
  const qty = opts.quantity ?? 10;
  const cost = opts.unitCost ?? 10000;

  const { data: grn, error: grnErr } = await supabase
    .from("goods_received_notes")
    .insert({
      tenant_id: opts.tenantId,
      branch_id: opts.branchId,
      supplier_id: opts.supplierId,
      grn_number: grnNumber,
      status: "draft",
      created_by: opts.createdByUserId,
    })
    .select("id")
    .single();

  if (grnErr || !grn) {
    throw new Error(`Failed to create test GRN: ${grnErr?.message}`);
  }

  const { error: lineErr } = await supabase.from("grn_items").insert({
    tenant_id: opts.tenantId,
    grn_id: grn.id,
    ingredient_id: opts.ingredientId,
    received_quantity: qty,
    unit: "kg",
    unit_cost: cost,
    total_cost: qty * cost,
    quality_status: "accepted",
  });

  if (lineErr) {
    throw new Error(`Failed to create test GRN line: ${lineErr.message}`);
  }

  const cleanup = async () => {
    const sb = createServiceClient();
    await sb
      .from("stock_movements")
      .delete()
      .eq("grn_id", grn.id)
      .eq("tenant_id", opts.tenantId);
    await sb
      .from("grn_items")
      .delete()
      .eq("grn_id", grn.id)
      .eq("tenant_id", opts.tenantId);
    await sb
      .from("goods_received_notes")
      .delete()
      .eq("id", grn.id)
      .eq("tenant_id", opts.tenantId);
  };

  return {
    id: grn.id,
    grnNumber,
    tenantId: opts.tenantId,
    branchId: opts.branchId,
    ingredientId: opts.ingredientId,
    supplierId: opts.supplierId,
    cleanup,
  };
}

// ─── Transfer helpers ─────────────────────────────────────────────────────────

export interface TestTransfer {
  id: number;
  transferNumber: string;
  tenantId: number;
  fromBranchId: number;
  toBranchId: number;
  ingredientId: number;
  cleanup: () => Promise<void>;
}

/**
 * Creates a draft transfer + one line item via service-role.
 * Use this to seed transfers that need to be progressed through status steps.
 */
export async function createTestTransferDraft(
  supabase: ServiceClient,
  opts: {
    tenantId: number;
    fromBranchId: number;
    toBranchId: number;
    ingredientId: number;
    quantity?: number;
    createdByUserId: string;
    fromLocationId?: number;
    toLocationId?: number;
  },
): Promise<TestTransfer> {
  const transferNumber = `TRF-E2E-${Date.now()}`;
  const qty = opts.quantity ?? 5;

  const { data: transfer, error: tErr } = await supabase
    .from("stock_transfers")
    .insert({
      tenant_id: opts.tenantId,
      from_branch_id: opts.fromBranchId,
      to_branch_id: opts.toBranchId,
      transfer_number: transferNumber,
      status: "draft",
      created_by: opts.createdByUserId,
      from_location_id: opts.fromLocationId ?? null,
      to_location_id: opts.toLocationId ?? null,
    })
    .select("id")
    .single();

  if (tErr || !transfer) {
    throw new Error(`Failed to create test transfer: ${tErr?.message}`);
  }

  const { error: lineErr } = await supabase
    .from("stock_transfer_items")
    .insert({
      tenant_id: opts.tenantId,
      transfer_id: transfer.id,
      ingredient_id: opts.ingredientId,
      quantity: qty,
      unit: "kg",
    });

  if (lineErr) {
    throw new Error(`Failed to create test transfer line: ${lineErr.message}`);
  }

  const cleanup = async () => {
    const sb = createServiceClient();
    await sb
      .from("stock_movements")
      .delete()
      .eq("transfer_id", transfer.id)
      .eq("tenant_id", opts.tenantId);
    await sb
      .from("stock_transfer_items")
      .delete()
      .eq("transfer_id", transfer.id)
      .eq("tenant_id", opts.tenantId);
    await sb
      .from("stock_transfers")
      .delete()
      .eq("id", transfer.id)
      .eq("tenant_id", opts.tenantId);
  };

  return {
    id: transfer.id,
    transferNumber,
    tenantId: opts.tenantId,
    fromBranchId: opts.fromBranchId,
    toBranchId: opts.toBranchId,
    ingredientId: opts.ingredientId,
    cleanup,
  };
}

// ─── Transfer status reader ───────────────────────────────────────────────────

export async function getTransferStatus(
  supabase: ServiceClient,
  tenantId: number,
  transferId: number,
): Promise<string | null> {
  const { data } = await supabase
    .from("stock_transfers")
    .select("status")
    .eq("id", transferId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return data?.status ?? null;
}

// ─── GRN status reader ────────────────────────────────────────────────────────

export async function getGrnStatus(
  supabase: ServiceClient,
  tenantId: number,
  grnId: number,
): Promise<string | null> {
  const { data } = await supabase
    .from("goods_received_notes")
    .select("status")
    .eq("id", grnId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return data?.status ?? null;
}

// ─── User resolution ──────────────────────────────────────────────────────────

export interface TestUser {
  userId: string;
  email: string;
  tenantId: number;
  branchId: number | null;
  role: string;
}

/**
 * Resolves a profile row from an auth user email using the service client.
 * Mirrors resolveProfileByEmail in e2e/helpers/supabase.ts.
 */
export async function resolveUserByEmail(
  supabase: ServiceClient,
  email: string,
): Promise<TestUser> {
  const {
    data: { users },
    error: listErr,
  } = await supabase.auth.admin.listUsers();

  if (listErr) throw new Error(`Failed to list auth users: ${listErr.message}`);

  const authUser = users.find((u) => u.email === email);
  if (!authUser) throw new Error(`Test user not found: ${email}`);

  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("id, tenant_id, branch_id, position_id")
    .eq("id", authUser.id)
    .single();

  if (pErr || !profile)
    throw new Error(`Profile not found for ${email}: ${pErr?.message}`);

  const { data: position, error: posErr } = profile.position_id
    ? await supabase
        .from("positions")
        .select("legacy_role_code")
        .eq("id", profile.position_id)
        .maybeSingle()
    : { data: null, error: null };

  if (posErr) {
    throw new Error(`Position not found for ${email}: ${posErr.message}`);
  }

  return {
    userId: profile.id,
    email,
    tenantId: profile.tenant_id,
    branchId: profile.branch_id,
    role: position?.legacy_role_code ?? "",
  };
}

/**
 * Resolves the inventory manager user (warehouse_manager scoped to a CW).
 * Falls back to the cashier user (with elevated service-role writes) for
 * test environments that have only one test account seeded.
 */
export async function resolveInventoryManagerUser(
  supabase: ServiceClient,
): Promise<TestUser> {
  const managerEmail = process.env.E2E_INVENTORY_MANAGER_EMAIL;
  if (managerEmail) {
    return resolveUserByEmail(supabase, managerEmail);
  }

  // Fallback: discover any warehouse_manager in the tenant.
  const { data: positions, error: posErr } = await supabase
    .from("positions")
    .select("id")
    .eq("legacy_role_code", "warehouse_manager");

  if (posErr) {
    throw new Error(
      `Failed to resolve warehouse_manager positions: ${posErr.message}`,
    );
  }

  const positionIds = (positions ?? []).map((position) => position.id);
  if (positionIds.length === 0) {
    throw new Error(
      "No warehouse_manager position found. " +
        "Set E2E_INVENTORY_MANAGER_EMAIL in .env.test.local or seed a warehouse_manager account.",
    );
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, tenant_id, branch_id, position_id")
    .in("position_id", positionIds)
    .limit(1)
    .maybeSingle();

  if (error || !profile) {
    throw new Error(
      "No warehouse_manager profile found. " +
        "Set E2E_INVENTORY_MANAGER_EMAIL in .env.test.local or seed a warehouse_manager account.",
    );
  }

  const {
    data: { users },
  } = await supabase.auth.admin.listUsers();
  const authUser = users.find((u) => u.id === profile.id);

  return {
    userId: profile.id,
    email: authUser?.email ?? "",
    tenantId: profile.tenant_id,
    branchId: profile.branch_id,
    role: "warehouse_manager",
  };
}
