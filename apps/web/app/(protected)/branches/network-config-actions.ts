"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import { revalidateSurfacePath } from "@/_lib/revalidate-surface";
import { type ActionContext, withAction } from "@/_lib/with-action";
import { getClientIp } from "@lib/network/client-ip";

const OWNER_NETWORK_ROLES: StaffRole[] = ["owner"];

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

  if (error) {
    console.error("[branches/network-config-actions:branchBelongsToTenant] Check branch owner error:", error);
  }

  return !error && data !== null;
}

export const listTrustedIps = withAction(
  {
    roles: OWNER_NETWORK_ROLES,
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
      console.error("[branches/network-config-actions:listTrustedIps] Fetch trusted IPs error:", error);
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
 * its first heartbeat. Owner must be physically on the branch wifi when
 * clicking — the IP is read server-side from the request headers, not the
 * body.
 */
export const trustCurrentIp = withAction(
  {
    roles: OWNER_NETWORK_ROLES,
    schema: branchIdSchema,
    permission: PERMISSION_KEYS.SETTINGS_BRANCH_NETWORK,
    permissionBranchId: (data) => data.branchId,
  },
  async (data, { supabase, claims, userId }) => {
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
        registered_by_user: userId,
        last_seen_at: new Date().toISOString(),
        revoked_at: null,
        revoked_by_user: null,
      },
      { onConflict: "tenant_id,branch_id,ip_address" },
    );

    if (error) {
      console.error("[branches/network-config-actions:trustCurrentIp] Upsert trusted IP error:", error);
      return {
        success: false,
        error: "Không thể tin cậy IP này. Vui lòng thử lại.",
      };
    }

    revalidateSurfacePath("/branches");
    return { success: true, data: { ip } };
  },
);

/**
 * Soft-revoke a trusted IP. Sets revoked_at; row stays for audit trail.
 * Cashier devices on this IP get blocked on next request.
 */
export const revokeTrustedIp = withAction(
  {
    roles: OWNER_NETWORK_ROLES,
    schema: revokeSchema,
    permission: PERMISSION_KEYS.SETTINGS_BRANCH_NETWORK,
    permissionBranchId: (data) => data.branchId,
  },
  async (data, { supabase, claims, userId }) => {
    if (
      !(await branchBelongsToTenant(supabase, claims.tenant_id, data.branchId))
    ) {
      return { success: false, error: "Chi nhánh không hợp lệ." };
    }

    const { error } = await supabase
      .from("branch_trusted_egress_ips")
      .update({
        revoked_at: new Date().toISOString(),
        revoked_by_user: userId,
      })
      .eq("id", data.trustedIpId)
      .eq("branch_id", data.branchId)
      .eq("tenant_id", claims.tenant_id)
      .is("revoked_at", null);

    if (error) {
      console.error("[branches/network-config-actions:revokeTrustedIp] Update trusted IP to revoked error:", error);
      return { success: false, error: "Không thể thu hồi IP này." };
    }

    revalidateSurfacePath("/branches");
    return { success: true };
  },
);

export const NETWORK_GATE_BYPASS_DURATION_KINDS = [
  "1h",
  "2h",
  "4h",
  "pos_shift",
  "business_day",
] as const;

export type NetworkGateBypassDurationKind =
  (typeof NETWORK_GATE_BYPASS_DURATION_KINDS)[number];

export interface NetworkGateBypassRow {
  id: number;
  duration_kind: NetworkGateBypassDurationKind;
  expires_at: string;
  bound_pos_session_id: number | null;
  activated_at: string;
  revoked_at: string | null;
}

const CLOCK_DURATION_MS: Record<"1h" | "2h" | "4h", number> = {
  "1h": 60 * 60_000,
  "2h": 2 * 60 * 60_000,
  "4h": 4 * 60 * 60_000,
};

const POS_SHIFT_SAFETY_MS = 16 * 60 * 60_000;

const activateBypassSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  durationKind: z.enum(NETWORK_GATE_BYPASS_DURATION_KINDS),
  note: z.string().trim().max(200).optional(),
});

function isActiveBypass(
  row: Pick<NetworkGateBypassRow, "revoked_at" | "expires_at">,
  nowMs = Date.now(),
): boolean {
  if (row.revoked_at !== null) return false;
  return new Date(row.expires_at).getTime() > nowMs;
}

export const getNetworkGateBypass = withAction(
  {
    roles: OWNER_NETWORK_ROLES,
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

    const { data: row, error } = await supabase
      .from("branch_network_gate_bypasses")
      .select(
        "id, duration_kind, expires_at, bound_pos_session_id, activated_at, revoked_at",
      )
      .eq("branch_id", data.branchId)
      .eq("tenant_id", claims.tenant_id)
      .is("revoked_at", null)
      .order("activated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(
        "[branches/network-config-actions:getNetworkGateBypass] Fetch bypass error:",
        error,
      );
      return { success: false, error: "Không tải được trạng thái bypass khẩn cấp." };
    }

    if (!row || !isActiveBypass(row)) {
      return { success: true, data: null };
    }

    if (row.bound_pos_session_id != null) {
      const { data: session } = await supabase
        .from("pos_sessions")
        .select("id")
        .eq("id", row.bound_pos_session_id)
        .eq("status", "open")
        .maybeSingle();
      if (!session) {
        return { success: true, data: null };
      }
    }

    return {
      success: true,
      data: row as NetworkGateBypassRow,
    };
  },
);

export const activateNetworkGateBypass = withAction(
  {
    roles: OWNER_NETWORK_ROLES,
    schema: activateBypassSchema,
    permission: PERMISSION_KEYS.SETTINGS_BRANCH_NETWORK,
    permissionBranchId: (data) => data.branchId,
  },
  async (data, { supabase, claims, userId }) => {
    if (
      !(await branchBelongsToTenant(supabase, claims.tenant_id, data.branchId))
    ) {
      return { success: false, error: "Chi nhánh không hợp lệ." };
    }

    const now = new Date();
    let expiresAt: Date;
    let boundPosSessionId: number | null = null;

    if (
      data.durationKind === "1h" ||
      data.durationKind === "2h" ||
      data.durationKind === "4h"
    ) {
      expiresAt = new Date(now.getTime() + CLOCK_DURATION_MS[data.durationKind]);
    } else if (data.durationKind === "pos_shift") {
      const { data: openSession, error: sessionError } = await supabase
        .from("pos_sessions")
        .select("id")
        .eq("branch_id", data.branchId)
        .eq("tenant_id", claims.tenant_id)
        .eq("status", "open")
        .maybeSingle();

      if (sessionError) {
        console.error(
          "[branches/network-config-actions:activateNetworkGateBypass] Open session lookup error:",
          sessionError,
        );
        return { success: false, error: "Không kiểm tra được ca POS đang mở." };
      }
      if (!openSession) {
        return {
          success: false,
          error: "Chưa có ca POS đang mở. Mở ca POS trước rồi bật bypass Ca POS.",
        };
      }
      boundPosSessionId = openSession.id;
      expiresAt = new Date(now.getTime() + POS_SHIFT_SAFETY_MS);
    } else {
      const { data: businessDate, error: dateError } = await supabase.rpc(
        "branch_business_date",
        { p_branch_id: data.branchId, p_at: now.toISOString() },
      );
      if (dateError || !businessDate) {
        console.error(
          "[branches/network-config-actions:activateNetworkGateBypass] business_date error:",
          dateError,
        );
        return { success: false, error: "Không tính được ngày kinh doanh chi nhánh." };
      }

      const { data: bounds, error: boundsError } = await supabase.rpc(
        "branch_business_day_bounds",
        {
          p_branch_id: data.branchId,
          p_business_date: businessDate,
        },
      );
      const dayEnd = bounds?.[0]?.day_end;
      if (boundsError || !dayEnd) {
        console.error(
          "[branches/network-config-actions:activateNetworkGateBypass] day_bounds error:",
          boundsError,
        );
        return { success: false, error: "Không tính được hạn bypass theo ngày." };
      }
      expiresAt = new Date(dayEnd);
      if (expiresAt.getTime() <= now.getTime()) {
        return {
          success: false,
          error: "Ngày kinh doanh hiện tại đã kết thúc. Thử lại sau 04:00.",
        };
      }
    }

    const revokeOpen = await supabase
      .from("branch_network_gate_bypasses")
      .update({
        revoked_at: now.toISOString(),
        revoked_by: userId,
      })
      .eq("branch_id", data.branchId)
      .eq("tenant_id", claims.tenant_id)
      .is("revoked_at", null);

    if (revokeOpen.error) {
      console.error(
        "[branches/network-config-actions:activateNetworkGateBypass] Revoke prior open error:",
        revokeOpen.error,
      );
      return { success: false, error: "Không thể thay bypass đang mở." };
    }

    const { data: inserted, error } = await supabase
      .from("branch_network_gate_bypasses")
      .insert({
        tenant_id: claims.tenant_id,
        branch_id: data.branchId,
        duration_kind: data.durationKind,
        expires_at: expiresAt.toISOString(),
        bound_pos_session_id: boundPosSessionId,
        activated_by: userId,
        activated_at: now.toISOString(),
        note: data.note?.length ? data.note : null,
      })
      .select(
        "id, duration_kind, expires_at, bound_pos_session_id, activated_at, revoked_at",
      )
      .single();

    if (error || !inserted) {
      console.error(
        "[branches/network-config-actions:activateNetworkGateBypass] Insert error:",
        error,
      );
      return { success: false, error: "Không bật được bypass khẩn cấp." };
    }

    revalidateSurfacePath("/branches");
    return { success: true, data: inserted as NetworkGateBypassRow };
  },
);

export const revokeNetworkGateBypass = withAction(
  {
    roles: OWNER_NETWORK_ROLES,
    schema: branchIdSchema,
    permission: PERMISSION_KEYS.SETTINGS_BRANCH_NETWORK,
    permissionBranchId: (data) => data.branchId,
  },
  async (data, { supabase, claims, userId }) => {
    if (
      !(await branchBelongsToTenant(supabase, claims.tenant_id, data.branchId))
    ) {
      return { success: false, error: "Chi nhánh không hợp lệ." };
    }

    const { error } = await supabase
      .from("branch_network_gate_bypasses")
      .update({
        revoked_at: new Date().toISOString(),
        revoked_by: userId,
      })
      .eq("branch_id", data.branchId)
      .eq("tenant_id", claims.tenant_id)
      .is("revoked_at", null);

    if (error) {
      console.error(
        "[branches/network-config-actions:revokeNetworkGateBypass] Revoke error:",
        error,
      );
      return { success: false, error: "Không đóng được bypass khẩn cấp." };
    }

    revalidateSurfacePath("/branches");
    return { success: true };
  },
);
