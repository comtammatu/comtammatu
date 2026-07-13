"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { getVNDateString } from "@comtammatu/shared/time";
import type { ActionResult } from "@comtammatu/shared/types";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";

const PROFILE_AVATAR_BUCKET = "menu-images";
const MAX_AVATAR_BYTES = 1_500_000;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const AVATAR_MIME_TO_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

const optionalBirthDate = optionalText.refine(
  (value) => !value || (isISODate(value) && value <= getVNDateString()),
  { error: "Ngày sinh không hợp lệ" },
);

const profileSchema = z.object({
  fullName: z.string().trim().min(1, { error: "Họ tên không được để trống" }),
  phone: optionalText,
  birthDate: optionalBirthDate,
  branchId: z.number().int().positive().nullable().optional(),
});

export type UpdateMyProfileInput = z.infer<typeof profileSchema>;

function isISODate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return false;
  return date.toISOString().slice(0, 10) === value;
}

function isAvatarMime(mime: string): mime is keyof typeof AVATAR_MIME_TO_EXT {
  return Object.hasOwn(AVATAR_MIME_TO_EXT, mime);
}

function revalidateProfilePath(branchId?: number | null) {
  revalidatePath("/br");
  if (typeof branchId === "number") revalidatePath(`/br/${branchId}/profile`);
}

export async function updateMyProfile(
  input: UpdateMyProfileInput,
): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const { supabase } = await loadAuthState();
  const { fullName, phone, birthDate, branchId } = parsed.data;
  const { error } = await supabase.rpc("update_my_profile", {
    p_full_name: fullName,
    p_phone: phone,
    p_birth_date: birthDate,
  });

  if (error) return { success: false, error: "Không thể cập nhật hồ sơ" };

  revalidateProfilePath(branchId);
  return { success: true };
}

export async function uploadMyAvatar(
  formData: FormData,
): Promise<ActionResult<{ avatarUrl: string }>> {
  const { user, claims, supabase } = await loadAuthState();
  const branchId = z.coerce
    .number()
    .int()
    .positive()
    .nullable()
    .optional()
    .catch(null)
    .parse(formData.get("branchId"));
  const avatar = formData.get("avatar");

  if (!(avatar instanceof File) || avatar.size <= 0) {
    return { success: false, error: "Chọn một ảnh đại diện." };
  }
  if (!isAvatarMime(avatar.type)) {
    return {
      success: false,
      error: "Ảnh đại diện chỉ nhận JPG, PNG hoặc WebP.",
    };
  }
  if (avatar.size > MAX_AVATAR_BYTES) {
    return { success: false, error: "Ảnh quá lớn. Vui lòng chọn ảnh nhẹ hơn." };
  }

  const ext = AVATAR_MIME_TO_EXT[avatar.type];
  const path = `${claims.tenant_id}/avatars/${user.id}/${randomUUID()}.${ext}`;
  const bytes = Buffer.from(await avatar.arrayBuffer());
  const service = createServiceClient();
  const { error: uploadError } = await service.storage
    .from(PROFILE_AVATAR_BUCKET)
    .upload(path, bytes, {
      cacheControl: "31536000, immutable",
      contentType: avatar.type,
      upsert: false,
    });

  if (uploadError) {
    return {
      success: false,
      error: messages.employee.profile.avatarUploadError,
    };
  }

  const { data } = service.storage
    .from(PROFILE_AVATAR_BUCKET)
    .getPublicUrl(path);
  const publicUrl = data.publicUrl;
  const { error: profileError } = await supabase.rpc("update_my_profile", {
    p_avatar_url: publicUrl,
  });

  if (profileError) {
    await service.storage.from(PROFILE_AVATAR_BUCKET).remove([path]);
    return { success: false, error: "Không thể cập nhật ảnh đại diện." };
  }

  revalidateProfilePath(branchId);
  return { success: true, data: { avatarUrl: publicUrl } };
}
