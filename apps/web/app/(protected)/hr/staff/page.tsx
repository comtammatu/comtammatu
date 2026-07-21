import { Suspense } from "react";
import { createClient } from "@comtammatu/database/supabase/server";
import { staffRoleFromPositionCode } from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { matchesSearch } from "@lib/search";
import { AppPage, AppPageHeader } from "@/components/surface";
import { StaffTable } from "./staff-table";
import { StaffFilters } from "./staff-filters";
import { AddStaffButton } from "./add-staff-button";
import { StaffHeaderOverflow } from "./staff-header-actions";
import { messages } from "@lib/messages";
import type { StaffRow } from "./staff-table";

interface StaffPageProps {
  searchParams: Promise<{
    position?: string;
    branch?: string;
    status?: string;
    q?: string;
  }>;
}

export default async function StaffPage({ searchParams }: StaffPageProps) {
  const params = await searchParams;
  const supabase = await createClient();

  const [{ data: branches }, { data: positions }] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name, branch_kind")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("positions")
      .select("id, code, label_vi")
      .eq("is_active", true)
      .order("label_vi"),
  ]);

  // Build staff query — role is derived from positions.code via the role mapper.
  // Role/owner filtering happens in JS below (position→role is a
  // mapping table, not a column), so bound the fetch itself instead.
  let query = supabase
    .from("profiles")
    .select(
      "id, full_name, phone, branch_id, position_id, is_active, positions(code, label_vi), branches(name)",
    )
    .order("full_name")
    .limit(500);

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
    const positionCode = (p.positions as PositionJoin)?.code ?? null;
    return {
      id: p.id,
      full_name: p.full_name,
      phone: p.phone,
      role: staffRoleFromPositionCode(positionCode),
      position_code: positionCode,
      position_label: (p.positions as PositionJoin)?.label_vi ?? null,
      branch_id: p.branch_id,
      branch_name: (p.branches as BranchJoin)?.name ?? null,
      is_active: p.is_active,
    };
  });

  const branchOptions = branches ?? [];
  const positionOptions = (positions ?? []).flatMap((position) => {
    const bucket = staffRoleFromPositionCode(position.code);
    if (
      bucket === "unassigned" ||
      bucket === "owner" ||
      position.code === "archived_staff"
    ) {
      return [];
    }
    return [
      {
        value: position.code,
        label: position.label_vi ?? position.code,
      },
    ];
  });

  const staff: StaffRow[] = allStaff.filter((s) => {
    if (s.role === "owner") return false;
    if (
      params.position &&
      positionOptions.some((option) => option.value === params.position) &&
      s.position_code !== params.position
    ) {
      return false;
    }
    return matchesSearch(
      [s.full_name, s.phone, s.position_label ?? s.role, s.branch_name],
      params.q,
    );
  });

  const hasActiveFilters = Boolean(
    params.q || params.position || params.branch || params.status,
  );

  return (
    <AppPage width="xwide">
      <AppPageHeader
        eyebrow={APP_COPY_VI.hrWorkspace}
        title={messages.owner.staffPage.title}
        description={messages.owner.staffPage.description}
        actions={
          <>
            <AddStaffButton
              branches={branchOptions}
              positionOptions={positionOptions}
            />
            <StaffHeaderOverflow />
          </>
        }
      />
      <Suspense>
        <StaffFilters
          branches={branchOptions}
          positionOptions={positionOptions}
        />
      </Suspense>
      <StaffTable
        staff={staff}
        branches={branchOptions}
        positionOptions={positionOptions}
        hasActiveFilters={hasActiveFilters}
      />
    </AppPage>
  );
}
