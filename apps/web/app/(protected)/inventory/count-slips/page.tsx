import { redirect } from "next/navigation";
import { PERMISSION_KEYS, STAFF_ROLES } from "@comtammatu/shared/auth";
import { getAuthContextWithPermission } from "@/(protected)/inventory/_lib/auth";
import {
  CountSlipsClient,
  type CountSlipRow,
  type CountSlipStatus,
} from "./count-slips-client";
import { buildCountSlipLineView } from "./line-view-model";

export const dynamic = "force-dynamic";

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

interface CountSlipsPageContentProps {
  routeBranchId?: number;
  embedded?: boolean;
  basePath?: string;
}

interface CountSlipQueryLine {
  id: number;
  ingredient_id: number;
  system_quantity: number | string | null;
  counted_quantity: number | string | null;
  entry_unit_id: number | null;
  note: string | null;
  ingredients: unknown;
  units: unknown;
}

interface UnitMeta {
  code: string;
  toBaseFactor: number | null;
  isBase: boolean;
}

function slipLines(value: unknown): CountSlipQueryLine[] {
  return Array.isArray(value) ? (value as CountSlipQueryLine[]) : [];
}

function unitKey(ingredientId: number, unitId: number): string {
  return `${ingredientId}:${unitId}`;
}

export async function CountSlipsPageContent({
  routeBranchId,
  embedded = false,
  basePath = "/inventory/count-slips",
}: CountSlipsPageContentProps = {}) {
  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.INVENTORY_COUNT_APPROVE,
  );
  if (!ctx) redirect("/");
  const { supabase, claims } = ctx;

  // RLS limits these rows to branches where the manager holds
  // `inventory:count_approve`; the employee-facing RLS hides system quantity.
  let slipsQuery = supabase
    .from("inventory_count_slips")
    .select(
      `
      id,
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
      ),
      inventory_count_slip_lines (
        id,
        ingredient_id,
        system_quantity,
        counted_quantity,
        entry_unit_id,
        note,
        ingredients ( name ),
        units!inventory_count_slip_lines_entry_unit_id_fkey ( code )
      )
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .in("status", REVIEW_STATES);

  if (routeBranchId !== undefined) {
    slipsQuery = slipsQuery.eq("branch_id", routeBranchId);
  }

  const { data: slips } = await slipsQuery.order("submitted_at", {
    ascending: false,
  });

  const slipRows = slips ?? [];
  const allLines = slipRows.flatMap((slip) =>
    slipLines(slip.inventory_count_slip_lines),
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

  const rows: CountSlipRow[] = slipRows.map((slip) => {
    const lines = slipLines(slip.inventory_count_slip_lines);
    return {
      id: slip.id,
      branchName: embeddedName(slip.branches) ?? `CN #${slip.branch_id}`,
      locationName:
        embeddedName(slip.inventory_locations) ?? `Kho #${slip.location_id}`,
      employeeName: employeeName(slip.employees) ?? "Nhân viên",
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
        return buildCountSlipLineView({
          id: line.id,
          ingredientName: ingredient ?? `#${line.ingredient_id}`,
          entryUnitId,
          entryUnitCode: entryUnit?.code ?? embeddedCode(line.units),
          baseUnitCode: baseUnit?.code ?? null,
          toBaseFactor: entryUnit?.toBaseFactor ?? null,
          systemQuantity: Number(line.system_quantity ?? 0),
          countedQuantity: Number(line.counted_quantity ?? 0),
          note: line.note ?? null,
        });
      }),
    };
  });

  return (
    <CountSlipsClient
      initial={rows}
      branchScoped={routeBranchId != null}
      embedded={embedded}
      basePath={basePath}
    />
  );
}

export default async function CountSlipsPage() {
  return <CountSlipsPageContent />;
}
