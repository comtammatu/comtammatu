/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: employee inventory count slip keeps operational copy close to the workflow controls */

import { getVNDateString } from "@comtammatu/shared/time";
import { getEmployeeContext } from "../_lib/employee-context";
import {
  EmployeeMissingProfileEmpty,
  EmployeePage,
} from "../components/employee-page";
import { CountSlipClient } from "./count-client";

export interface CountUnitChoice {
  unitId: number;
  code: string;
  isBase: boolean;
}

export interface CountAssignment {
  ingredientId: number;
  ingredientName: string;
  measureUnit: string;
  // All active counting units for this ingredient, base first. Empty when the
  // ingredient has no configured units (caller falls back to the measure unit).
  countUnits: CountUnitChoice[];
}

export interface CountLocationGroup {
  locationId: number;
  locationName: string;
  assignments: CountAssignment[];
}

export type CountSlipStatus = "submitted" | "needs_changes" | "approved";

export interface CountSlipHeader {
  id: number;
  locationId: number;
  status: CountSlipStatus;
  reviewNote: string | null;
}

interface AssignmentUnitRow {
  unit_id: number;
  is_base: boolean;
  sort_order: number;
  units: { code: string } | null;
}

interface AssignmentRow {
  ingredient_id: number;
  location_id: number;
  ingredients: {
    name: string;
    measure_unit: string;
    ingredient_units: AssignmentUnitRow[] | null;
  } | null;
}

interface LocationRow {
  id: number;
  name: string;
}

interface SlipRow {
  id: number;
  location_id: number;
  status: string;
}

interface SlipLineRow {
  ingredient_id: number;
  counted_quantity: number;
  entry_unit_id: number | null;
  note: string | null;
}

export default async function EmployeeCountPage(props: {
  searchParams: Promise<{ location?: string }>;
}) {
  const ctx = await getEmployeeContext();
  if (!ctx) {
    return (
      <EmployeePage title="Kiểm kê tồn">
        <EmployeeMissingProfileEmpty />
      </EmployeePage>
    );
  }

  if (!ctx.branchId) {
    return (
      <EmployeePage title="Kiểm kê tồn">
        <EmployeeMissingProfileEmpty
          title="Chưa thể kiểm kê"
          description="Tài khoản chưa được gắn chi nhánh. Liên hệ quản lý để cập nhật hồ sơ."
        />
      </EmployeePage>
    );
  }

  const { supabase, claims, employeeId, branchId, branchName } = ctx;

  const { data: assignmentData } = await supabase
    .from("inventory_count_assignments")
    .select(
      "ingredient_id, location_id, ingredients ( name, measure_unit, ingredient_units ( unit_id, is_base, sort_order, units ( code ) ) )",
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("employee_id", employeeId)
    .eq("branch_id", branchId)
    .eq("is_active", true);

  const assignmentRows = (assignmentData ?? []) as unknown as AssignmentRow[];

  if (assignmentRows.length === 0) {
    return (
      <EmployeePage title="Kiểm kê tồn" description={branchName ?? undefined}>
        <EmployeeMissingProfileEmpty
          title="Chưa được giao đếm"
          description="Bạn chưa được giao nguyên liệu nào để kiểm kê. Liên hệ quản lý chi nhánh."
        />
      </EmployeePage>
    );
  }

  const locationIds = [
    ...new Set(assignmentRows.map((row) => row.location_id)),
  ];

  const { data: locationData } = await supabase
    .from("inventory_locations")
    .select("id, name")
    .eq("tenant_id", claims.tenant_id)
    .in("id", locationIds);

  const locationNameById = new Map(
    ((locationData ?? []) as LocationRow[]).map((row) => [row.id, row.name]),
  );

  const groups: CountLocationGroup[] = locationIds
    .map((locationId) => ({
      locationId,
      locationName: locationNameById.get(locationId) ?? `Kho #${locationId}`,
      assignments: assignmentRows
        .filter((row) => row.location_id === locationId)
        .map((row) => ({
          ingredientId: row.ingredient_id,
          ingredientName: row.ingredients?.name ?? "Nguyên liệu",
          measureUnit: row.ingredients?.measure_unit ?? "",
          // Counting can use any of the ingredient's units (no role filter), base first.
          countUnits: (row.ingredients?.ingredient_units ?? [])
            .filter((u) => (u.units?.code ?? "") !== "")
            .sort((a, b) => {
              if (a.is_base !== b.is_base) return a.is_base ? -1 : 1;
              return a.sort_order - b.sort_order;
            })
            .map((u) => ({
              unitId: u.unit_id,
              code: u.units?.code ?? "",
              isBase: u.is_base,
            })),
        }))
        .sort((a, b) => a.ingredientName.localeCompare(b.ingredientName, "vi")),
    }))
    .sort((a, b) => a.locationName.localeCompare(b.locationName, "vi"));

  const { location: locationParam } = await props.searchParams;
  const parsedLocation = Number(locationParam);
  const selectedLocationId =
    groups.find((group) => group.locationId === parsedLocation)?.locationId ??
    (groups.length === 1 ? groups[0]!.locationId : null);

  const today = getVNDateString();

  const { data: slipData } = await supabase
    .from("inventory_count_slips")
    .select("id, location_id, status")
    .eq("tenant_id", claims.tenant_id)
    .eq("employee_id", employeeId)
    .eq("branch_id", branchId)
    .eq("count_date", today);

  const slipRows = (slipData ?? []) as SlipRow[];
  const slipByLocation = new Map<number, CountSlipHeader>(
    slipRows
      .filter(
        (row): row is SlipRow & { status: CountSlipStatus } =>
          row.status === "submitted" ||
          row.status === "needs_changes" ||
          row.status === "approved",
      )
      .map((row) => [
        row.location_id,
        {
          id: row.id,
          locationId: row.location_id,
          status: row.status,
          reviewNote: null,
        },
      ]),
  );

  // review_note is read separately so the column list stays explicit.
  if (slipRows.length > 0) {
    const { data: reviewData } = await supabase
      .from("inventory_count_slips")
      .select("id, review_note")
      .eq("tenant_id", claims.tenant_id)
      .eq("employee_id", employeeId)
      .eq("branch_id", branchId)
      .eq("count_date", today);
    const reviewById = new Map(
      (
        (reviewData ?? []) as Array<{ id: number; review_note: string | null }>
      ).map((row) => [row.id, row.review_note]),
    );
    for (const header of slipByLocation.values()) {
      header.reviewNote = reviewById.get(header.id) ?? null;
    }
  }

  // Blind prefill: only when the selected location's slip needs changes, fetch
  // the employee's previously counted values via the blind RPC (no system qty).
  let prefill: Record<
    number,
    { quantity: string; entryUnitId: number | null; note: string }
  > = {};
  const selectedSlip =
    selectedLocationId !== null
      ? (slipByLocation.get(selectedLocationId) ?? null)
      : null;
  if (selectedSlip && selectedSlip.status === "needs_changes") {
    const { data: slipLines } = await supabase.rpc("get_my_count_slip", {
      p_slip_id: selectedSlip.id,
    });
    const lineRows = (slipLines ?? []) as SlipLineRow[];
    prefill = Object.fromEntries(
      lineRows.map((line) => [
        line.ingredient_id,
        {
          quantity: String(line.counted_quantity),
          entryUnitId: line.entry_unit_id,
          note: line.note ?? "",
        },
      ]),
    );
  }

  return (
    <EmployeePage title="Kiểm kê tồn" description={branchName ?? undefined}>
      <CountSlipClient
        branchId={branchId}
        groups={groups}
        selectedLocationId={selectedLocationId}
        slipByLocation={Object.fromEntries(slipByLocation)}
        prefill={prefill}
      />
    </EmployeePage>
  );
}
