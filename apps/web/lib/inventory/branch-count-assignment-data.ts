import "server-only";

import { notFound, redirect } from "next/navigation";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { INVENTORY_OPS_ROLES, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { getAuthContextWithPermission } from "@/(protected)/inventory/_lib/auth";
import { resolveInventoryListScope } from "@/(protected)/inventory/_lib/inventory-scope";
import { parseBranchIdParam } from "@/_lib/branch-context";
import { resolveDefaultShiftId } from "@lib/staff-runtime/_lib/default-shift";
import type {
  BranchCountAssignmentData,
  CountAssignmentEmployee,
  CountAssignmentIngredient,
  CountAssignmentLocation,
  CountAssignmentShift,
} from "./count-assignment-model";

const ALL_SHIFTS_PARAM = "all";

type IngredientCountOptionRow = {
  id: number;
  name: string;
  ingredient_units?:
    | { is_base: boolean; units: { code: string } | null }[]
    | null;
};

function countLocationLabel(
  branchName: string,
  kind: string | null,
  fallbackName: string | null,
) {
  const suffix =
    kind === "warehouse" ? "Kho" : (fallbackName ?? "Kho");
  return `${branchName} - ${suffix}`;
}

export async function loadBranchCountAssignmentData({
  routeBranchId,
  locationParam,
  shiftParam,
}: {
  routeBranchId: number;
  locationParam?: string | string[];
  shiftParam?: string | string[];
}): Promise<BranchCountAssignmentData> {
  const ctx = await getAuthContextWithPermission(
    INVENTORY_OPS_ROLES,
    PERMISSION_KEYS.INVENTORY_COUNT_ASSIGN,
    routeBranchId,
  );
  if (!ctx) redirect("/");
  const { supabase, claims } = ctx;
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
  });
  if (scope.outOfScope || scope.selectedBranchId !== routeBranchId) notFound();

  const branchName =
    scope.allowedBranches.find((branch) => branch.id === routeBranchId)?.name ??
    `CN #${routeBranchId}`;
  const requestedLocationId = parseBranchIdParam(locationParam);
  const rawShiftId = Array.isArray(shiftParam) ? shiftParam[0] : shiftParam;
  const requestedShiftId = parseBranchIdParam(shiftParam);
  const requestedAllShifts = rawShiftId === ALL_SHIFTS_PARAM;

  const locationsResult = await supabase
    .from("inventory_locations")
    .select("id, name, location_kind")
    .eq("tenant_id", claims.tenant_id)
    .eq("branch_id", routeBranchId)
    .eq("is_active", true)
    .in("location_kind", ["warehouse"])
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  const locationOptions: CountAssignmentLocation[] = (
    locationsResult.data ?? []
  ).map((location) => ({
    id: location.id,
    label: countLocationLabel(
      branchName,
      location.location_kind ?? null,
      location.name ?? null,
    ),
    kind: location.location_kind ?? null,
  }));
  const selectedLocationId =
    requestedLocationId != null &&
    locationOptions.some((location) => location.id === requestedLocationId)
      ? requestedLocationId
      : (locationOptions.find((location) => location.kind === "warehouse")
          ?.id ??
        locationOptions[0]?.id ??
        null);

  const shiftsResult = await supabase
    .from("shifts")
    .select("id, name, start_time, end_time")
    .eq("tenant_id", claims.tenant_id)
    .or(`branch_id.is.null,branch_id.eq.${routeBranchId}`)
    .eq("is_active", true)
    .order("start_time");
  const shiftOptions: CountAssignmentShift[] = (shiftsResult.data ?? []).map(
    (shift) => ({
      id: shift.id,
      name: shift.name,
      startTime: shift.start_time,
      endTime: shift.end_time,
    }),
  );
  const defaultShiftId = resolveDefaultShiftId(
    shiftOptions.map((shift) => ({
      id: shift.id,
      start_time: shift.startTime,
      end_time: shift.endTime,
    })),
  );
  const selectedShiftId = requestedAllShifts
    ? null
    : requestedShiftId != null &&
        shiftOptions.some((shift) => shift.id === requestedShiftId)
      ? requestedShiftId
      : defaultShiftId;

  const rosterClient = createServiceClient();
  const profilesResult = await rosterClient
    .from("profiles")
    .select("id, full_name, is_active")
    .eq("tenant_id", claims.tenant_id)
    .eq("branch_id", routeBranchId)
    .or("is_active.is.null,is_active.eq.true")
    .order("full_name");
  if (profilesResult.error) {
    console.error("inventory.count_assignments.profiles_fetch_failed", {
      code: profilesResult.error.code,
    });
    throw new Error("Không đọc được danh sách nhân viên để phân công đếm tồn.");
  }
  const profileIds = (profilesResult.data ?? []).map((profile) => profile.id);
  const employeesResult = await rosterClient
    .from("employees")
    .select("id, profile_id, is_active")
    .eq("tenant_id", claims.tenant_id)
    .in(
      "profile_id",
      profileIds.length > 0
        ? profileIds
        : ["00000000-0000-0000-0000-000000000000"],
    )
    .eq("is_active", true);
  if (employeesResult.error) {
    console.error("inventory.count_assignments.employees_fetch_failed", {
      code: employeesResult.error.code,
    });
    throw new Error("Không đọc được danh sách nhân viên để phân công đếm tồn.");
  }
  const employeeByProfileId = new Map(
    (employeesResult.data ?? []).map((employee) => [
      employee.profile_id,
      employee,
    ]),
  );
  const employees: CountAssignmentEmployee[] = [];
  for (const profile of profilesResult.data ?? []) {
    const employee = employeeByProfileId.get(profile.id);
    if (!employee) continue;
    employees.push({ id: employee.id, name: profile.full_name ?? "—" });
  }

  const ingredientsResult = await supabase
    .from("ingredients")
    .select(
      "id, name, ingredient_units!ingredient_units_ingredient_tenant_fkey(is_base, units!ingredient_units_unit_tenant_fkey(code))",
    )
    .eq("tenant_id", claims.tenant_id)
    .in("item_kind", ["raw_material", "finished_good"])
    .eq("is_active", true)
    .order("name");
  if (ingredientsResult.error) {
    console.error("inventory.count_assignments.ingredients_fetch_failed", {
      code: ingredientsResult.error.code,
    });
    throw new Error(
      "Không đọc được danh sách nguyên liệu để phân công đếm tồn.",
    );
  }
  const ingredients: CountAssignmentIngredient[] = (
    (ingredientsResult.data ?? []) as IngredientCountOptionRow[]
  ).map((ingredient) => ({
    id: ingredient.id,
    name: ingredient.name,
    unit:
      ingredient.ingredient_units?.find((unit) => unit.is_base)?.units?.code ??
      "",
  }));

  const assignmentsByEmployee: Record<string, number[]> = {};
  if (selectedLocationId != null) {
    let assignmentsQuery = supabase
      .from("inventory_count_assignments")
      .select("employee_id, ingredient_id")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", routeBranchId)
      .eq("location_id", selectedLocationId)
      .eq("is_active", true);
    assignmentsQuery =
      selectedShiftId === null
        ? assignmentsQuery.is("shift_id", null)
        : assignmentsQuery.eq("shift_id", selectedShiftId);
    const assignmentsResult = await assignmentsQuery;
    for (const assignment of assignmentsResult.data ?? []) {
      const key = String(assignment.employee_id);
      (assignmentsByEmployee[key] ??= []).push(assignment.ingredient_id);
    }
  }

  const templatesResult = await supabase
    .from("inventory_count_templates")
    .select(
      "id, code, name, station_role, is_system, inventory_count_template_items(ingredient_id, sort_order)",
    )
    .eq("tenant_id", claims.tenant_id)
    .or(`branch_id.is.null,branch_id.eq.${routeBranchId}`)
    .eq("is_active", true)
    .order("id");

  const templates = (templatesResult.data ?? []).map((t) => ({
    id: t.id,
    code: t.code,
    name: t.name,
    stationRole: t.station_role,
    isSystem: t.is_system,
    ingredientIds: (
      (t.inventory_count_template_items ?? []) as Array<{
        ingredient_id: number;
        sort_order: number;
      }>
    )
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((item) => item.ingredient_id),
  }));

  return {
    branchId: routeBranchId,
    branchName,
    selectedLocationId,
    selectedShiftId,
    locationOptions,
    shiftOptions,
    employees,
    ingredients,
    templates,
    assignmentsByEmployee,
  };
}
