"use server";

import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";
import type { StaffRole } from "@comtammatu/shared/auth";

export interface EmployeeInfo {
  fullName: string;
  role: StaffRole;
  branchId: number | null;
  branchName: string | null;
}

export async function getEmployeeInfo(): Promise<EmployeeInfo | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const claims = extractClaims(user.app_metadata);
  if (!claims) return null;

  // Fetch profile + branch name
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, branch_id, branches(name)")
    .eq("id", user.id)
    .single();

  return {
    fullName: profile?.full_name ?? user.email ?? "Nhân viên",
    role: claims.user_role,
    branchId: claims.branch_id,
    branchName:
      profile?.branches && !Array.isArray(profile.branches)
        ? profile.branches.name
        : null,
  };
}
