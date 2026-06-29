import { redirect } from "next/navigation";
import { PERMISSION_KEYS, STAFF_ROLES } from "@comtammatu/shared/auth";
import { getAuthContextWithPermission } from "@/(protected)/inventory/_lib/auth";
import {
  CountSlipsClient,
  type CountSlipRow,
  type CountSlipStatus,
} from "./count-slips-client";

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
  if (Array.isArray(value)) {
    const first = value[0] as { name?: unknown } | undefined;
    return typeof first?.name === "string" ? first.name : null;
  }
  if (value && typeof value === "object") {
    const name = (value as { name?: unknown }).name;
    return typeof name === "string" ? name : null;
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

export default async function CountSlipsPage() {
  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.INVENTORY_COUNT_APPROVE,
  );
  if (!ctx) redirect("/");
  const { supabase, claims } = ctx;

  // RLS limits these rows to branches where the manager holds
  // `inventory:count_approve`, and exposes system_quantity + variance on the
  // lines (the employee-facing RLS hides those columns).
  const { data: slips } = await supabase
    .from("inventory_count_slips")
    .select(
      `
      id,
      branch_id,
      location_id,
      employee_id,
      count_date,
      status,
      note,
      review_note,
      submitted_at,
      reviewed_at,
      branches ( name ),
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
        variance,
        note,
        ingredients ( name, unit ),
        units ( code )
      )
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .in("status", REVIEW_STATES)
    .order("submitted_at", { ascending: false });

  const rows: CountSlipRow[] = (slips ?? []).map((slip) => {
    const lines = Array.isArray(slip.inventory_count_slip_lines)
      ? slip.inventory_count_slip_lines
      : [];
    return {
      id: slip.id,
      branchName: embeddedName(slip.branches) ?? `CN #${slip.branch_id}`,
      locationName:
        embeddedName(slip.inventory_locations) ?? `Kho #${slip.location_id}`,
      employeeName: employeeName(slip.employees) ?? "Nhân viên",
      countDate: slip.count_date,
      status: normalizeStatus(slip.status),
      note: slip.note ?? null,
      reviewNote: slip.review_note ?? null,
      submittedAt: slip.submitted_at ?? null,
      reviewedAt: slip.reviewed_at ?? null,
      lines: lines.map((line) => {
        const ingredient = embeddedName(line.ingredients);
        const unitSource = Array.isArray(line.ingredients)
          ? line.ingredients[0]
          : line.ingredients;
        const ingredientUnit =
          unitSource && typeof unitSource === "object"
            ? ((unitSource as { unit?: unknown }).unit ?? null)
            : null;
        // Prefer the entry unit the line was counted in; fall back to the
        // ingredient's default unit for legacy lines without entry_unit_id.
        const entryUnitSource = Array.isArray(line.units)
          ? line.units[0]
          : line.units;
        const entryUnitCode =
          entryUnitSource && typeof entryUnitSource === "object"
            ? ((entryUnitSource as { code?: unknown }).code ?? null)
            : null;
        const unit =
          typeof entryUnitCode === "string" && entryUnitCode !== ""
            ? entryUnitCode
            : typeof ingredientUnit === "string"
              ? ingredientUnit
              : null;
        return {
          id: line.id,
          ingredientName: ingredient ?? `#${line.ingredient_id}`,
          unit: typeof unit === "string" ? unit : "",
          systemQuantity: Number(line.system_quantity ?? 0),
          countedQuantity: Number(line.counted_quantity ?? 0),
          variance: Number(line.variance ?? 0),
          note: line.note ?? null,
        };
      }),
    };
  });

  return <CountSlipsClient initial={rows} />;
}
