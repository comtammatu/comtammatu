"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import {
  PERMISSION_KEYS,
  TENANT_STRATEGY_SETTINGS_ROLES,
} from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { SYSTEM_SETTING_KEYS } from "@comtammatu/shared/settings";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { revalidateSurfacePath } from "@/_lib/revalidate-surface";

const paymentContentTokenSchema = z
  .string()
  .trim()
  .min(2)
  .max(16)
  .regex(/^[A-Za-z0-9]+$/, {
    error: "Mã nội dung chỉ chứa chữ và số, không khoảng trắng.",
  });

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
  [SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_CODE_PREFIX]: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Za-z0-9 ]+$/, {
      error: "Tiền tố chỉ chứa chữ, số và khoảng trắng.",
  }),
  [SYSTEM_SETTING_KEYS.PAYMENT_CONTENT_PREFIX]: paymentContentTokenSchema,
  [SYSTEM_SETTING_KEYS.PAYMENT_CONTENT_EXPENSE_TOKEN]:
    paymentContentTokenSchema,
  [SYSTEM_SETTING_KEYS.PAYMENT_CONTENT_CASH_DEPOSIT_TOKEN]:
    paymentContentTokenSchema,
});

export async function updatePaymentSettings(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const str = (k: string) => (formData.get(k) ?? "").toString();
  const contentToken = (k: string) => str(k).toUpperCase().replace(/\s+/g, "");
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
    [SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_CODE_PREFIX]: str(
      SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_CODE_PREFIX,
    )
      .toUpperCase()
      .replace(/\s+/g, " ")
      .trim(),
    [SYSTEM_SETTING_KEYS.PAYMENT_CONTENT_PREFIX]: contentToken(
      SYSTEM_SETTING_KEYS.PAYMENT_CONTENT_PREFIX,
    ),
    [SYSTEM_SETTING_KEYS.PAYMENT_CONTENT_EXPENSE_TOKEN]: contentToken(
      SYSTEM_SETTING_KEYS.PAYMENT_CONTENT_EXPENSE_TOKEN,
    ),
    [SYSTEM_SETTING_KEYS.PAYMENT_CONTENT_CASH_DEPOSIT_TOKEN]: contentToken(
      SYSTEM_SETTING_KEYS.PAYMENT_CONTENT_CASH_DEPOSIT_TOKEN,
    ),
  };

  const parsed = paymentSettingsSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const contentTokens = [
    parsed.data[SYSTEM_SETTING_KEYS.PAYMENT_CONTENT_EXPENSE_TOKEN],
    parsed.data[SYSTEM_SETTING_KEYS.PAYMENT_CONTENT_CASH_DEPOSIT_TOKEN],
  ];
  if (new Set(contentTokens).size !== contentTokens.length) {
    return {
      success: false,
      error: "Hai mã CHI và NOP phải khác nhau để SePay không nhận nhầm.",
    };
  }

  // Block enabling VietQR without a fully-configured payee in Admin settings.
  if (parsed.data[SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_VIETQR] === "true") {
    const effective = {
      bankCode: parsed.data[SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_BANK_CODE],
      accountNo: parsed.data[SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NO],
      accountName: parsed.data[SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NAME],
    };
    if (!effective.bankCode || !effective.accountNo || !effective.accountName) {
      return {
        success: false,
        error:
          "Cần điền đủ ngân hàng, số tài khoản và tên chủ tài khoản trước khi bật VietQR.",
      };
    }
  }

  const ctx = await getAuthContextWithPermission(
    TENANT_STRATEGY_SETTINGS_ROLES,
    PERMISSION_KEYS.SETTINGS_TENANT,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;

  const entries = Object.entries(parsed.data) as [string, string][];
  for (const [key, value] of entries) {
    const { error } = await supabase
      .from("system_settings")
      .upsert(
        { tenant_id: claims.tenant_id, key, value },
        { onConflict: "key,tenant_id" },
      );

    if (error) {
      return {
        success: false,
        error: "Không thể lưu cài đặt. Vui lòng thử lại.",
      };
    }
  }

  revalidateSurfacePath("/admin/settings/payments");
  // POS RSC seeds payment methods and VietQR payee data once per nav. Bust
  // that seed across all branches when tenant payment config changes, plus
  // the tag-keyed unstable_cache the POS Server Actions read from.
  revalidatePath("/br/[branchId]/pos", "page");
  updateTag("payment-config");
  return { success: true };
}
