import { Suspense } from "react";
import { createClient } from "@comtammatu/database/supabase/server";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { STAFF_ROLES } from "@comtammatu/shared/auth";
import type { StaffRole } from "@comtammatu/shared/auth";
import { StaffTable } from "./staff-table";
import { StaffFilters } from "./staff-filters";
import { AddStaffButton } from "./add-staff-button";
import type { StaffRow } from "./staff-table";

interface StaffPageProps {
  searchParams: Promise<{
    role?: string;
    branch?: string;
    status?: string;
  }>;
}

export default async function StaffPage({ searchParams }: StaffPageProps) {
  const params = await searchParams;
  const supabase = await createClient();

  // Fetch branches for filters + form
  const { data: branches } = await supabase
    .from("branches")
    .select("id, name, branch_kind")
    .eq("is_active", true)
    .order("name");

  // Build staff query — role is now derived via positions.legacy_role_code (auth_v2).
  let query = supabase
    .from("profiles")
    .select(
      "id, full_name, phone, branch_id, is_active, positions(legacy_role_code), branches(name)",
    )
    .order("full_name");

  if (params.branch) {
    query = query.eq("branch_id", Number(params.branch));
  }
  if (params.status === "active") {
    query = query.eq("is_active", true);
  } else if (params.status === "inactive") {
    query = query.eq("is_active", false);
  }

  const { data: profiles } = await query;

  type PositionJoin = { legacy_role_code: string | null } | null;
  type BranchJoin = { name: string } | null;

  const allStaff: StaffRow[] = (profiles ?? []).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    phone: p.phone,
    role: (p.positions as PositionJoin)?.legacy_role_code ?? "unassigned",
    branch_id: p.branch_id,
    branch_name: (p.branches as BranchJoin)?.name ?? null,
    is_active: p.is_active,
  }));

  const staff: StaffRow[] = allStaff.filter((s) => {
    if (s.role === "owner" || s.role === "super_manager") return false;
    if (params.role && (STAFF_ROLES as readonly string[]).includes(params.role)) {
      return s.role === (params.role as StaffRole);
    }
    return true;
  });

  const branchOptions = branches ?? [];

  return (
    <div className="space-y-5 lg:space-y-6">
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
              <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                Quản lý nhân viên
              </span>
              <div className="space-y-2">
                <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  Nhân viên
                </h2>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 self-start">
              <AddStaffButton branches={branchOptions} />
            </div>
          </div>
        </CardContent>
      </Card>
      <Suspense>
        <StaffFilters branches={branchOptions} />
      </Suspense>
      <StaffTable staff={staff} branches={branchOptions} />
    </div>
  );
}
