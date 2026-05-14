"use server";

import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import { revalidateSurfacePath } from "@/_lib/revalidate-surface";
import { withAction, withFormAction } from "@/_lib/with-action";
import { goFetch } from "@/_lib/go-api";

// Go BE owns the branches CRUD writes (US-512 branches sub-slice). Locale-
// neutral error keys from the Go BE map to existing Vietnamese strings here;
// keep these in sync with backend/internal/handler/settings/handler.go.
function mapGoBranchError(message: string): string {
  if (message === "duplicate_name") return "Tên điểm vận hành đã tồn tại";
  if (message === "invalid_branch_kind") return "Loại điểm vận hành không hợp lệ";
  if (message === "branch not found") return "Điểm vận hành không tồn tại";
  return "Không thể thực hiện. Vui lòng thử lại.";
}

const SESSION_EXPIRED_ERROR = "Phiên đăng nhập đã hết hạn";

const SETTINGS_ROLES: StaffRole[] = ["owner", "super_manager"];

/* ─── Schemas ─── */

const optionalText = z.preprocess(
  (value) => (value === null ? undefined : value),
  z.string().optional().default(""),
);

const branchSchema = z.object({
  name: z.string().min(1, { error: "Tên điểm vận hành không được để trống" }),
  address: optionalText,
  phone: optionalText,
  branchKind: z.enum(["branch", "central_kitchen", "central_warehouse"]).default("branch"),
});

const updateBranchSchema = branchSchema.extend({
  id: z.coerce.number().int().positive(),
});

const toggleIdSchema = z.object({
  id: z.coerce.number().int().positive({ error: "ID không hợp lệ" }),
});

/* ─── Actions ─── */

export const createBranch = withFormAction(
  {
    roles: SETTINGS_ROLES,
    schema: branchSchema,
    extract: (fd) => ({
      name: fd.get("name"),
      address: fd.get("address"),
      phone: fd.get("phone"),
      branchKind: fd.get("branchKind"),
    }),
  },
  async (data, { supabase }) => {
    const { data: sessionRes } = await supabase.auth.getSession();
    const session = sessionRes.session;
    if (!session) return { success: false, error: SESSION_EXPIRED_ERROR };

    const result = await goFetch("/admin/settings/branches", session, {
      method: "POST",
      body: {
        name: data.name,
        address: data.address,
        phone: data.phone,
        branch_kind: data.branchKind,
      },
    });
    if (!result.ok) {
      return { success: false, error: mapGoBranchError(result.error.message) };
    }

    revalidateSurfacePath("/admin/settings/branches");
    return { success: true };
  },
);

export const updateBranch = withFormAction(
  {
    roles: SETTINGS_ROLES,
    schema: updateBranchSchema,
    extract: (fd) => ({
      id: fd.get("id"),
      name: fd.get("name"),
      address: fd.get("address"),
      phone: fd.get("phone"),
      branchKind: fd.get("branchKind"),
    }),
  },
  async (data, { supabase }) => {
    const { data: sessionRes } = await supabase.auth.getSession();
    const session = sessionRes.session;
    if (!session) return { success: false, error: SESSION_EXPIRED_ERROR };

    const result = await goFetch(`/admin/settings/branches/${data.id}`, session, {
      method: "PUT",
      body: {
        name: data.name,
        address: data.address,
        phone: data.phone,
        branch_kind: data.branchKind,
      },
    });
    if (!result.ok) {
      return { success: false, error: mapGoBranchError(result.error.message) };
    }

    revalidateSurfacePath("/admin/settings/branches");
    return { success: true };
  },
);

export const toggleBranchActive = withAction(
  {
    roles: SETTINGS_ROLES,
    schema: toggleIdSchema,
    permission: PERMISSION_KEYS.SETTINGS_TENANT,
  },
  async (data, { supabase }) => {
    const { data: sessionRes } = await supabase.auth.getSession();
    const session = sessionRes.session;
    if (!session) return { success: false, error: SESSION_EXPIRED_ERROR };

    // Atomic flip via Go BE replaces the legacy select-then-update TOCTOU
    // pattern (two round trips that could disagree under concurrent edits).
    const result = await goFetch(
      `/admin/settings/branches/${data.id}/toggle-active`,
      session,
      { method: "PATCH" },
    );
    if (!result.ok) {
      return { success: false, error: mapGoBranchError(result.error.message) };
    }

    revalidateSurfacePath("/admin/settings/branches");
    return { success: true };
  },
);

