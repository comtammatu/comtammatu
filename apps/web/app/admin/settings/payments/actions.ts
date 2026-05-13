"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { SYSTEM_SETTING_KEYS } from "@comtammatu/shared/settings";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { goFetch } from "@/_lib/go-api";
import { revalidateSurfacePath } from "@/_lib/revalidate-surface";

const SETTINGS_ROLES: readonly StaffRole[] = ["owner", "super_manager"];

const paymentSettingsSchema = z.object({
  [SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_VIETQR]: z.enum(["true", "false"]),
  [SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_MOMO]: z.enum(["true", "false"]),
  [SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_BANK_CODE]: z
    .string()
    .trim()
    .max(32)
    .regex(/^[A-Za-z0-9]*$/, {
      error: "Mã ngân hàng chỉ chứa chữ và số (vd: TCB, VCB, 970407).",
    }),
  [SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NO]: z
    .string()
    .trim()
    .max(32)
    .regex(/^[A-Za-z0-9]*$/, {
      error: "Số tài khoản chỉ chứa chữ và số (không khoảng trắng).",
    }),
  [SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NAME]: z.string().trim().max(64),
});

export async function updatePaymentSettings(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const str = (k: string) => (formData.get(k) ?? "").toString();
  const raw = {
    [SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_VIETQR]:
      formData.get(SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_VIETQR) === "true"
        ? "true"
        : "false",
    [SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_MOMO]:
      formData.get(SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_MOMO) === "true"
        ? "true"
        : "false",
    [SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_BANK_CODE]: str(
      SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_BANK_CODE,
    ).toUpperCase(),
    [SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NO]: str(
      SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NO,
    ),
    [SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NAME]: str(
      SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NAME,
    ).toUpperCase(),
  };

  const parsed = paymentSettingsSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithPermission(
    SETTINGS_ROLES,
    PERMISSION_KEYS.SETTINGS_TENANT,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  // Resolve the live session so its access_token can be forwarded to Go.
  // ctx came from getAuthContext but only exposes claims; ask the Supabase
  // client for the session again — getSession() is a cookie read so this is
  // cheap (no extra HTTP roundtrip).
  const { data: sessionRes } = await ctx.supabase.auth.getSession();
  const session = sessionRes.session;
  if (!session) return { success: false, error: "Phiên đăng nhập đã hết hạn" };

  // Route the write through the Go BE — owns validation (regex shape checks +
  // role gate) and the atomic system_settings upsert. We keep the Next.js
  // Zod schema as a first-pass guard so the form surfaces field errors
  // locally without a round-trip, but Go is the security boundary.
  const result = await goFetch("/admin/settings/payments", session, {
    method: "PUT",
    body: {
      enable_vietqr:
        parsed.data[SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_VIETQR] === "true",
      enable_momo:
        parsed.data[SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_MOMO] === "true",
      vietqr_bank_code:
        parsed.data[SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_BANK_CODE],
      vietqr_account_no:
        parsed.data[SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NO],
      vietqr_account_name:
        parsed.data[SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NAME],
    },
  });
  if (!result.ok) {
    return {
      success: false,
      error:
        result.error.status === 422
          ? result.error.message
          : "Không thể lưu cài đặt. Vui lòng thử lại.",
    };
  }

  revalidateSurfacePath("/admin/settings/payments");
  // POS RSC seeds `paymentMethods` + `vietQrConfig` once per nav (see
  // `apps/web/app/br/[branchId]/pos/page.tsx`). Bust that seed across all
  // branches when tenant payment config changes — both the route cache
  // and the tag-keyed unstable_cache the POS Server Actions read from.
  revalidatePath("/br/[branchId]/pos", "page");
  updateTag("payment-config");
  return { success: true };
}
