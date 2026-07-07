import { redirect } from "next/navigation";
import { PERMISSION_KEYS, INVENTORY_OPS_ROLES } from "@comtammatu/shared/auth";
import { getAuthContextWithPermission } from "@/(protected)/inventory/_lib/auth";
import { resolveInventoryListScope } from "@/(protected)/inventory/_lib/inventory-scope";
import { parseBranchIdParam } from "@/_lib/branch-context";
import { CountAssignmentsClient } from "./count-assignments-client";
import type { EmployeeRow, IngredientOption } from "./count-assignments-client";

export const dynamic = "force-dynamic";

interface CountAssignmentsPageContentProps {
  searchParams?: Promise<{
    branchId?: string | string[];
    locationId?: string | string[];
  }>;
  routeBranchId?: number;
  basePath?: string;
  embedded?: boolean;
}

export async function CountAssignmentsPageContent({
  searchParams,
  routeBranchId,
  basePath = "/inventory/count-assignments",
  embedded = false,
}: CountAssignmentsPageContentProps) {
  const params = searchParams ? await searchParams : {};

  const ctx = await getAuthContextWithPermission(
    INVENTORY_OPS_ROLES,
    PERMISSION_KEYS.INVENTORY_COUNT_ASSIGN,
    routeBranchId,
  );
  if (!ctx) redirect("/");
  const { supabase, claims } = ctx;

  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
    queryBranchId: params.branchId,
  });

  const selectedBranchId = scope.selectedBranchId;
  const requestedLocationId = parseBranchIdParam(params.locationId);

  // Count assignments target the branch warehouse. URL scope stays supported
  // for deep links.
  const locations: Array<{ id: number; kind: string | null }> = [];
  if (selectedBranchId !== null) {
    const locationsRes = await supabase
      .from("inventory_locations")
      .select("id, location_kind")
      .eq("branch_id", selectedBranchId)
      .eq("is_active", true)
      .eq("location_kind", "warehouse")
      .order("sort_order", { ascending: true });
    for (const l of locationsRes.data ?? []) {
      locations.push({
        id: l.id,
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

  // Employees in the selected branch (branch lives on profiles, joined via
  // employees.profile_id). Only resolve once a branch is chosen.
  const employees: EmployeeRow[] = [];
  if (selectedBranchId !== null) {
    const employeesRes = await supabase
      .from("employees")
      .select(
        `id, is_active, profiles!inner ( full_name, branch_id, is_active )`,
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .eq("profiles.branch_id", selectedBranchId)
      .order("id");
    for (const row of employeesRes.data ?? []) {
      const profile = row.profiles as { full_name: string | null } | null;
      employees.push({
        id: row.id,
        name: profile?.full_name ?? "—",
      });
    }
  }

  // Active finished-good catalog for the per-employee checklist.
  const ingredientsRes = await supabase
    .from("ingredients")
    .select("id, name, ingredient_units(is_base, units!ingredient_units_unit_id_fkey(code))")
    .eq("tenant_id", claims.tenant_id)
    .eq("item_kind", "finished_good")
    .eq("is_active", true)
    .order("name");
  const ingredients: IngredientOption[] = (ingredientsRes.data ?? []).map(
    (i) => ({
      id: i.id,
      name: i.name,
      unit: (i as any).ingredient_units?.find((u: any) => u.is_base)?.units?.code ?? "",
    }),
  );

  // Current active assignments at this branch+location, grouped per employee,
  // to prefill each checklist.
  const assignmentsByEmployee: Record<string, number[]> = {};
  if (selectedBranchId !== null && selectedLocationId !== null) {
    const assignmentsRes = await supabase
      .from("inventory_count_assignments")
      .select("employee_id, ingredient_id")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", selectedBranchId)
      .eq("location_id", selectedLocationId)
      .eq("is_active", true);
    for (const row of assignmentsRes.data ?? []) {
      const key = String(row.employee_id);
      (assignmentsByEmployee[key] ??= []).push(row.ingredient_id);
    }
  }

  return (
    <CountAssignmentsClient
      selectedBranchId={selectedBranchId}
      selectedLocationId={selectedLocationId}
      employees={employees}
      ingredients={ingredients}
      assignmentsByEmployee={assignmentsByEmployee}
      basePath={basePath}
      embedded={embedded}
    />
  );
}

export default async function CountAssignmentsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    branchId?: string | string[];
    locationId?: string | string[];
  }>;
}) {
  return <CountAssignmentsPageContent searchParams={searchParams} />;
}
