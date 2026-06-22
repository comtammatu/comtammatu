"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import { revalidateSurfacePath } from "@/_lib/revalidate-surface";
import { type ActionContext, withAction } from "@/_lib/with-action";
import { getClientIp } from "@lib/network/client-ip";

const NETWORK_ADMIN_ROLES: StaffRole[] = ["owner"];

const branchIdSchema = z.object({
  branchId: z.coerce.number().int().positive(),
});

const revokeSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  trustedIpId: z.coerce.number().int().positive(),
});

export interface TrustedIpRow {
  id: number;
  ip_address: string;
  registered_via: "agent" | "manual";
  registered_by_agent_id: string | null;
  first_seen_at: string;
  last_seen_at: string;
  revoked_at: string | null;
}

async function branchBelongsToTenant(
  supabase: ActionContext["supabase"],
  tenantId: number,
  branchId: number,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("branches")
    .select("id")
    .eq("id", branchId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return !error && data !== null;
}

export const listTrustedIps = withAction(
  {
    roles: NETWORK_ADMIN_ROLES,
    schema: branchIdSchema,
    permission: PERMISSION_KEYS.SETTINGS_BRANCH_NETWORK,
    permissionBranchId: (data) => data.branchId,
  },
  async (data, { supabase, claims }) => {
    if (
      !(await branchBelongsToTenant(supabase, claims.tenant_id, data.branchId))
    ) {
      return { success: false, error: "Chi nhánh không hợp lệ." };
    }

    const { data: rows, error } = await supabase
      .from("branch_trusted_egress_ips")
      .select(
        "id, ip_address, registered_via, registered_by_agent_id, first_seen_at, last_seen_at, revoked_at",
      )
      .eq("branch_id", data.branchId)
      .eq("tenant_id", claims.tenant_id)
      .order("revoked_at", { ascending: true, nullsFirst: true })
      .order("last_seen_at", { ascending: false });

    if (error) {
      return { success: false, error: "Không tải được danh sách IP tin cậy." };
    }
    return {
      success: true,
      data: (rows ?? []) as unknown as TrustedIpRow[],
    };
  },
);

/**
 * Bootstrap: trust the IP that the admin's request is currently coming from.
 * Use case: setting up a new branch BEFORE the print-agent has registered
 * its first heartbeat. Admin must be physically on the branch wifi when
 * clicking — the IP is read server-side from the request headers, not the
 * body.
 */
export const trustCurrentIp = withAction(
  {
    roles: NETWORK_ADMIN_ROLES,
    schema: branchIdSchema,
    permission: PERMISSION_KEYS.SETTINGS_BRANCH_NETWORK,
    permissionBranchId: (data) => data.branchId,
  },
  async (data, { supabase, claims, user }) => {
    if (
      !(await branchBelongsToTenant(supabase, claims.tenant_id, data.branchId))
    ) {
      return { success: false, error: "Chi nhánh không hợp lệ." };
    }

    const headerStore = await headers();
    const ip = getClientIp(headerStore);
    if (!ip) {
      return {
        success: false,
        error: "Không xác định được IP công cộng. Kiểm tra cấu hình proxy.",
      };
    }

    const { error } = await supabase.from("branch_trusted_egress_ips").upsert(
      {
        tenant_id: claims.tenant_id,
        branch_id: data.branchId,
        ip_address: ip,
        registered_via: "manual",
        registered_by_agent_id: null,
        registered_by_user: user.id,
        last_seen_at: new Date().toISOString(),
        revoked_at: null,
        revoked_by_user: null,
      },
      { onConflict: "tenant_id,branch_id,ip_address" },
    );

    if (error) {
      return {
        success: false,
        error: "Không thể tin cậy IP này. Vui lòng thử lại.",
      };
    }

    revalidateSurfacePath("/admin/settings/branches");
    return { success: true, data: { ip } };
  },
);

/**
 * Soft-revoke a trusted IP. Sets revoked_at; row stays for audit trail.
 * Cashier devices on this IP get blocked on next request.
 */
export const revokeTrustedIp = withAction(
  {
    roles: NETWORK_ADMIN_ROLES,
    schema: revokeSchema,
    permission: PERMISSION_KEYS.SETTINGS_BRANCH_NETWORK,
    permissionBranchId: (data) => data.branchId,
  },
  async (data, { supabase, claims, user }) => {
    if (
      !(await branchBelongsToTenant(supabase, claims.tenant_id, data.branchId))
    ) {
      return { success: false, error: "Chi nhánh không hợp lệ." };
    }

    const { error } = await supabase
      .from("branch_trusted_egress_ips")
      .update({
        revoked_at: new Date().toISOString(),
        revoked_by_user: user.id,
      })
      .eq("id", data.trustedIpId)
      .eq("branch_id", data.branchId)
      .eq("tenant_id", claims.tenant_id)
      .is("revoked_at", null);

    if (error) {
      return { success: false, error: "Không thể thu hồi IP này." };
    }

    revalidateSurfacePath("/admin/settings/branches");
    return { success: true };
  },
);
