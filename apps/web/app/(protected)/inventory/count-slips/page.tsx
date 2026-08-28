import { redirect } from "next/navigation";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { PERMISSION_KEYS, STAFF_ROLES } from "@comtammatu/shared/auth";
import { getAuthContextWithPermission } from "@/(protected)/inventory/_lib/auth";
import { CountSlipsClient } from "./count-slips-client";
import {
  buildCountSlipLineView,
  type CountSlipRow,
  type CountSlipStatus,
} from "@lib/inventory/count-slip-model";
import { resolveCountSlipReviewerEmployeeId } from "@lib/inventory/count-slip-reviewer";

export const instant = false;

const REVIEW_STATES = ["submitted", "needs_changes", "approved"] as const;

function normalizeStatus(value: unknown): CountSlipStatus {
  return value === "submitted" ||
    value === "needs_changes" ||
    value === "approved"
    ? value
    : "submitted";
}

function embeddedName(value: unknown): string | null {
  return embeddedString(value, "name");
}

function embeddedCode(value: unknown): string | null {
  return embeddedString(value, "code");
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

interface CountSlipQueryLine {
  id: number;
  ingredient_id: number;
  system_quantity: number | string | null;
  counted_quantity: number | string | null;
  entry_unit_id: number | null;
  entry_to_base_factor?: number | string | null;
  counted_base_quantity?: number | string | null;
  note: string | null;
  ingredients: unknown;
  units: unknown;
}

interface UnitMeta {
  code: string;
  toBaseFactor: number | null;
  isBase: boolean;
}

function unitKey(ingredientId: number, unitId: number): string {
  return `${ingredientId}:${unitId}`;
}

export async function CountSlipsPageContent({
  initialSlipId = null,
}: {
  initialSlipId?: number | null;
} = {}) {
  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.INVENTORY_COUNT_APPROVE,
  );
  if (!ctx) redirect("/");
  const { supabase, claims, userId } = ctx;
  const reviewerEmployeeId = await resolveCountSlipReviewerEmployeeId(
    claims.tenant_id,
    userId,
  );

  // RLS limits these rows to branches where the manager holds
  // `inventory:count_approve`; the employee-facing RLS hides system quantity.
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
      branches ( name ),
      shifts ( name ),
      inventory_locations ( name ),
      employees (
        employee_code,
        profiles ( full_name )
      )
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .in("status", REVIEW_STATES);
  if (reviewerEmployeeId !== null) {
    slipsQuery = slipsQuery.neq("employee_id", reviewerEmployeeId);
  }
  const { data: slips, error: slipsError } = await slipsQuery.order(
    "submitted_at",
    { ascending: false },
  );
  if (slipsError) {
    console.error("inventory.count_slips.fetch_failed", {
      code: slipsError.code,
    });
    throw new Error("inventory.count_slips.load_failed");
  }

  const slipRows = slips ?? [];
  const slipIds = slipRows
    .map((slip) => Number(slip.id))
    .filter((id) => Number.isFinite(id));
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
    throw new Error("inventory.count_slips.load_failed");
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
    // Review access is permission-gated above; this lookup only bypasses
    // self-scoped profile RLS for slips already visible to the reviewer.
    const { data: employeeRows, error: employeeRowsError } =
      await createServiceClient()
        .from("employees")
        .select("id, profiles(full_name)")
        .eq("tenant_id", claims.tenant_id)
        .in("id", employeeIds);

    if (employeeRowsError) {
      console.error("inventory.count_slips.employee_names_fetch_failed", {
        code: employeeRowsError.code,
      });
    }

    for (const employee of employeeRows ?? []) {
      const id = Number(employee.id);
      const name = employeeName(employee);
      if (Number.isFinite(id) && name) employeeNameById.set(id, name);
    }
  }

  const allLines = [...linesBySlipId.values()].flat();
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
    const { data: unitRows, error: unitRowsError } = await supabase
      .from("ingredient_units")
      .select(
        "ingredient_id, unit_id, to_base_factor, is_base, units!ingredient_units_unit_tenant_fkey(code)",
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .in("ingredient_id", ingredientIds);
    if (unitRowsError) {
      console.error("inventory.count_slips.units_fetch_failed", {
        code: unitRowsError.code,
      });
      throw new Error("inventory.count_slips.load_failed");
    }

    for (const row of unitRows ?? []) {
      const ingredientId = Number(row.ingredient_id);
      const unitId = Number(row.unit_id);
      const code = embeddedCode(row.units);
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
      .select("branch_id, location_id, ingredient_id, current_quantity")
      .eq("tenant_id", claims.tenant_id)
      .in("ingredient_id", ingredientIds);
    for (const row of stockRows ?? []) {
      const brId = Number(row.branch_id);
      const locId = Number(row.location_id);
      const ingId = Number(row.ingredient_id);
      if (Number.isFinite(brId) && Number.isFinite(locId) && Number.isFinite(ingId)) {
        liveStockByCell.set(`${brId}:${locId}:${ingId}`, Number(row.current_quantity ?? 0));
      }
    }
  }

  const rows: CountSlipRow[] = slipRows.map((slip) => {
    const lines = linesBySlipId.get(Number(slip.id)) ?? [];
    return {
      id: slip.id,
      slipNumber:
        typeof slip.slip_number === "string" && slip.slip_number.trim()
          ? slip.slip_number
          : `PD-${slip.id}`,
      branchName: embeddedName(slip.branches) ?? `CN #${slip.branch_id}`,
      locationName:
        embeddedName(slip.inventory_locations) ?? `Kho #${slip.location_id}`,
      employeeName:
        employeeNameById.get(Number(slip.employee_id)) ??
        employeeName(slip.employees) ??
        "Nhân viên",
      shiftName: embeddedName(slip.shifts),
      countDate: slip.count_date,
      status: normalizeStatus(slip.status),
      note: slip.note ?? null,
      reviewNote: slip.review_note ?? null,
      submittedAt: slip.submitted_at ?? null,
      reviewedAt: slip.reviewed_at ?? null,
      lines: lines.map((line) => {
        const ingredient = embeddedName(line.ingredients);
        const ingredientId = Number(line.ingredient_id);
        const entryUnitId =
          line.entry_unit_id == null ? null : Number(line.entry_unit_id);
        const entryUnit =
          entryUnitId !== null
            ? (unitByIngredient.get(unitKey(ingredientId, entryUnitId)) ?? null)
            : null;
        const baseUnit = baseUnitByIngredient.get(ingredientId) ?? null;
        const liveStock = liveStockByCell.get(`${slip.branch_id}:${slip.location_id}:${ingredientId}`) ?? null;
        return buildCountSlipLineView({
          id: line.id,
          ingredientId,
          ingredientName: ingredient ?? `#${line.ingredient_id}`,
          entryUnitId,
          entryUnitCode: entryUnit?.code ?? embeddedCode(line.units),
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
          systemQuantity: Number(line.system_quantity ?? 0),
          countedQuantity: Number(line.counted_quantity ?? 0),
          note: line.note ?? null,
        });
      }),
    };
  });

  const resolvedSlipId =
    initialSlipId != null && rows.some((row) => row.id === initialSlipId)
      ? initialSlipId
      : null;

  return (
    <CountSlipsClient initial={rows} initialSlipId={resolvedSlipId} />
  );
}

function parsePositiveId(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export default async function CountSlipsPage({
  searchParams,
}: {
  searchParams?: Promise<{ slipId?: string | string[] }>;
}) {
  const params = searchParams ? await searchParams : {};
  const initialSlipId = parsePositiveId(params.slipId);
  return <CountSlipsPageContent initialSlipId={initialSlipId} />;
}
