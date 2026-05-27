"use server";

import {
  createQrCodeSchema,
  updateQrCodeLabelSchema,
  toggleQrCodeSchema,
  rotateQrCodeSchema,
  generateFeedbackToken,
  buildQrLabel,
} from "@comtammatu/shared/feedback";
import { getAuthContext } from "@/_lib/auth";
import type { ActionResult } from "@comtammatu/shared/types";

const OWNER_ONLY: readonly ["owner"] = ["owner"];

export async function createQrCode(
  input: unknown,
): Promise<ActionResult<{ id: number; token: string }>> {
  const ctx = await getAuthContext(OWNER_ONLY);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const parsed = createQrCodeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const { branch_id, table_id } = parsed.data;
  const { supabase, claims } = ctx;

  // Fetch branch name
  const { data: branch } = await supabase
    .from("branches")
    .select("name")
    .eq("id", branch_id)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  if (!branch) {
    return { success: false, error: "Chi nhánh không hợp lệ" };
  }

  // Fetch table label if provided. The `tables` table has `number` (smallint),
  // not `name` — display as "Bàn 5" via buildQrLabel.
  let tableLabel: string | null = null;
  if (table_id !== null) {
    const { data: table } = await supabase
      .from("tables")
      .select("number")
      .eq("id", table_id)
      .maybeSingle();
    tableLabel = table?.number != null ? String(table.number) : null;
  }

  const label = buildQrLabel({
    branch_name: branch.name,
    table_label: tableLabel,
  });
  const token = generateFeedbackToken();

  const { data: created, error } = await supabase
    .from("feedback_qr_codes")
    .insert({
      tenant_id: claims.tenant_id,
      branch_id,
      table_id: table_id ?? null,
      token,
      label,
    })
    .select("id")
    .single();

  if (error || !created) {
    console.error("[createQrCode] insert error", error?.code);
    return { success: false, error: "Không thể tạo QR. Vui lòng thử lại." };
  }

  return { success: true, data: { id: created.id, token } };
}

export async function updateQrCodeLabel(input: unknown): Promise<ActionResult> {
  const ctx = await getAuthContext(OWNER_ONLY);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const parsed = updateQrCodeLabelSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const { id, label } = parsed.data;
  const { supabase, claims } = ctx;

  const { error } = await supabase
    .from("feedback_qr_codes")
    .update({ label })
    .eq("id", id)
    .eq("tenant_id", claims.tenant_id);

  if (error) {
    return { success: false, error: "Không thể cập nhật nhãn." };
  }

  return { success: true };
}

export async function toggleQrCode(input: unknown): Promise<ActionResult> {
  const ctx = await getAuthContext(OWNER_ONLY);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const parsed = toggleQrCodeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const { id, is_active } = parsed.data;
  const { supabase, claims } = ctx;

  const { error } = await supabase
    .from("feedback_qr_codes")
    .update({ is_active })
    .eq("id", id)
    .eq("tenant_id", claims.tenant_id);

  if (error) {
    return { success: false, error: "Không thể cập nhật trạng thái QR." };
  }

  return { success: true };
}

export async function rotateQrCode(
  input: unknown,
): Promise<ActionResult<{ token: string }>> {
  const ctx = await getAuthContext(OWNER_ONLY);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const parsed = rotateQrCodeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const { id } = parsed.data;
  const { supabase, claims } = ctx;

  // Retry up to 3 times to avoid token collision
  let newToken: string | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const candidate = generateFeedbackToken();
    const { data: existing } = await supabase
      .from("feedback_qr_codes")
      .select("id")
      .eq("token", candidate)
      .maybeSingle();
    if (!existing) {
      newToken = candidate;
      break;
    }
  }

  if (!newToken) {
    console.error(
      "[rotateQrCode] failed to generate unique token after 3 attempts",
    );
    return { success: false, error: "Không thể xoay token. Vui lòng thử lại." };
  }

  const { error } = await supabase
    .from("feedback_qr_codes")
    .update({
      token: newToken,
      rotated_at: new Date().toISOString(),
      is_active: true,
    })
    .eq("id", id)
    .eq("tenant_id", claims.tenant_id);

  if (error) {
    return { success: false, error: "Không thể xoay token." };
  }

  return { success: true, data: { token: newToken } };
}
