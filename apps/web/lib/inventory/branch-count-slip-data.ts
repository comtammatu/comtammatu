import "server-only";

import { notFound, redirect } from "next/navigation";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { PERMISSION_KEYS, STAFF_ROLES } from "@comtammatu/shared/auth";
import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";
import { INVENTORY_VI } from "@comtammatu/shared/messages";
import {
  getAuthContext,
  probePermission,
} from "@/(protected)/inventory/_lib/auth";
import { resolveInventoryListScope } from "@/(protected)/inventory/_lib/inventory-scope";
import {
  buildCountSlipLineView,
  type CountSlipRow,
  type CountSlipStatus,
} from "./count-slip-model";
import { resolveCountSlipReviewerEmployeeId } from "./count-slip-reviewer";
import { loadCountSlipWasteIssueNumbers } from "./count-slip-waste-links";
import type { QuantityUnitFormatRow } from "./quantity-unit-format";

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
  tierEnabled: boolean;
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
  const ctx = await getAuthContext(STAFF_ROLES);
  if (!ctx) redirect("/");
  if (
    ctx.claims.user_role !== "owner" &&
    !(await probePermission(
      ctx,
      PERMISSION_KEYS.INVENTORY_COUNT_APPROVE,
      routeBranchId,
    ))
  ) {
    redirect(`/br/${routeBranchId}/stock`);
  }
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
    UNKNOWN_LABEL_VI;

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
      recount_round,
      last_resubmitted_round
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
  const slipsResult = await slipsQuery
    .order("count_date", { ascending: false })
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false });
  const slipRows = slipsResult.data ?? [];
  const slipIds = slipRows
    .map((slip) => Number(slip.id))
    .filter((id) => Number.isFinite(id));
  const recountRoundBySlipId = new Map<
    number,
    { recountRound: number; lastResubmittedRound: number }
  >();
  for (const row of slipRows) {
    recountRoundBySlipId.set(Number(row.id), {
      recountRound: Number(row.recount_round ?? 0),
      lastResubmittedRound: Number(row.last_resubmitted_round ?? 0),
    });
  }

  const SLIP_CHUNK_SIZE = 30;
  let lineError: { code?: string; message?: string } | null = null;
  const rawLineRows: Array<CountSlipQueryLine & { slip_id: number }> = [];

  if (slipIds.length > 0) {
    for (let i = 0; i < slipIds.length; i += SLIP_CHUNK_SIZE) {
      const chunk = slipIds.slice(i, i + SLIP_CHUNK_SIZE);
      const rpcResult = await supabase.rpc("list_inventory_count_slip_lines", {
        p_slip_ids: chunk,
      });
      if (rpcResult.error) {
        lineError = rpcResult.error;
        console.error("inventory.count_slips.fetch_failed", {
          code: rpcResult.error.code,
          message: rpcResult.error.message,
        });
        break;
      }
      for (const row of rpcResult.data ?? []) {
        rawLineRows.push({
          id: Number(row.id),
          slip_id: Number(row.slip_id),
          ingredient_id: Number(row.ingredient_id),
          system_quantity: row.system_quantity,
          counted_quantity: row.counted_quantity,
          entry_unit_id: row.entry_unit_id,
          entry_to_base_factor: row.entry_to_base_factor,
          counted_base_quantity: row.counted_base_quantity,
          recount_required: row.recount_required,
          last_recount_round: row.last_recount_round,
          note: row.note,
          ingredients: { name: row.ingredient_name },
          units: row.unit_code ? { code: row.unit_code } : null,
        });
      }
    }
  }

  const linesBySlipId = new Map<number, CountSlipQueryLine[]>();
  for (const line of rawLineRows) {
    const list = linesBySlipId.get(line.slip_id) ?? [];
    list.push(line);
    linesBySlipId.set(line.slip_id, list);
  }

  const locationIds = [
    ...new Set(
      slipRows
        .map((slip) => Number(slip.location_id))
        .filter((id) => Number.isFinite(id)),
    ),
  ];
  const shiftIds = [
    ...new Set(
      slipRows
        .map((slip) => Number(slip.shift_id))
        .filter((id) => Number.isFinite(id)),
    ),
  ];

  const [locationsRes, shiftsRes] = await Promise.all([
    locationIds.length === 0
      ? Promise.resolve({ data: [] as Array<{ id: number; name: string }> })
      : supabase
          .from("inventory_locations")
          .select("id, name")
          .eq("tenant_id", claims.tenant_id)
          .in("id", locationIds),
    shiftIds.length === 0
      ? Promise.resolve({ data: [] as Array<{ id: number; name: string }> })
      : supabase
          .from("shifts")
          .select("id, name")
          .eq("tenant_id", claims.tenant_id)
          .in("id", shiftIds),
  ]);

  const locationNameById = new Map<number, string>();
  for (const loc of locationsRes.data ?? []) {
    locationNameById.set(Number(loc.id), loc.name);
  }
  const shiftNameById = new Map<number, string>();
  for (const shift of shiftsRes.data ?? []) {
    shiftNameById.set(Number(shift.id), shift.name);
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
  const displayUnitsByIngredient = new Map<number, QuantityUnitFormatRow[]>();
  if (ingredientIds.length > 0) {
    const { data: unitRows } = await supabase
      .from("ingredient_units")
      .select(
        "ingredient_id, unit_id, to_base_factor, is_base, sort_order, units!ingredient_units_unit_tenant_fkey(code)",
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
      if (meta.toBaseFactor !== null && meta.toBaseFactor > 0) {
        const displayUnits = displayUnitsByIngredient.get(ingredientId) ?? [];
        displayUnits.push({
          unit_code: code,
          to_base_factor: meta.toBaseFactor,
          is_base: meta.isBase,
          is_active: true,
          sort_order: Number(row.sort_order ?? 0),
        });
        displayUnitsByIngredient.set(ingredientId, displayUnits);
      }
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
        liveStockByCell.set(
          `${locId}:${ingId}`,
          Number(row.current_quantity ?? 0),
        );
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
          : INVENTORY_VI.documentNumberPending,
      branchName,
      locationName:
        locationNameById.get(Number(slip.location_id)) ?? UNKNOWN_LABEL_VI,
      employeeName:
        employeeNameById.get(Number(slip.employee_id)) ?? "Nhân viên",
      shiftName:
        slip.shift_id != null
          ? (shiftNameById.get(Number(slip.shift_id)) ?? null)
          : null,
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
        const liveStock =
          liveStockByCell.get(`${slip.location_id}:${ingredientId}`) ?? null;
        return buildCountSlipLineView({
          id: line.id,
          ingredientId,
          ingredientName:
            embeddedString(line.ingredients, "name") ?? UNKNOWN_LABEL_VI,
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
          displayUnits: displayUnitsByIngredient.get(ingredientId) ?? [],
          recountRequired: line.recount_required === true,
          lastRecountRound: Number(line.last_recount_round ?? 0),
          systemQuantity: Number(line.system_quantity ?? 0),
          countedQuantity: Number(line.counted_quantity ?? 0),
          note: line.note ?? null,
        });
      }),
    };
  });

  const [branchSettingRes, systemSettingRes] = await Promise.all([
    supabase
      .from("branch_settings")
      .select("value")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", routeBranchId)
      .eq("key", "inventory_waste_tier_enabled")
      .maybeSingle(),
    supabase
      .from("system_settings")
      .select("value")
      .eq("tenant_id", claims.tenant_id)
      .eq("key", "inventory_waste_tier_enabled")
      .maybeSingle(),
  ]);

  const rawTierEnabled =
    branchSettingRes.data?.value ?? systemSettingRes.data?.value;
  const tierEnabled =
    rawTierEnabled !== undefined && rawTierEnabled !== null
      ? rawTierEnabled === "true"
      : true;

  return {
    tenantId: claims.tenant_id,
    branchId: routeBranchId,
    branchName,
    rows: lineError != null ? [] : rows,
    loadFailed: slipsResult.error != null || lineError != null,
    tierEnabled,
  };
}
