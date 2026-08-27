import { redirect } from "next/navigation";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { PERMISSION_KEYS, INVENTORY_OPS_ROLES } from "@comtammatu/shared/auth";
import { getAuthContextWithPermission } from "@/(protected)/inventory/_lib/auth";
import { resolveInventoryListScope } from "@/(protected)/inventory/_lib/inventory-scope";
import { parseBranchIdParam } from "@/_lib/branch-context";
import { resolveDefaultShiftId } from "@lib/staff-runtime/_lib/default-shift";
import { CountAssignmentsClient } from "./count-assignments-client";
import type {
  CountAssignmentEmployee as EmployeeRow,
  CountAssignmentIngredient as IngredientOption,
  CountAssignmentLocation as LocationOption,
  CountAssignmentShift as ShiftOption,
} from "@lib/inventory/count-assignment-model";

export const instant = false;

const ALL_SHIFTS_PARAM = "all";

interface CountAssignmentsPageContentProps {
  searchParams?: Promise<{
    branch?: string | string[];
    locationId?: string | string[];
    shiftId?: string | string[];
    assignmentId?: string | string[];
  }>;
  initialAssignmentId?: number | null;
}

function parsePositiveId(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

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

async function CountAssignmentsPageContent({
  searchParams,
  initialAssignmentId = null,
}: CountAssignmentsPageContentProps) {
  const params = searchParams ? await searchParams : {};

  const ctx = await getAuthContextWithPermission(
    INVENTORY_OPS_ROLES,
    PERMISSION_KEYS.INVENTORY_COUNT_ASSIGN,
  );
  if (!ctx) redirect("/");
  const { supabase, claims } = ctx;
  const rosterClient = createServiceClient();

  const scope = await resolveInventoryListScope(supabase, claims, {
    queryBranch: params.branch,
  });

  const selectedBranchId = scope.selectedBranchId;
  const requestedLocationId = parseBranchIdParam(params.locationId);
  const rawShiftId = Array.isArray(params.shiftId)
    ? params.shiftId[0]
    : params.shiftId;
  const requestedShiftId = parseBranchIdParam(params.shiftId);
  const requestedAllShifts = rawShiftId === ALL_SHIFTS_PARAM;

  const selectedBranchName =
    scope.allowedBranches.find((branch) => branch.id === selectedBranchId)
      ?.name ?? "Chi nhánh";
  const locations: LocationOption[] = [];
  if (selectedBranchId !== null) {
    const locationsRes = await supabase
      .from("inventory_locations")
      .select("id, name, location_kind")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", selectedBranchId)
      .eq("is_active", true)
      .in("location_kind", ["warehouse"])
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });
    if (locationsRes.error) {
      console.error("inventory.count_assignments.locations_fetch_failed", {
        code: locationsRes.error.code,
      });
      throw new Error("inventory.count_assignments.load_failed");
    }
    for (const l of locationsRes.data ?? []) {
      locations.push({
        id: l.id,
        label: countLocationLabel(
          selectedBranchName,
          l.location_kind ?? null,
          l.name ?? null,
        ),
        kind: l.location_kind ?? null,
      });
    }
  }

  const selectedLocationId =
    requestedLocationId != null &&
    locations.some((l) => l.id === requestedLocationId)
      ? requestedLocationId
      : (locations.find((l) => l.kind === "warehouse")?.id ??
        locations[0]?.id ??
        null);

  const shiftOptions: ShiftOption[] = [];
  if (selectedBranchId !== null) {
    const shiftsRes = await supabase
      .from("shifts")
      .select("id, name, start_time, end_time")
      .eq("tenant_id", claims.tenant_id)
      .or(`branch_id.is.null,branch_id.eq.${selectedBranchId}`)
      .eq("is_active", true)
      .order("start_time");
    if (shiftsRes.error) {
      console.error("inventory.count_assignments.shifts_fetch_failed", {
        code: shiftsRes.error.code,
      });
      throw new Error("inventory.count_assignments.load_failed");
    }
    for (const shift of shiftsRes.data ?? []) {
      shiftOptions.push({
        id: shift.id,
        name: shift.name,
        startTime: shift.start_time,
        endTime: shift.end_time,
      });
    }
  }

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

  // Assignment access is permission-gated above; roster reads bypass self-scoped
  // employee/profile RLS while writes still go through the assignment RPC.
  const employees: EmployeeRow[] = [];
  if (selectedBranchId !== null) {
    const profilesRes = await rosterClient
      .from("profiles")
      .select("id, full_name, is_active, position_id, positions(id, code, label_vi)")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", selectedBranchId)
      .or("is_active.is.null,is_active.eq.true")
      .order("full_name");
    if (profilesRes.error) {
      console.error("inventory.count_assignments.profiles_fetch_failed", {
        code: profilesRes.error.code,
      });
      throw new Error(
        "Không đọc được danh sách nhân viên để phân công đếm tồn.",
      );
    }

    const profileIds = (profilesRes.data ?? []).map((profile) => profile.id);
    const lookupProfileIds =
      profileIds.length > 0
        ? profileIds
        : ["00000000-0000-0000-0000-000000000000"];
    const employeesRes = await rosterClient
      .from("employees")
      .select("id, profile_id, is_active")
      .eq("tenant_id", claims.tenant_id)
      .in("profile_id", lookupProfileIds)
      .eq("is_active", true);
    if (employeesRes.error) {
      console.error("inventory.count_assignments.employees_fetch_failed", {
        code: employeesRes.error.code,
      });
      throw new Error(
        "Không đọc được danh sách nhân viên để phân công đếm tồn.",
      );
    }

    const employeeByProfileId = new Map(
      (employeesRes.data ?? []).map((employee) => [
        employee.profile_id,
        employee,
      ]),
    );
    for (const profile of profilesRes.data ?? []) {
      const row = employeeByProfileId.get(profile.id);
      if (!row) continue;
      const pos = Array.isArray(profile.positions)
        ? profile.positions[0]
        : profile.positions;
      employees.push({
        id: row.id,
        name: profile.full_name ?? "—",
        positionId: profile.position_id ?? null,
        positionCode: pos?.code ?? null,
        positionName: pos?.label_vi ?? null,
      });
    }
  }

  // Active finished-good catalog for the per-employee checklist.
  const ingredientsRes = await supabase
    .from("ingredients")
    .select(
      "id, name, ingredient_units!ingredient_units_ingredient_tenant_fkey(is_base, units!ingredient_units_unit_tenant_fkey(code))",
    )
    .eq("tenant_id", claims.tenant_id)
    .in("item_kind", ["raw_material", "finished_good"])
    .eq("is_active", true)
    .order("name");
  if (ingredientsRes.error) {
    console.error("inventory.count_assignments.ingredients_fetch_failed", {
      code: ingredientsRes.error.code,
    });
    throw new Error(
      "Không đọc được danh sách nguyên liệu để phân công đếm tồn.",
    );
  }
  const ingredients: IngredientOption[] = (
    (ingredientsRes.data ?? []) as IngredientCountOptionRow[]
  ).map((i) => ({
    id: i.id,
    name: i.name,
    unit: i.ingredient_units?.find((u) => u.is_base)?.units?.code ?? "",
  }));

  // Current active assignments at this branch+location, grouped per employee,
  // to prefill each checklist.
  const assignmentsByEmployee: Record<string, number[]> = {};
  if (selectedBranchId !== null && selectedLocationId !== null) {
    let assignmentsQuery = supabase
      .from("inventory_count_assignments")
      .select("employee_id, ingredient_id")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", selectedBranchId)
      .eq("location_id", selectedLocationId)
      .eq("is_active", true);
    assignmentsQuery =
      selectedShiftId === null
        ? assignmentsQuery.is("shift_id", null)
        : assignmentsQuery.eq("shift_id", selectedShiftId);
    const assignmentsRes = await assignmentsQuery;
    if (assignmentsRes.error) {
      console.error("inventory.count_assignments.assignments_fetch_failed", {
        code: assignmentsRes.error.code,
      });
      throw new Error("inventory.count_assignments.load_failed");
    }
    for (const row of assignmentsRes.data ?? []) {
      const key = String(row.employee_id);
      (assignmentsByEmployee[key] ??= []).push(row.ingredient_id);
    }
  }

  const resolvedAssignmentId =
    initialAssignmentId != null &&
    employees.some((employee) => employee.id === initialAssignmentId)
      ? initialAssignmentId
      : null;

  return (
    <CountAssignmentsClient
      selectedBranchId={selectedBranchId}
      selectedLocationId={selectedLocationId}
      selectedShiftId={selectedShiftId}
      locationOptions={locations}
      shiftOptions={shiftOptions}
      employees={employees}
      ingredients={ingredients}
      assignmentsByEmployee={assignmentsByEmployee}
      initialAssignmentId={resolvedAssignmentId}
    />
  );
}

export default async function CountAssignmentsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    branch?: string | string[];
    locationId?: string | string[];
    shiftId?: string | string[];
    assignmentId?: string | string[];
  }>;
}) {
  const params = searchParams ? await searchParams : {};
  const initialAssignmentId = parsePositiveId(params.assignmentId);
  return (
    <CountAssignmentsPageContent
      searchParams={searchParams}
      initialAssignmentId={initialAssignmentId}
    />
  );
}
