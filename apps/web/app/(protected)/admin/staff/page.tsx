import { Suspense } from "react";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  isStaffRole,
  resolveStaffRoleFromPositionCode,
} from "@comtammatu/shared/auth";
import { AppPage, AppPageHeader, AppToolbar } from "@/components/surface";
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

  let query = supabase
    .from("profiles")
    .select(
      "id, full_name, phone, branch_id, is_active, positions(code, label_vi), branches(name)",
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

  type PositionJoin = { code: string | null; label_vi: string | null } | null;
  type BranchJoin = { name: string } | null;

  const allStaff: StaffRow[] = (profiles ?? []).map((p) => {
    const position = p.positions as PositionJoin;
    return {
      id: p.id,
      full_name: p.full_name,
      phone: p.phone,
      role: resolveStaffRoleFromPositionCode(position?.code) ?? "unassigned",
      positionCode: position?.code ?? null,
      positionLabel: position?.label_vi ?? null,
      branch_id: p.branch_id,
      branch_name: (p.branches as BranchJoin)?.name ?? null,
      is_active: p.is_active,
    };
  });

  const staff: StaffRow[] = allStaff.filter((s) => {
    if (s.role === "owner" || s.role === "super_manager") return false;
    if (isStaffRole(params.role)) {
      return s.role === params.role;
    }
    return true;
  });

  const branchOptions = branches ?? [];

  return (
    <AppPage>
      <AppPageHeader
        title="Nhân viên"
        description="Quản lý tài khoản và phân quyền nhân viên theo chi nhánh."
        actions={<AddStaffButton branches={branchOptions} />}
      />
      <AppToolbar>
        <Suspense>
          <StaffFilters branches={branchOptions} />
        </Suspense>
      </AppToolbar>
      <StaffTable staff={staff} branches={branchOptions} />
    </AppPage>
  );
}
