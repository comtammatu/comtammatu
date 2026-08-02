import { staffRoleFromPositionCode } from "@comtammatu/shared/auth";
import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";
import { matchesSearch } from "@lib/search";
import type { createClient } from "@comtammatu/database/supabase/server";
import type {
  BranchOption,
  PermissionGrantStatus,
  StaffRow,
} from "./staff-table";
import {
  getHrScopeBranchId,
  resolveHrBranchScope,
} from "@/lib/hr-scope";

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

export type StaffAccountsParams = {
  position?: string;
  branch?: string;
  status?: string;
  q?: string;
};

export type StaffAccountsData = {
  staff: StaffRow[];
  branches: BranchOption[];
  positionOptions: Array<{ value: string; label: string }>;
  permissionStatusByUserId: Record<string, PermissionGrantStatus>;
  hasActiveFilters: boolean;
};

function permissionStatusFromGrants(
  grants: Array<{ source_template: number | null }>,
): PermissionGrantStatus {
  if (grants.length === 0) return "none";
  let hasTemplate = false;
  let hasException = false;
  for (const grant of grants) {
    if (grant.source_template == null) hasException = true;
    else hasTemplate = true;
  }
  if (hasTemplate && hasException) return "mixed";
  if (hasException) return "exception";
  return "template";
}

export async function loadStaffAccountsData(
  supabase: SupabaseServer,
  params: StaffAccountsParams,
): Promise<StaffAccountsData> {
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

  let query = supabase
    .from("profiles")
    .select(
      "id, full_name, phone, branch_id, position_id, is_active, positions(code, label_vi), branches(name)",
    )
    .order("full_name")
    .limit(500);

  const branchScope = resolveHrBranchScope(params.branch, branches ?? []);
  const branchId = getHrScopeBranchId(branchScope);
  if (branchScope === "office") {
    query = query.is("branch_id", null);
  } else if (branchId != null) {
    query = query.eq("branch_id", branchId);
  }
  if (params.status === "active") {
    query = query.eq("is_active", true);
  } else if (params.status === "inactive") {
    query = query.eq("is_active", false);
  }

  const { data: profiles } = await query;

  type PositionJoin = { code: string | null; label_vi: string | null } | null;
  type BranchJoin = { name: string } | null;

  const allStaff: StaffRow[] = (profiles ?? []).map((profile) => {
    const positionCode = (profile.positions as PositionJoin)?.code ?? null;
    return {
      id: profile.id,
      full_name: profile.full_name,
      phone: profile.phone,
      role: staffRoleFromPositionCode(positionCode),
      position_code: positionCode,
      position_label: (profile.positions as PositionJoin)?.label_vi ?? null,
      branch_id: profile.branch_id,
      branch_name: (profile.branches as BranchJoin)?.name ?? null,
      is_active: profile.is_active,
    };
  });

  const branchOptions = (branches ?? []) as BranchOption[];
  const positionOptions = (positions ?? []).flatMap((position) => {
    const bucket = staffRoleFromPositionCode(position.code);
    if (bucket === "owner" || position.code === "archived_staff") {
      return [];
    }
    return [
      {
        value: position.code,
        label: position.label_vi ?? UNKNOWN_LABEL_VI,
      },
    ];
  });

  const filteredStaff = allStaff.filter((member) => {
    if (member.role === "owner") return false;
    if (
      params.position &&
      positionOptions.some((option) => option.value === params.position) &&
      member.position_code !== params.position
    ) {
      return false;
    }
    return matchesSearch(
      [
        member.full_name,
        member.phone,
        member.position_label ?? member.role,
        member.branch_name,
      ],
      params.q,
    );
  });

  const staffIds = filteredStaff.map((member) => member.id);
  const permissionStatusByUserId: Record<string, PermissionGrantStatus> = {};
  for (const id of staffIds) {
    permissionStatusByUserId[id] = "none";
  }

  if (staffIds.length > 0) {
    const [{ data: grants }, { data: bindings }] = await Promise.all([
      supabase
        .from("staff_permissions")
        .select("user_id, source_template")
        .in("user_id", staffIds)
        .limit(5000),
      supabase
        .from("auth_role_bindings")
        .select("user_id")
        .in("user_id", staffIds)
        .is("valid_until", null)
        .limit(5000),
    ]);

    const grantsByUser = new Map<
      string,
      Array<{ source_template: number | null }>
    >();
    for (const grant of grants ?? []) {
      const userId = grant.user_id;
      if (!userId) continue;
      const list = grantsByUser.get(userId) ?? [];
      list.push({ source_template: grant.source_template });
      grantsByUser.set(userId, list);
    }
    for (const [userId, userGrants] of grantsByUser) {
      permissionStatusByUserId[userId] = permissionStatusFromGrants(userGrants);
    }
    for (const binding of (bindings ?? []) as Array<{ user_id: string }>) {
      permissionStatusByUserId[binding.user_id] = "template";
    }
  }

  const staff = filteredStaff.map((member) => ({
    ...member,
    permissionStatus: permissionStatusByUserId[member.id] ?? "none",
  }));

  return {
    staff,
    branches: branchOptions,
    positionOptions,
    permissionStatusByUserId,
    hasActiveFilters: Boolean(
      params.q || params.position || params.status,
    ),
  };
}
