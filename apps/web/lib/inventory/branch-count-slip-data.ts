import "server-only";

import { notFound, redirect } from "next/navigation";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { PERMISSION_KEYS, STAFF_ROLES } from "@comtammatu/shared/auth";
import { getAuthContextWithPermission } from "@/(protected)/inventory/_lib/auth";
import { resolveInventoryListScope } from "@/(protected)/inventory/_lib/inventory-scope";
import {
  buildCountSlipLineView,
  type CountSlipRow,
  type CountSlipStatus,
} from "./count-slip-model";
import { resolveCountSlipReviewerEmployeeId } from "./count-slip-reviewer";
import { loadCountSlipWasteIssueNumbers } from "./count-slip-waste-links";

const REVIEW_STATES = ["submitted", "needs_changes", "approved"] as const;

type CountSlipQueryLine = {
  id: number;
  ingredient_id: number;
  system_quantity: number | string | null;
  counted_quantity: number | string | null;
  entry_unit_id: number | null;
  entry_to_base_factor?: number | string | null;
  counted_base_quantity?: number | string | null;
  recount_required?: boolean;
  last_recount_round?: number;
  note: string | null;
  ingredients: unknown;
  units: unknown;
};

type UnitMeta = {
  code: string;
  toBaseFactor: number | null;
  isBase: boolean;
};

export type BranchCountSlipData = {
  tenantId: number;
  branchId: number;
  branchName: string;
  rows: CountSlipRow[];
  loadFailed: boolean;
};

function normalizeStatus(value: unknown): CountSlipStatus {
  return value === "submitted" ||
    value === "needs_changes" ||
    value === "approved"
    ? value
    : "submitted";
}

function embeddedString(value: unknown, key: "code" | "name"): string | null {
  if (Array.isArray(value)) {
    const first = value[0] as Record<string, unknown> | undefined;
    return typeof first?.[key] === "string" ? first[key] : null;
  }
  if (value && typeof value === "object") {
    const raw = (value as Record<string, unknown>)[key];
    return typeof raw === "string" ? raw : null;
  }
  return null;
}

function employeeName(value: unknown): string | null {
  const employee = Array.isArray(value) ? value[0] : value;
  if (!employee || typeof employee !== "object") return null;
  const profile = (employee as { profiles?: unknown }).profiles;
  const profileRow = Array.isArray(profile) ? profile[0] : profile;
  const fullName =
    profileRow && typeof profileRow === "object"
      ? (profileRow as { full_name?: unknown }).full_name
      : null;
  return typeof fullName === "string" ? fullName : null;
}

function unitKey(ingredientId: number, unitId: number): string {
  return `${ingredientId}:${unitId}`;
}

export async function loadBranchCountSlipData(
  routeBranchId: number,
  focusEmployeeId?: number,
): Promise<BranchCountSlipData> {
  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.INVENTORY_COUNT_APPROVE,
    routeBranchId,
  );
  if (!ctx) redirect("/");
  const { supabase, claims, userId } = ctx;
  const reviewerEmployeeId = await resolveCountSlipReviewerEmployeeId(
    claims.tenant_id,
    userId,
  );
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
  });
  if (scope.outOfScope || scope.selectedBranchId !== routeBranchId) notFound();
  const branchName =
    scope.allowedBranches.find((branch) => branch.id === routeBranchId)?.name ??
    `CN #${routeBranchId}`;

  let slipsQuery = supabase
    .from("inventory_count_slips")
    .select(
      `
      id,
      slip_number,
      branch_id,
      location_id,
      employee_id,
      shift_id,
      count_date,
      status,
      note,
      review_note,
      submitted_at,
      reviewed_at,
      shifts ( name ),
      inventory_locations ( name ),
      employees (
        employee_code,
        profiles ( full_name )
      )
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("branch_id", routeBranchId)
    .in("status", REVIEW_STATES);
  if (reviewerEmployeeId !== null) {
    slipsQuery = slipsQuery.neq("employee_id", reviewerEmployeeId);
  }
  if (focusEmployeeId !== undefined) {
    slipsQuery = slipsQuery.eq("employee_id", focusEmployeeId);
  }
  const slipsResult = await slipsQuery.order("submitted_at", {
    ascending: false,
  });
  const slipRows = slipsResult.data ?? [];
  const slipIds = slipRows
    .map((slip) => Number(slip.id))
    .filter((id) => Number.isFinite(id));
  const recountRoundBySlipId = new Map<
    number,
    { recountRound: number; lastResubmittedRound: number }
  >();
  if (slipIds.length > 0) {
    const { data: recountRows } = await supabase
      .from("inventory_count_slips")
      .select("id, recount_round, last_resubmitted_round")
      .eq("tenant_id", claims.tenant_id)
      .in("id", slipIds);
    for (const row of (recountRows ?? []) as unknown as Array<{
      id: number;
      recount_round: number;
      last_resubmitted_round: number;
    }>) {
      recountRoundBySlipId.set(Number(row.id), {
        recountRound: Number(row.recount_round ?? 0),
        lastResubmittedRound: Number(row.last_resubmitted_round ?? 0),
      });
    }
  }
  const lineResult =
    slipIds.length === 0
      ? { data: [] as Array<CountSlipQueryLine & { slip_id: number }>, error: null }
      : await supabase
          .from("inventory_count_slip_lines")
          .select(
            `
            id,
            slip_id,
            ingredient_id,
            system_quantity,
            counted_quantity,
            entry_unit_id,
            entry_to_base_factor,
            counted_base_quantity,
            recount_required,
            last_recount_round,
            note,
            ingredients ( name ),
            units!inventory_count_slip_lines_entry_unit_id_fkey ( code )
          `,
          )
          .eq("tenant_id", claims.tenant_id)
          .in("slip_id", slipIds);
  if (lineResult.error) {
    console.error("inventory.count_slips.fetch_failed", {
      code: lineResult.error.code,
    });
  }
  const linesBySlipId = new Map<number, CountSlipQueryLine[]>();
  for (const line of (lineResult.data ?? []) as Array<
    CountSlipQueryLine & { slip_id: number }
  >) {
    const list = linesBySlipId.get(line.slip_id) ?? [];
    list.push(line);
    linesBySlipId.set(line.slip_id, list);
  }
  const employeeIds = [
    ...new Set(
      slipRows
        .map((slip) => Number(slip.employee_id))
        .filter((id) => Number.isFinite(id)),
    ),
  ];
  const employeeNameById = new Map<number, string>();
  if (employeeIds.length > 0) {
    const employeesResult = await createServiceClient()
      .from("employees")
      .select("id, profiles(full_name)")
      .eq("tenant_id", claims.tenant_id)
      .in("id", employeeIds);
    if (employeesResult.error) {
      console.error("inventory.count_slips.employee_names_fetch_failed", {
        code: employeesResult.error.code,
      });
    }
    for (const employee of employeesResult.data ?? []) {
      const id = Number(employee.id);
      const name = employeeName(employee);
      if (Number.isFinite(id) && name) employeeNameById.set(id, name);
    }
  }

  const allLines = [...linesBySlipId.values()].flat();
  const wasteIssueNumberBySlipId = await loadCountSlipWasteIssueNumbers(
    supabase,
    claims.tenant_id,
    slipIds,
  );
  const ingredientIds = [
    ...new Set(
      allLines
        .map((line) => Number(line.ingredient_id))
        .filter((id) => Number.isFinite(id)),
    ),
  ];
  const unitByIngredient = new Map<string, UnitMeta>();
  const baseUnitByIngredient = new Map<number, UnitMeta>();
  if (ingredientIds.length > 0) {
    const { data: unitRows } = await supabase
      .from("ingredient_units")
      .select(
        "ingredient_id, unit_id, to_base_factor, is_base, units!ingredient_units_unit_tenant_fkey(code)",
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .in("ingredient_id", ingredientIds);
    for (const row of unitRows ?? []) {
      const ingredientId = Number(row.ingredient_id);
      const unitId = Number(row.unit_id);
      const code = embeddedString(row.units, "code");
      if (!Number.isFinite(ingredientId) || !Number.isFinite(unitId) || !code) {
        continue;
      }
      const meta: UnitMeta = {
        code,
        toBaseFactor:
          row.to_base_factor == null ? null : Number(row.to_base_factor),
        isBase: row.is_base === true,
      };
      unitByIngredient.set(unitKey(ingredientId, unitId), meta);
      if (meta.isBase) baseUnitByIngredient.set(ingredientId, meta);
    }
  }

  const liveStockByCell = new Map<string, number>();
  if (ingredientIds.length > 0) {
    const { data: stockRows } = await supabase
      .from("stock_levels")
      .select("location_id, ingredient_id, current_quantity")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", routeBranchId)
      .in("ingredient_id", ingredientIds);
    for (const row of stockRows ?? []) {
      const locId = Number(row.location_id);
      const ingId = Number(row.ingredient_id);
      if (Number.isFinite(locId) && Number.isFinite(ingId)) {
        liveStockByCell.set(`${locId}:${ingId}`, Number(row.current_quantity ?? 0));
      }
    }
  }

  const rows: CountSlipRow[] = slipRows.map((slip) => {
    const lines = linesBySlipId.get(Number(slip.id)) ?? [];
    return {
      id: slip.id,
      branchId: Number(slip.branch_id),
      locationId: Number(slip.location_id),
      slipNumber:
        typeof slip.slip_number === "string" && slip.slip_number.trim()
          ? slip.slip_number
          : `PD-${slip.id}`,
      branchName,
      locationName:
        embeddedString(slip.inventory_locations, "name") ??
        `Kho #${slip.location_id}`,
      employeeName:
        employeeNameById.get(Number(slip.employee_id)) ??
        employeeName(slip.employees) ??
        "Nhân viên",
      shiftName: embeddedString(slip.shifts, "name"),
      countDate: slip.count_date,
      status: normalizeStatus(slip.status),
      note: slip.note ?? null,
      reviewNote: slip.review_note ?? null,
      submittedAt: slip.submitted_at ?? null,
      reviewedAt: slip.reviewed_at ?? null,
      recountRound:
        recountRoundBySlipId.get(Number(slip.id))?.recountRound ?? 0,
      lastResubmittedRound:
        recountRoundBySlipId.get(Number(slip.id))?.lastResubmittedRound ?? 0,
      wasteIssueNumber: wasteIssueNumberBySlipId.get(Number(slip.id)) ?? null,
      lines: lines.map((line) => {
        const ingredientId = Number(line.ingredient_id);
        const entryUnitId =
          line.entry_unit_id == null ? null : Number(line.entry_unit_id);
        const entryUnit =
          entryUnitId != null
            ? (unitByIngredient.get(unitKey(ingredientId, entryUnitId)) ?? null)
            : null;
        const baseUnit = baseUnitByIngredient.get(ingredientId) ?? null;
        const liveStock = liveStockByCell.get(`${slip.location_id}:${ingredientId}`) ?? null;
        return buildCountSlipLineView({
          id: line.id,
          ingredientId,
          ingredientName:
            embeddedString(line.ingredients, "name") ??
            `#${line.ingredient_id}`,
          entryUnitId,
          entryUnitCode: entryUnit?.code ?? embeddedString(line.units, "code"),
          baseUnitCode: baseUnit?.code ?? null,
          toBaseFactor: entryUnit?.toBaseFactor ?? null,
          entryToBaseFactor:
            line.entry_to_base_factor != null
              ? Number(line.entry_to_base_factor)
              : null,
          countedBaseQuantity:
            line.counted_base_quantity != null
              ? Number(line.counted_base_quantity)
              : null,
          currentLiveQuantity: liveStock,
          recountRequired: line.recount_required === true,
          lastRecountRound: Number(line.last_recount_round ?? 0),
          systemQuantity: Number(line.system_quantity ?? 0),
          countedQuantity: Number(line.counted_quantity ?? 0),
          note: line.note ?? null,
        });
      }),
    };
  });

  return {
    tenantId: claims.tenant_id,
    branchId: routeBranchId,
    branchName,
    rows,
    loadFailed: slipsResult.error != null,
  };
}
